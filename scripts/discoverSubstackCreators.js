/**
 * Discover new Substack publications incrementally.
 *
 * Picks 4 random categories per run, pulls a few pages of each `/paid`
 * leaderboard, and inserts any publication we aren't already tracking (with a
 * non-zero subscriber bucket). Global leaderboard_rank is recomputed across
 * the full Substack catalog afterward so new additions slot into the right
 * position. Runs from the Creator Discovery workflow.
 *
 * Run: node scripts/discoverSubstackCreators.js
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
const PAGES_PER_CATEGORY = 4;
const CATEGORIES_PER_RUN = 4;
const MAX_PER_RUN = 60;
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const CATEGORIES = [
  { id: 96, slug: 'culture' }, { id: 4, slug: 'technology' }, { id: 62, slug: 'business' },
  { id: 76739, slug: 'us-politics' }, { id: 153, slug: 'finance' }, { id: 13645, slug: 'food' },
  { id: 94, slug: 'sports' }, { id: 15417, slug: 'art' }, { id: 76740, slug: 'world-politics' },
  { id: 103, slug: 'news' }, { id: 49715, slug: 'fashionandbeauty' }, { id: 11, slug: 'music' },
  { id: 223, slug: 'faith' }, { id: 76741, slug: 'health-politics' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanText = (s) => (s ? String(s).replace(/\s+/g, ' ').trim().substring(0, 500) || null : null);

// Precise total subscriber count when Substack exposes it, else the band floor.
function subsFor(pub) {
  if (pub.freeSubscriberCount) {
    const n = parseInt(String(pub.freeSubscriberCount).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return pub.rankingDetailFreeIncludedOrderOfMagnitude || pub.rankingDetailOrderOfMagnitude || 0;
}

async function existingIds() {
  const ids = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('creators').select('platform_id').eq('platform', 'substack').range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r) => r.platform_id && ids.add(r.platform_id));
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}

// Recompute global leaderboard_rank across ALL tracked substack creators by
// re-sweeping the full set of categories. Keeps ranking consistent after adds.
async function recomputeAllRanks() {
  const byId = new Map();
  for (const cat of CATEGORIES) {
    for (let page = 0; page < 8; page++) {
      try {
        const res = await fetch(`https://substack.com/api/v1/category/public/${cat.id}/paid?page=${page}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) break;
        const data = await res.json();
        const pubs = data.publications || [];
        pubs.forEach((pub, i) => {
          if (!pub.id || !pub.subdomain) return;
          const position = page * 25 + i;
          const ex = byId.get(pub.id);
          if (!ex || position < ex.bestPosition) byId.set(pub.id, { pub, bestPosition: ex ? Math.min(ex.bestPosition, position) : position });
        });
        await sleep(FETCH_DELAY_MS);
        if (!data.more || pubs.length === 0) break;
      } catch { break; }
    }
  }
  const ranked = [...byId.values()].map((e) => ({ ...e, subs: subsFor(e.pub) }))
    .sort((a, b) => (b.subs - a.subs) || (a.bestPosition - b.bestPosition));
  let updated = 0;
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const { error } = await supabase.from('creators')
      .update({ leaderboard_rank: i + 1 })
      .eq('platform', 'substack').eq('platform_id', String(r.pub.id));
    if (!error) updated++;
  }
  return { ranked, updated };
}

async function main() {
  console.log(`📰 Substack discovery starting (${TODAY})`);
  const existing = await existingIds();
  console.log(`📊 Already tracking ${existing.size} publications\n`);

  const cats = [...CATEGORIES].sort(() => Math.random() - 0.5).slice(0, CATEGORIES_PER_RUN);
  console.log(`🎯 Categories this run: ${cats.map((c) => c.slug).join(', ')}\n`);

  const candidates = new Map();
  for (const cat of cats) {
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      try {
        const res = await fetch(`https://substack.com/api/v1/category/public/${cat.id}/paid?page=${page}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) break;
        const data = await res.json();
        const pubs = data.publications || [];
        for (const pub of pubs) {
          if (!pub.id || !pub.subdomain) continue;
          const pid = String(pub.id);
          if (existing.has(pid) || candidates.has(pid)) continue;
          if (subsFor(pub) > 0) candidates.set(pid, pub);
        }
        await sleep(FETCH_DELAY_MS);
        if (!data.more || pubs.length === 0) break;
      } catch { break; }
    }
    console.log(`  ${cat.slug}: ${candidates.size} new candidates so far`);
  }

  let added = 0;
  for (const [pid, pub] of candidates) {
    if (added >= MAX_PER_RUN) break;
    const subs = subsFor(pub);
    const { data: created, error } = await supabase.from('creators').insert({
      platform: 'substack',
      platform_id: pid,
      username: pub.subdomain,
      display_name: pub.name || pub.subdomain,
      profile_image: pub.logo_url || pub.author_photo_url || null,
      description: cleanText(pub.hero_text || pub.author_bio),
    }).select('id').single();
    if (error) { if (error.code !== '23505') console.error(`  ❌ ${pub.subdomain}: ${error.message}`); continue; }
    await supabase.from('creator_stats').upsert({
      creator_id: created.id, recorded_at: TODAY, subscribers: subs, followers: subs, total_views: null, total_posts: null,
    }, { onConflict: 'creator_id,recorded_at' });
    added++;
    console.log(`   ✅ ${pub.name} (@${pub.subdomain})`);
  }

  console.log(`\n🔢 Recomputing global leaderboard ranks...`);
  const { updated } = await recomputeAllRanks();
  console.log(`   Updated ${updated} ranks`);
  console.log(`\n✨ Done. Added ${added} new Substack publications.`);
}

main().catch((e) => { console.error('❌ Discovery failed:', e); process.exit(1); });
