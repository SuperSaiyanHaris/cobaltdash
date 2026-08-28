// User admin (Deno/Supabase Edge). Admin-only -- backs the Users tab on
// /admin and the /admin/users/:id detail page. `public.users` is RLS-locked
// to each authenticated user's own row (auth.uid() = id), and there's no
// broad-read policy for admins, so this is the only path that can list or
// inspect other people's accounts.
//
// Auth mirrors newsletter-admin/index.ts / api/blog-admin.js: verify the
// caller's Supabase JWT belongs to an address in ADMIN_EMAILS.
//
// public.users and auth.users can drift (a handful of accounts only exist
// in auth.users, created before the on_auth_user_created trigger existed or
// via some path that skipped it) so `list` and `detail` both source the
// account list from auth.users (via the admin API) and left-join
// public.users for the profile extras, never the other way around.

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

// Effectively-permanent suspension. Supabase's ban API has no literal
// "forever" value, "none" is the only special-cased unban string.
const SUSPEND_DURATION = "876000h"; // 100 years

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

function isSuspended(bannedUntil: string | null | undefined) {
  return !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();
}

async function listAllAuthUsers() {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 200) break;
  }
  return all;
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
    try {
      const authUsers = await listAllAuthUsers();

      const { data: profiles, error: profilesError } = await sb
        .from("users")
        .select("id, display_name, avatar_url, created_at");
      if (profilesError) throw profilesError;
      const profileById = new Map((profiles || []).map((p) => [p.id, p]));

      const { data: listings, error: listingsError } = await sb
        .from("featured_listings")
        .select("purchased_by_user_id, status");
      if (listingsError) throw listingsError;
      const activeListingCounts = new Map<string, number>();
      for (const l of listings || []) {
        if (l.status !== "active") continue;
        activeListingCounts.set(l.purchased_by_user_id, (activeListingCounts.get(l.purchased_by_user_id) || 0) + 1);
      }

      const { data: follows, error: followsError } = await sb
        .from("user_saved_creators")
        .select("user_id");
      if (followsError) throw followsError;
      const followCounts = new Map<string, number>();
      for (const f of follows || []) {
        followCounts.set(f.user_id, (followCounts.get(f.user_id) || 0) + 1);
      }

      const users = authUsers.map((u: Record<string, unknown>) => {
        const profile = profileById.get(u.id as string);
        const meta = (u.user_metadata || {}) as Record<string, unknown>;
        return {
          id: u.id,
          email: u.email,
          displayName: profile?.display_name || (meta.name as string) || (meta.full_name as string) || null,
          avatarUrl: profile?.avatar_url || (meta.picture as string) || (meta.avatar_url as string) || null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at || null,
          emailConfirmedAt: u.email_confirmed_at || null,
          bannedUntil: u.banned_until || null,
          isSuspended: isSuspended(u.banned_until as string | null),
          activeListingsCount: activeListingCounts.get(u.id as string) || 0,
          followsCount: followCounts.get(u.id as string) || 0,
        };
      }).sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

      return json({ users, total: users.length }, 200, origin);
    } catch (err) {
      console.error("admin-users list error:", err);
      return json({ error: "Failed to load users" }, 500, origin);
    }
  }

  if (action === "detail") {
    const userId = String(body.userId || "");
    if (!userId) return json({ error: "Missing userId" }, 400, origin);
    try {
      const { data: authData, error: authUserError } = await sb.auth.admin.getUserById(userId);
      if (authUserError || !authData?.user) return json({ error: "User not found" }, 404, origin);
      const u = authData.user;
      const meta = (u.user_metadata || {}) as Record<string, unknown>;

      const { data: profile } = await sb
        .from("users")
        .select("id, display_name, avatar_url, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

      const [{ data: listings }, { data: follows }, { data: savedReports }, { data: savedCompares }, { data: creatorRequests }] = await Promise.all([
        sb.from("featured_listings")
          .select("id, platform, placement_tier, status, cancel_at_period_end, active_from, active_until, is_mod_free, created_at, creators(id, username, display_name, profile_image, platform)")
          .eq("purchased_by_user_id", userId)
          .order("created_at", { ascending: false }),
        sb.from("user_saved_creators")
          .select("id, created_at, creators(id, username, display_name, profile_image, platform)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
        sb.from("saved_reports")
          .select("id, name, created_at, updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        sb.from("saved_compares")
          .select("id, name, creators_param, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        sb.from("creator_requests")
          .select("id, platform, username, status, created_at, processed_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      return json({
        user: {
          id: u.id,
          email: u.email,
          displayName: profile?.display_name || (meta.name as string) || (meta.full_name as string) || null,
          avatarUrl: profile?.avatar_url || (meta.picture as string) || (meta.avatar_url as string) || null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at || null,
          emailConfirmedAt: u.email_confirmed_at || null,
          bannedUntil: u.banned_until || null,
          isSuspended: isSuspended(u.banned_until as string | null),
          provider: (u.app_metadata as Record<string, unknown>)?.provider || null,
        },
        listings: listings || [],
        follows: follows || [],
        savedReports: savedReports || [],
        savedCompares: savedCompares || [],
        creatorRequests: creatorRequests || [],
      }, 200, origin);
    } catch (err) {
      console.error("admin-users detail error:", err);
      return json({ error: "Failed to load user" }, 500, origin);
    }
  }

  if (action === "suspend" || action === "unsuspend") {
    const userId = String(body.userId || "");
    if (!userId) return json({ error: "Missing userId" }, 400, origin);
    const { data, error } = await sb.auth.admin.updateUserById(userId, {
      ban_duration: action === "suspend" ? SUSPEND_DURATION : "none",
    });
    if (error) return json({ error: "Failed to update user" }, 500, origin);
    return json({ bannedUntil: data.user?.banned_until || null, isSuspended: isSuspended(data.user?.banned_until) }, 200, origin);
  }

  return json({ error: "Unknown action" }, 400, origin);
});
