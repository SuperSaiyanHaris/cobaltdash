// Newsletter signup (Deno/Supabase Edge). Public endpoint, called directly
// from the browser by NewsletterSignup.jsx.
//
// Why Edge and not Vercel: api/ is already at/over the Hobby 12-function cap
// (see CLAUDE.md), and this is a stateless proxy in front of Resend + our
// own table, exactly the shape CLAUDE.md's decision tree routes to Edge.
//
// newsletter_subscribers is fully RLS-locked (service_role only) -- this
// function is the only writer. Always returns a generic success response
// regardless of whether the email was new, reactivated, or already
// subscribed, so the response never leaks whether an address is on the list.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { emailShell, ctaButton, SITE_URL } from "../_shared/emailTheme.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "ShinyPull <newsletter@shinypull.com>";

const ALLOWED_ORIGINS = new Set([
  "https://shinypull.com",
  "https://www.shinypull.com",
  "http://localhost:3000",
  "http://localhost:3001",
]);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Simple in-memory per-IP throttle. Resets whenever the function cold-starts,
// same imprecision api/_ratelimit.js already accepts elsewhere in this
// project -- good enough to blunt a script kiddie, not meant to be exact.
const recentByIp = new Map<string, number[]>();
function rateLimited(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (recentByIp.get(ip) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  recentByIp.set(ip, hits);
  return hits.length > max;
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function buildWelcomeHtml(unsubscribeUrl: string): string {
  const bullet = (label: string, copy: string) => `
    <tr>
      <td style="padding:0 0 16px;vertical-align:top;width:20px;">
        <span style="display:inline-block;width:6px;height:6px;margin-top:7px;border-radius:999px;background:#1c1917;"></span>
      </td>
      <td style="padding:0 0 16px;vertical-align:top;">
        <p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;"><strong style="color:#1c1917;">${label}.</strong> ${copy}</p>
      </td>
    </tr>`;

  const content = `
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#a8a29e;">Welcome</p>
    <h1 style="margin:0 0 14px;font-size:28px;line-height:1.25;font-weight:800;color:#1c1917;letter-spacing:-0.02em;">You're on the list</h1>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#57534e;">
      From now on, we'll email you whenever there's something worth reading.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px;">
      ${bullet("Creator milestones", "The moments that matter: a channel crossing a big number, a record-setting stream.")}
      ${bullet("Platform data", "What's actually changing on YouTube, Twitch, TikTok, and the rest, backed by real numbers.")}
      ${bullet("Growth breakdowns", "Head-to-heads and trend lines pulled straight from the data we track every day.")}
    </table>
    ${ctaButton(`${SITE_URL}/blog`, "Read the blog")}
  `;

  return emailShell({ contentHtml: content, unsubscribeUrl });
}

async function sendWelcomeEmail(email: string, unsubscribeToken: string) {
  const unsubscribeUrl = `${SITE_URL}/newsletter/unsubscribe?token=${unsubscribeToken}`;
  const html = buildWelcomeHtml(unsubscribeUrl);

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "You're subscribed to ShinyPull",
      html,
      text: `You're subscribed to ShinyPull. You'll get an email whenever we publish something new.\n\nRead the blog: ${SITE_URL}/blog\n\nUnsubscribe: ${unsubscribeUrl}`,
    }),
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests, try again in a minute." }), {
      status: 429,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let email = "";
  try {
    const body = await req.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || email.length > 254 || !emailRegex.test(email)) {
    return new Response(JSON.stringify({ error: "Enter a valid email address." }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    const { data: existing } = await sb
      .from("newsletter_subscribers")
      .select("id, unsubscribed_at, unsubscribe_token")
      .eq("email", email)
      .maybeSingle();

    let shouldSendWelcome = false;
    let token = existing?.unsubscribe_token;

    if (!existing) {
      token = crypto.randomUUID();
      const { error } = await sb.from("newsletter_subscribers").insert({ email, unsubscribe_token: token });
      if (error) throw error;
      shouldSendWelcome = true;
    } else if (existing.unsubscribed_at) {
      const { error } = await sb
        .from("newsletter_subscribers")
        .update({ unsubscribed_at: null })
        .eq("id", existing.id);
      if (error) throw error;
      shouldSendWelcome = true;
    }
    // else: already active, no-op, no duplicate welcome email

    if (shouldSendWelcome && token) {
      // Don't let an email-provider hiccup fail the subscribe itself.
      sendWelcomeEmail(email, token).catch((err) => console.error("welcome email failed", err));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("newsletter-subscribe error", (err as Error).message);
    return new Response(JSON.stringify({ error: "Something went wrong. Try again." }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
