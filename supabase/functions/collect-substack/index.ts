// Substack daily stats collection — runs on Supabase Edge (Deno).
//
// WHY EDGE: substack.com blocks GitHub Actions / Vercel datacenter IPs, but NOT
// Supabase's egress (verified). So Substack is collected here, on a daily
// pg_cron schedule, instead of in the Node daily-stats workflow. (Rumble can't
// use this path — Cloudflare challenges Supabase's IPs for rumble.com too.)
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const map = new Map<string, { subscribers: number; globalRank: number }>();
  ranked.forEach((r, i) => map.set(String(r.pub.id), { subscribers: r.subs, globalRank: i + 1 }));
  return map;
}

Deno.serve(async (req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) {
    return new Response("Forbidden", { status: 403 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const ranking = await buildRanking();
  if (ranking.size === 0) {
    return new Response(JSON.stringify({ ok: false, error: "leaderboard returned 0" }), { status: 502 });
  }

  // Load tracked substack creators (paged).
  const creators: { id: string; platform_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("creators").select("id,platform_id").eq("platform", "substack").range(from, from + 999);
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
    if (!data || data.length === 0) break;
    creators.push(...data);
    if (data.length < 1000) break;
  }

  const today = todayNY();
  const stats: any[] = [];
  const rankUpdates: { id: string; leaderboard_rank: number }[] = [];
  for (const c of creators) {
    const entry = ranking.get(String(c.platform_id));
    if (entry && entry.subscribers > 0) {
      stats.push({ creator_id: c.id, recorded_at: today, subscribers: entry.subscribers, followers: entry.subscribers, total_views: null, total_posts: null });
      rankUpdates.push({ id: c.id, leaderboard_rank: entry.globalRank });
    }
  }

  // Upsert stats in batches (never a 0 — only pushed when subscribers > 0).
  let written = 0;
  for (let i = 0; i < stats.length; i += 500) {
    const batch = stats.slice(i, i + 500);
    const { error } = await supabase.from("creator_stats").upsert(batch, { onConflict: "creator_id,recorded_at" });
    if (!error) written += batch.length;
  }
  // Update leaderboard_rank in batches.
  for (let i = 0; i < rankUpdates.length; i += 200) {
    await Promise.all(rankUpdates.slice(i, i + 200).map((u) =>
      supabase.from("creators").update({ leaderboard_rank: u.leaderboard_rank }).eq("id", u.id)
    ));
  }

  return new Response(JSON.stringify({ ok: true, date: today, ranked: ranking.size, tracked: creators.length, written }), {
    headers: { "Content-Type": "application/json" },
  });
});
