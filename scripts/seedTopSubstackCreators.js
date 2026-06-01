/**
 * Seed top Substack publications.
 *
 * Substack has no exact public subscriber counts — only order-of-magnitude
 * buckets exposed via the category leaderboard API. We:
 *   1. Pull the `/paid` leaderboard for every top category (paginated).
 *   2. Dedupe publications by id, keeping the best (lowest) position seen.
 *   3. Compute a GLOBAL leaderboard rank by ordering on
 *        (total-subscriber bucket DESC, paid bucket DESC, best position ASC).
 *   4. Store the total-subscriber bucket in creator_stats.subscribers and the
 *      global rank in creators.leaderboard_rank — the rankings page sorts by
 *      that rank, not the (heavily-tied) bucket.
 *
 * Run: node scripts/seedTopSubstackCreators.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const FETCH_DELAY_MS = 400;
const PAGES_PER_CATEGORY = 8; // 25/page → up to 200 pubs per category
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

// Top-level Substack category ids (from /api/v1/categories).
const CATEGORIES = [
  { id: 96, slug: 'culture' },
  { id: 4, slug: 'technology' },
  { id: 62, slug: 'business' },
  { id: 76739, slug: 'us-politics' },
  { id: 153, slug: 'finance' },
  { id: 13645, slug: 'food' },
  { id: 94, slug: 'sports' },
  { id: 15417, slug: 'art' },
  { id: 76740, slug: 'world-politics' },
  { id: 103, slug: 'news' },
  { id: 49715, slug: 'fashionandbeauty' },
  { id: 11, slug: 'music' },
  { id: 223, slug: 'faith' },
  { id: 76741, slug: 'health-politics' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanText(str) {
  if (!str) return null;
  return String(str).replace(/\s+/g, ' ').trim().substring(0, 500) || null;
}

async function fetchCategoryPage(catId, page) {
  try {
    const url = `https://substack.com/api/v1/category/public/${catId}/paid?page=${page}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { pubs: [], more: false };
    const data = await res.json();
    return { pubs: data.publications || [], more: !!data.more };
  } catch {
    return { pubs: [], more: false };
  }
}

/**
 * Collect publications from all category leaderboards.
 * Returns a Map keyed by publication id → { pub, bestPosition }.
 */
async function collectPublications() {
  const byId = new Map();
  for (const cat of CATEGORIES) {
    let collected = 0;
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      const { pubs, more } = await fetchCategoryPage(cat.id, page);
      pubs.forEach((pub, i) => {
        if (!pub.id || !pub.subdomain) return;
        const position = page * 25 + i; // absolute position within this category
        const existing = byId.get(pub.id);
        if (!existing || position < existing.bestPosition) {
          byId.set(pub.id, { pub, bestPosition: existing ? Math.min(existing.bestPosition, position) : position });
        }
      });
      collected += pubs.length;
      await sleep(FETCH_DELAY_MS);
      if (!more || pubs.length === 0) break;
    }
    console.log(`  ${cat.slug.padEnd(16)} → running total ${byId.size} unique pubs`);
  }
  return byId;
}

// Best subscriber number Substack exposes: precise total when present
// ("freeSubscriberCount": "2,900,000"), else the order-of-magnitude floor.
function subsFor(pub) {
  if (pub.freeSubscriberCount) {
    const n = parseInt(String(pub.freeSubscriberCount).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return pub.rankingDetailFreeIncludedOrderOfMagnitude || pub.rankingDetailOrderOfMagnitude || 0;
}

/**
 * Order all publications by precise subscriber count DESC, with best category
 * leaderboard position as the tiebreaker.
 */
function computeGlobalRanking(byId) {
  const arr = [...byId.values()].map(({ pub, bestPosition }) => ({
    pub,
    bestPosition,
    subs: subsFor(pub),
  }));
  arr.sort((a, b) => (b.subs - a.subs) || (a.bestPosition - b.bestPosition));
  return arr;
}

async function main() {
  console.log(`📰 Seeding Substack publications (${TODAY})\n`);

  console.log('📡 Collecting category leaderboards...');
  const byId = await collectPublications();
  console.log(`\n📊 ${byId.size} unique publications collected\n`);

  const ranked = computeGlobalRanking(byId);
  console.log('🏆 Top 10 by subscriber count:');
  ranked.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.pub.name} (@${r.pub.subdomain}) — ${r.subs.toLocaleString()} subscribers`);
  });
  console.log('');

  let inserted = 0, updated = 0, skipped = 0;
  for (let i = 0; i < ranked.length; i++) {
    const { pub, subs } = ranked[i];
    const globalRank = i + 1;
    const subscribers = subs || 0;
    if (subscribers === 0) { skipped++; continue; } // never write 0 — data integrity rule

    const platformId = String(pub.id);
    const username = pub.subdomain;

    // Upsert creator (by platform + platform_id). Always refresh leaderboard_rank.
    const { data: existing } = await supabase
      .from('creators')
      .select('id')
      .eq('platform', 'substack')
      .eq('platform_id', platformId)
      .maybeSingle();

    let creatorId;
    if (existing) {
      creatorId = existing.id;
      await supabase.from('creators').update({
        username,
        display_name: pub.name || username,
        profile_image: pub.logo_url || pub.author_photo_url || null,
        description: cleanText(pub.hero_text || pub.author_bio),
        leaderboard_rank: globalRank,
        updated_at: new Date().toISOString(),
      }).eq('id', creatorId);
      updated++;
    } else {
      const { data: created, error } = await supabase
        .from('creators')
        .insert({
          platform: 'substack',
          platform_id: platformId,
          username,
          display_name: pub.name || username,
          profile_image: pub.logo_url || pub.author_photo_url || null,
          description: cleanText(pub.hero_text || pub.author_bio),
          leaderboard_rank: globalRank,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code !== '23505') console.error(`  ❌ ${username}: ${error.message}`);
        skipped++;
        continue;
      }
      creatorId = created.id;
      inserted++;
    }

    // Snapshot the subscriber bucket for today.
    await supabase.from('creator_stats').upsert({
      creator_id: creatorId,
      recorded_at: TODAY,
      subscribers,
      followers: subscribers,
      total_views: null,
      total_posts: null,
    }, { onConflict: 'creator_id,recorded_at' });

    if ((inserted + updated) % 50 === 0) console.log(`  ...${inserted + updated} processed`);
  }

  console.log(`\n✨ Done. Inserted ${inserted}, updated ${updated}, skipped ${skipped}.`);
}

main().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); });
