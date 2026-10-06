// Substack daily stats collection — runs on Supabase Edge (Deno).
//
// WHY EDGE: substack.com blocks GitHub Actions / Vercel datacenter IPs, but NOT
// Supabase's egress (verified). So Substack is collected here, on a daily
// pg_cron schedule, instead of in the Node daily-stats workflow.
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
// Raised 8 -> 12 (2026-09-15, real spsummary audit finding): only publications
// that appear somewhere in this sweep get a stats write; anyone who drops
// below the visible window keeps last-good data forever ("pubs that drop off
// keep last-good", by design). Measured against the live DB before this
// change: 2,068 tracked pubs, only 77% fresh in the last 2 days, and 328 of
// them clustered specifically in the 7-14-day-stale band, not spread evenly
// (a smooth decay curve would look different) — consistent with pubs that
// were visible when first discovered but have since been pushed below page 8
// as the tracked set grew and category rankings shifted, never to be swept
// again. +4 pages/category is a real but modest widening (112 -> 168
// requests/run, +56, still ~50 real seconds of the 300ms inter-page sleep,
// comfortably inside the Edge Function's 400s wall-clock budget on Pro) —
// deliberately not doubled, since this endpoint's actual rate-limit
// tolerance has never been measured the way the archive-fetch endpoint's
// has (CLAUDE.md notes ~50% failure under bulk load there). If freshness is
// still meaningfully short of ~90% after this, that's real signal the fix
// needs to go further, not proof the theory was wrong.
const PAGES_PER_CATEGORY = 12;

// Substack rate-limits this API: roughly 18 requests in a short burst (~4 a
// second), then HTTP 429 until it has been quiet for a few seconds
// (measured 2026-10-01). The old sweep paced at ~3/s and treated any failed
// page as "end of this category", so after the first 429 every remaining
// request failed instantly and was skipped: only ~1,130 of 2,454 tracked
// pubs got a reading each day, and later categories (us-politics, news,
// health) were starved. Now: pace under the limit, wait and retry a page on
// 429/5xx, and say so when a category could not be finished.
const PACE_MS = 600;                 // ~1.7 requests/second, well under the burst limit
const MAX_ATTEMPTS = 4;              // per page
const RETRY_WAIT_MS = 7000;          // x attempt number; Substack recovers within ~5s
const SWEEP_DEADLINE_MS = 280_000;   // leave room for the writes inside the 400s function budget
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

type SweepStats = { requests: number; retries: number; complete: string[]; incomplete: string[] };

// One leaderboard page, retried on rate limits and server errors. null = gave up.
async function fetchPage(catId: number, page: number, stats: SweepStats): Promise<{ publications?: any[]; more?: boolean } | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    stats.requests++;
    try {
      const res = await fetch(`https://substack.com/api/v1/category/public/${catId}/paid?page=${page}`, { headers: HEADERS });
      if (res.ok) return await res.json();
      // Past the last page Substack answers 400/404: the end of the list, not a failure
      // (but a 400 on page 0 means something is wrong).
      if ((res.status === 400 || res.status === 404) && page > 0) return { publications: [], more: false };
      if (res.status === 429 || res.status >= 500) {
        stats.retries++;
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : RETRY_WAIT_MS * attempt);
        continue;
      }
      console.error(`category ${catId} page ${page}: HTTP ${res.status}`);
      return null;
    } catch (e) {
      stats.retries++;
      console.error(`category ${catId} page ${page}: ${(e as Error).message}`);
      await sleep(RETRY_WAIT_MS);
    }
  }
  return null;
}

async function buildRanking() {
  const stats: SweepStats = { requests: 0, retries: 0, complete: [], incomplete: [] };
  const started = Date.now();
  const byId = new Map<string, { pub: any; bestPosition: number }>();
  // Start the sweep at a different category each day, so if the time budget
  // ever runs out it is not always the same categories that get left out.
  const offset = Math.floor(Date.now() / 86_400_000) % CATEGORIES.length;
  const order = [...CATEGORIES.slice(offset), ...CATEGORIES.slice(0, offset)];
  for (const cat of order) {
    let pagesRead = 0;
    let reachedEnd = false;
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      if (Date.now() - started > SWEEP_DEADLINE_MS) break;
      const data = await fetchPage(cat.id, page, stats);
      if (!data) break;
      const pubs = data.publications || [];
      pagesRead++;
      pubs.forEach((pub: any, i: number) => {
        if (!pub.id || !pub.subdomain) return;
        const position = page * 25 + i;
        const ex = byId.get(String(pub.id));
        if (!ex || position < ex.bestPosition) byId.set(String(pub.id), { pub, bestPosition: ex ? Math.min(ex.bestPosition, position) : position });
      });
      if (!data.more || pubs.length === 0) { reachedEnd = true; break; }
      await sleep(PACE_MS);
    }
    // Complete = read as deep as we aim to, or the list ended first.
    (reachedEnd || pagesRead >= PAGES_PER_CATEGORY ? stats.complete : stats.incomplete).push(cat.slug);
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
  return { byPlatformId, bySubdomain, stats, seconds: Math.round((Date.now() - started) / 1000) };
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

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// The whole job: the leaderboard sweep (about 3 minutes at a polite pace) and
// then the writes. Returns a summary (it also goes to the function logs).
async function run(force = false): Promise<Record<string, unknown>> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // A second scheduled attempt exists in case the first one produced nothing
  // (2026-10-06: the 08:00 UTC runs on Oct 5 and 6 wrote no rows, a manual run
  // minutes later wrote 2,220). If today already has most readings, stop here.
  if (!force) {
    const day = todayNY();
    const [{ count: have }, { count: total }] = await Promise.all([
      supabase.from("creators").select("id, creator_stats!inner(recorded_at)", { count: "exact", head: true })
        .eq("platform", "substack").eq("creator_stats.recorded_at", day),
      supabase.from("creators").select("id", { count: "exact", head: true }).eq("platform", "substack"),
    ]);
    if (have && total && have / total >= 0.8) return { ok: true, skipped: "today already collected", have, total };
  }

  const { byPlatformId, bySubdomain, stats: sweep, seconds: sweepSeconds } = await buildRanking();
  if (byPlatformId.size === 0) {
    return { ok: false, error: "leaderboard returned 0", sweep };
  }
  // A sweep that couldn't finish every category has holes: a pub missing from
  // it may simply be in a category we didn't read, so don't treat "not seen"
  // as "not on Substack".
  const sweepComplete = sweep.incomplete.length === 0;
  if (!sweepComplete) console.error(`incomplete sweep, categories not finished: ${sweep.incomplete.join(", ")}`);
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
    if (!entry && !sweepComplete) continue; // leave it pending; tomorrow's sweep may find it
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

  return {
    ok: true, date: today, ranked: byPlatformId.size, tracked: tracked.length, written,
    discovered, requestsResolved, requestsFailed,
    sweep: { seconds: sweepSeconds, requests: sweep.requests, retries: sweep.retries, complete: sweep.complete.length, incomplete: sweep.incomplete },
  };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

Deno.serve((req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) {
    return new Response("Forbidden", { status: 403 });
  }
  // Supabase answers 504 when a function hasn't responded within 150s, and the
  // paced sweep takes longer than that. So the job runs as a background task
  // (allowed up to the 400s wall clock) and this replies at once; the summary
  // goes to the function logs. ?wait=1 runs it inline instead, for a manual
  // check with the response in hand (only useful if it finishes inside 150s).
  const force = new URL(req.url).searchParams.get("force") === "1";
  const task = run(force).then((r) => { console.log("collect-substack finished", JSON.stringify(r)); return r; });
  if (new URL(req.url).searchParams.get("wait") === "1") {
    return task.then((r) => new Response(JSON.stringify(r), { headers: JSON_HEADERS }));
  }
  EdgeRuntime.waitUntil(task.catch((e) => console.error("collect-substack failed:", (e as Error).message)));
  return new Response(JSON.stringify({ ok: true, started: true }), { status: 202, headers: JSON_HEADERS });
});
