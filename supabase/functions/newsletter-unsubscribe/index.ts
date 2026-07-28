// Newsletter unsubscribe (Deno/Supabase Edge). Public, token-based -- called
// by the /newsletter/unsubscribe page when someone clicks the link in an
// email. No auth beyond possessing the token, same model as any mailing
// list unsubscribe link.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });

  let token = "";
  try {
    const body = await req.json();
    token = String(body.token || "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { data, error } = await sb
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("unsubscribed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("newsletter-unsubscribe error", error.message);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // No matching row is still a success from the user's perspective -- either
  // an invalid link or they were already unsubscribed. Never error here.
  return new Response(JSON.stringify({ success: true, wasSubscribed: !!data }), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
