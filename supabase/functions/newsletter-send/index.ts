// Newsletter send (Deno/Supabase Edge). Admin-only -- triggered by the "Send
// Newsletter" button in BlogAdmin.jsx for one specific post. This is the
// only mass-send path in the project; everything else here is 1:1 email
// (contact form, welcome email).
//
// Auth mirrors api/blog-admin.js: verify the caller's Supabase JWT belongs
// to an address in ADMIN_EMAILS. That env var already exists on Vercel for
// the same purpose -- it's duplicated here as a Supabase secret since Edge
// Functions and Vercel don't share an env store.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const FROM_EMAIL = "ShinyPull <newsletter@shinypull.com>";
const SITE_URL = "https://shinypull.com";

const ALLOWED_ORIGINS = new Set([
  "https://shinypull.com",
  "https://www.shinypull.com",
  "http://localhost:3000",
  "http://localhost:3001",
]);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]!));
}

function buildEmailHtml(post: { title: string; description: string; image: string | null; slug: string }, unsubscribeUrl: string) {
  const postUrl = `${SITE_URL}/blog/${post.slug}`;
  return `
  <div style="background:#fafaf9;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
      ${post.image ? `<img src="${escapeHtml(post.image)}" alt="" style="width:100%;height:220px;object-fit:cover;display:block;" />` : ""}
      <div style="padding:32px;">
        <p style="margin:0 0 16px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#a8a29e;">New on ShinyPull</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700;color:#1c1917;letter-spacing:-0.01em;">${escapeHtml(post.title)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#44403c;">${escapeHtml(post.description)}</p>
        <a href="${postUrl}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;">
          Read the full post
        </a>
        <p style="margin:32px 0 0;font-size:12px;color:#a8a29e;">
          You're getting this because you subscribed to ShinyPull updates. <a href="${unsubscribeUrl}" style="color:#a8a29e;">Unsubscribe</a>.
        </p>
      </div>
    </div>
  </div>`;
}

async function verifyAdmin(req: Request): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, error: "Missing authorization header", status: 401 };
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return { ok: false, error: "Invalid or expired token", status: 401 };
  if (!ADMIN_EMAILS.includes(user.email!.trim().toLowerCase())) {
    return { ok: false, error: "Forbidden: admin access required", status: 403 };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });

  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let postId = "";
  try {
    const body = await req.json();
    postId = String(body.postId || "");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!postId) {
    return new Response(JSON.stringify({ error: "Missing postId" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { data: post, error: postError } = await sb
    .from("blog_posts")
    .select("id, title, description, image, slug, is_published, newsletter_sent_at")
    .eq("id", postId)
    .maybeSingle();

  if (postError || !post) {
    return new Response(JSON.stringify({ error: "Post not found" }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!post.is_published) {
    return new Response(JSON.stringify({ error: "Post must be published before sending" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (post.newsletter_sent_at) {
    return new Response(JSON.stringify({ error: `Already sent on ${post.newsletter_sent_at}` }), {
      status: 409,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Paginate the full active list -- PostgREST caps a single response at 1000.
  const subscribers: { email: string; unsubscribe_token: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("newsletter_subscribers")
      .select("email, unsubscribe_token")
      .is("unsubscribed_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) {
      return new Response(JSON.stringify({ error: "Failed to load subscribers" }), {
        status: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    subscribers.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  if (subscribers.length === 0) {
    await sb.from("blog_posts").update({ newsletter_sent_at: new Date().toISOString() }).eq("id", postId);
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  const chunkSize = 100; // Resend batch endpoint max
  for (let i = 0; i < subscribers.length; i += chunkSize) {
    const chunk = subscribers.slice(i, i + chunkSize);
    const payload = chunk.map((s) => ({
      from: FROM_EMAIL,
      to: s.email,
      subject: post.title,
      html: buildEmailHtml(post, `${SITE_URL}/newsletter/unsubscribe?token=${s.unsubscribe_token}`),
    }));

    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      sent += chunk.length;
    } else {
      const errText = await res.text();
      console.error("resend batch send failed", res.status, errText);
      // Stop rather than silently under-report a partial failure as success.
      break;
    }
  }

  const fullySent = sent === subscribers.length;
  if (fullySent) {
    await sb.from("blog_posts").update({ newsletter_sent_at: new Date().toISOString() }).eq("id", postId);
  }
  // Partial failure: deliberately leave newsletter_sent_at null rather than
  // mark it done. A retry may re-email some subscribers from the first
  // batch, but that's a smaller problem than the admin believing every
  // subscriber got the post when only some did.

  return new Response(JSON.stringify({ sent, total: subscribers.length, complete: fullySent }), {
    status: fullySent ? 200 : 207,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
