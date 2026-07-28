// Newsletter admin (Deno/Supabase Edge). Admin-only -- backs the Subscribers
// tab on /admin. Lists newsletter_subscribers and lets an admin toggle a
// single row's subscribed status. newsletter_subscribers is fully RLS-locked
// (service_role only), so this is the only admin-facing read path for it.
//
// Auth mirrors newsletter-send.ts / api/blog-admin.js: verify the caller's
// Supabase JWT belongs to an address in ADMIN_EMAILS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

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

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });

  const auth = await verifyAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400, origin);
  }

  const action = String(body.action || "");

  if (action === "list") {
    // Paginate the full list -- PostgREST caps a single response at 1000.
    const rows: { id: string; email: string; subscribed_at: string; unsubscribed_at: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("newsletter_subscribers")
        .select("id, email, subscribed_at, unsubscribed_at")
        .order("subscribed_at", { ascending: false })
        .order("id")
        .range(from, from + 999);
      if (error) return json({ error: "Failed to load subscribers" }, 500, origin);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const active = rows.filter((r) => !r.unsubscribed_at).length;
    return json({ subscribers: rows, total: rows.length, active }, 200, origin);
  }

  if (action === "unsubscribe" || action === "resubscribe") {
    const id = String(body.id || "");
    if (!id) return json({ error: "Missing id" }, 400, origin);
    const { data, error } = await sb
      .from("newsletter_subscribers")
      .update({ unsubscribed_at: action === "unsubscribe" ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id, email, subscribed_at, unsubscribed_at")
      .maybeSingle();
    if (error) return json({ error: "Failed to update subscriber" }, 500, origin);
    if (!data) return json({ error: "Subscriber not found" }, 404, origin);
    return json({ subscriber: data }, 200, origin);
  }

  return json({ error: "Unknown action" }, 400, origin);
});
