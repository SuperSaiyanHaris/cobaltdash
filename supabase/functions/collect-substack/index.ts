// Substack daily stats collection — runs on Supabase Edge (Deno).
//
// WHY EDGE: substack.com blocks GitHub Actions / Vercel datacenter IPs, but NOT
// Supabase's egress (verified). So Substack is collected here, on a daily
// pg_cron schedule, instead of in the Node daily-stats workflow. (Rumble can't
// use this path — Cloudflare challenges Supabase's IPs for rumble.com too.)
//
// Also does discovery and creator-request resolution in the same pass, since
// all three need the identical full-category leaderboard sweep. Before this,
// discoverSubstackCreators.js and processCreatorRequests.js's Substack branch
// both ran on GitHub Actions and were silently blocked the same way collection
// used to be — 0 candidates / 0 resolved requests, every run, no error. Doing
// discovery + request resolution here (where the fetch actually works) instead
// of duplicating a second blocked sweep elsewhere.
//
// Auth: gated by a shared secret header (x-cron-key) rather than a JWT, so the
// pg_cron job can call it without minting a token. Deployed with --no-verify-jwt.
//
// Data model (mirrors collectDailyStats.js#buildSubstackRanking):
//   subscribers = precise freeSubscriberCount when present, else the
//   order-of-magnitude band floor. Rank globally by subs DESC, best leaderboard
//   position ASC. Never write a 0 (data-integrity rule).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_KEY = Deno.env.get("CRON_KEY") || "";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Accept: "application/json" };

const CATEGORIES = [
  { id: 96, slug: "culture" }, { id: 4, slug: "technology" }, { id: 62, slug: "business" },
  { id: 76739, slug: "us-politics" }, { id: 153, slug: "finance" }, { id: 13645, slug: "food" },
  { id: 94, slug: "sports" }, { id: 15417, slug: "art" }, { id: 76740, slug: "world-politics" },
  { id: 103, slug: "news" }, { id: 49715, slug: "fashionandbeauty" }, { id: 11, slug: "music" },
  { id: 223, slug: "faith" }, { id: 76741, slug: "health-politics" },
];
const PAGES_PER_CATEGORY = 8;
const MAX_NEW_PER_RUN = 60; // same cap as the old Node discovery script
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cleanText = (s: unknown) => (s ? String(s).replace(/\s+/g, " ").trim().slice(0, 500) || null : null);

// Precise total subscribers when Substack exposes it, else the band floor.
function subsFor(pub: any): number {
  if (pub.freeSubscriberCount) {
    const n = parseInt(String(pub.freeSubscriberCount).replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return pub.rankingDetailFreeIncludedOrderOfMagnitude || pub.rankingDetailOrderOfMagnitude || 0;
}

function todayNY(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

type RankEntry = { pub: any; bestPosition: number; subs: number; globalRank: number };

async function buildRanking() {
  const byId = new Map<string, { pub: any; bestPosition: number }>();
  for (const cat of CATEGORIES) {
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      try {
        const res = await fetch(`https://substack.com/api/v1/category/public/${cat.id}/paid?page=${page}`, { headers: HEADERS });
        if (!res.ok) break;
        const data = await res.json();
        const pubs = data.publications || [];
        pubs.forEach((pub: any, i: number) => {
          if (!pub.id || !pub.subdomain) return;
          const position = page * 25 + i;
          const ex = byId.get(String(pub.id));
          if (!ex || position < ex.bestPosition) byId.set(String(pub.id), { pub, bestPosition: ex ? Math.min(ex.bestPosition, position) : position });
        });
        await sleep(300);
        if (!data.more || pubs.length === 0) break;
      } catch { break; }
    }
  }
  const ranked = [...byId.values()].map((e) => ({ ...e, subs: subsFor(e.pub) }))
    .sort((a, b) => (b.subs - a.subs) || (a.bestPosition - b.bestPosition));

  const byPlatformId = new Map<string, RankEntry>();
  const bySubdomain = new Map<string, RankEntry>();
  ranked.forEach((r, i) => {
    const entry: RankEntry = { pub: r.pub, bestPosition: r.bestPosition, subs: r.subs, globalRank: i + 1 };
    byPlatformId.set(String(r.pub.id), entry);
    bySubdomain.set(String(r.pub.subdomain).toLowerCase(), entry);
  });
  return { byPlatformId, bySubdomain };
}

async function fetchAllSubstackCreators(supabase: any): Promise<{ id: string; platform_id: string }[]> {
  const creators: { id: string; platform_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    // .order('id') is required — range pagination with no stable sort can
    // repeat/skip rows across pages.
    const { data, error } = await supabase.from("creators").select("id,platform_id").eq("platform", "substack").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    creators.push(...data);
    if (data.length < 1000) break;
  }
  return creators;
}

Deno.serve(async (req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) {
    return new Response("Forbidden", { status: 403 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { byPlatformId, bySubdomain } = await buildRanking();
  if (byPlatformId.size === 0) {
    return new Response(JSON.stringify({ ok: false, error: "leaderboard returned 0" }), { status: 502 });
  }
  const today = todayNY();

  // ---- 1. Stats + rank for already-tracked creators (existing behavior) ----
  const tracked = await fetchAllSubstackCreators(supabase);
  const trackedIds = new Set(tracked.map((c) => c.platform_id));
  const stats: any[] = [];
  const rankUpdates: { id: string; leaderboard_rank: number }[] = [];
  for (const c of tracked) {
    const entry = byPlatformId.get(String(c.platform_id));
    if (entry && entry.subs > 0) {
      stats.push({ creator_id: c.id, recorded_at: today, subscribers: entry.subs, followers: entry.subs, total_views: null, total_posts: null });
      rankUpdates.push({ id: c.id, leaderboard_rank: entry.globalRank });
    }
  }
  let written = 0;
  for (let i = 0; i < stats.length; i += 500) {
    const batch = stats.slice(i, i + 500);
    const { error } = await supabase.from("creator_stats").upsert(batch, { onConflict: "creator_id,recorded_at" });
    if (!error) written += batch.length;
  }
  for (let i = 0; i < rankUpdates.length; i += 200) {
    await Promise.all(rankUpdates.slice(i, i + 200).map((u) =>
      supabase.from("creators").update({ leaderboard_rank: u.leaderboard_rank }).eq("id", u.id)
    ));
  }

  // ---- 2. Discovery: add ranked pubs we don't track yet (capped per run) ----
  let discovered = 0;
  for (const [pid, entry] of byPlatformId) {
    if (discovered >= MAX_NEW_PER_RUN) break;
    if (trackedIds.has(pid)) continue;
    const pub = entry.pub;
    const { data: created, error } = await supabase.from("creators").insert({
      platform: "substack", platform_id: pid, username: pub.subdomain,
      display_name: pub.name || pub.subdomain, profile_image: pub.logo_url || pub.author_photo_url || null,
      description: cleanText(pub.hero_text || pub.author_bio), leaderboard_rank: entry.globalRank,
    }).select("id").single();
    if (error) { if (error.code !== "23505") console.error(`discover ${pub.subdomain}: ${error.message}`); continue; }
    await supabase.from("creator_stats").upsert({
      creator_id: created.id, recorded_at: today, subscribers: entry.subs, followers: entry.subs, total_views: null, total_posts: null,
    }, { onConflict: "creator_id,recorded_at" });
    trackedIds.add(pid);
    discovered++;
  }

  // ---- 3. Resolve pending creator_requests for substack ----
  let requestsResolved = 0, requestsFailed = 0;
  const { data: pendingRequests } = await supabase
    .from("creator_requests").select("id,username").eq("platform", "substack").eq("status", "pending");
  for (const reqRow of pendingRequests || []) {
    const slug = String(reqRow.username || "").toLowerCase();
    const entry = bySubdomain.get(slug);
    if (!entry) {
      await supabase.from("creator_requests")
        .update({ status: "failed", error_message: "Substack not found on any public category leaderboard" })
        .eq("id", reqRow.id);
      requestsFailed++;
      continue;
    }
    const pid = String(entry.pub.id);
    let creatorId: string | null = null;
    const { data: existing } = await supabase.from("creators").select("id").eq("platform", "substack").eq("platform_id", pid).maybeSingle();
    if (existing) {
      creatorId = existing.id;
    } else {
      const { data: created, error } = await supabase.from("creators").insert({
        platform: "substack", platform_id: pid, username: entry.pub.subdomain,
        display_name: entry.pub.name || entry.pub.subdomain, profile_image: entry.pub.logo_url || entry.pub.author_photo_url || null,
        description: cleanText(entry.pub.hero_text || entry.pub.author_bio), leaderboard_rank: entry.globalRank,
      }).select("id").single();
      if (error) {
        await supabase.from("creator_requests").update({ status: "failed", error_message: error.message }).eq("id", reqRow.id);
        requestsFailed++;
        continue;
      }
      creatorId = created.id;
    }
    if (entry.subs > 0) {
      await supabase.from("creator_stats").upsert({
        creator_id: creatorId, recorded_at: today, subscribers: entry.subs, followers: entry.subs, total_views: null, total_posts: null,
      }, { onConflict: "creator_id,recorded_at" });
    }
    await supabase.from("creator_requests").delete().eq("id", reqRow.id);
    requestsResolved++;
  }

  return new Response(JSON.stringify({
    ok: true, date: today, ranked: byPlatformId.size, tracked: tracked.length, written,
    discovered, requestsResolved, requestsFailed,
  }), { headers: { "Content-Type": "application/json" } });
});
