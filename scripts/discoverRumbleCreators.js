/**
 * Discover new Rumble creators incrementally.
 *
 * Rotates through 3 random Rumble browse categories per run, walks 2 pages
 * deep, and adds anything new with 5K+ followers. Runs from the Creator
 * Discovery workflow 4x daily.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseChannelHtml as parseRumbleHtml } from '../src/services/rumbleService.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const BASE = 'https://rumble.com';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
};

const MIN_FOLLOWERS = 5000;
const MAX_PER_RUN = 50;
const FETCH_DELAY_MS = 800;
const TODAY = new Date().toISOString().split('T')[0];

const CATEGORY_POOL = [
  'viral', 'news', 'podcasts', 'sports', 'gaming', 'finance-and-crypto',
  'entertainment', 'science-and-tech', 'cooking', 'health-and-fitness',
  'vlogs', 'music', 'auto-and-vehicles',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseAbbreviated(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/,/g, '').trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) {
    const direct = parseInt(cleaned, 10);
    return Number.isNaN(direct) ? 0 : direct;
  }
  const num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') return Math.round(num * 1_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function cleanText(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim().substring(0, 500);
}

function extractMeta(html, propertyName, propertyAttr = 'property') {
  const escaped = propertyName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(
    `<meta\\s+${propertyAttr}\\s*=\\s*["']?${escaped}["']?\\s+content\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`,
    'i'
  );
  const m = html.match(re);
  if (!m) return null;
  return m[1] || m[2] || m[3] || null;
}

// Delegate to the shared rumbleService parser (single source of truth) — handles
// both the legacy plural "Followers" and the newer "<span>N Follower(s)</span>"
// templates, so new-template channels aren't skipped as 0 followers.
function parseChannelHtml(html, { slug, kind }) {
  const p = parseRumbleHtml(html, { slug, kind, profileUrl: `${BASE}/${kind}/${slug}` });
  if (!p) return null;
  return {
    platformId: p.platformId,
    username: p.username,
    displayName: p.displayName,
    profileImage: p.profileImage,
    description: p.description,
    followers: p.followers,
    totalPosts: p.totalPosts,
  };
}

async function fetchChannel(kind, slug) {
  try {
    const res = await fetch(`${BASE}/${kind}/${slug}`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return parseChannelHtml(await res.text(), { slug, kind });
  } catch { return null; }
}

async function fetchCategoryHandles(category, page = 1) {
  try {
    const url = `${BASE}/browse/${category}${page > 1 ? `?page=${page}` : ''}`;
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
    // Rumble's edge returns HTTP 410 for /browse pages but serves the full HTML body anyway.
    const html = await res.text();
    if (!html || html.length < 1000) return [];
    const seen = new Set();
    const out = [];
    // Rumble appends `?e9s=src_v1_clr` tracking params to channel hrefs
    const re = /href="\/(c|user)\/([^"/?#]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const key = `${m[1]}:${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: m[1], slug: m[2] });
    }
    return out;
  } catch { return []; }
}

async function existingIds() {
  const ids = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('platform_id')
      .eq('platform', 'rumble')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this existing-id set would be
      // incomplete and we'd re-insert duplicate creators.
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => r.platform_id && ids.add(r.platform_id));
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}

async function main() {
  console.log(`🎬 Rumble discovery starting (${TODAY})`);
  const existing = await existingIds();
  console.log(`📊 Already tracking ${existing.size} channels\n`);

  // Pick 3 random categories this run
  const tags = [...CATEGORY_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  console.log(`🎯 Categories this run: ${tags.join(', ')}\n`);

  const candidates = new Map();
  for (const cat of tags) {
    for (let page = 1; page <= 2; page++) {
      const handles = await fetchCategoryHandles(cat, page);
      for (const h of handles) {
        const platformId = `${h.kind}:${h.slug}`;
        if (existing.has(platformId) || candidates.has(platformId)) continue;
        candidates.set(platformId, h);
      }
      await sleep(FETCH_DELAY_MS);
    }
    console.log(`  ${cat}: total candidates ${candidates.size}`);
  }
  console.log(`  ${candidates.size} new candidate handles\n`);

  let added = 0;
  for (const [, { kind, slug }] of candidates) {
    if (added >= MAX_PER_RUN) break;
    const profile = await fetchChannel(kind, slug);
    await sleep(FETCH_DELAY_MS);
    if (!profile || profile.followers < MIN_FOLLOWERS) continue;

    const { data: created, error } = await supabase
      .from('creators')
      .insert({
        platform: 'rumble',
        platform_id: profile.platformId,
        username: profile.username,
        display_name: profile.displayName,
        profile_image: profile.profileImage,
        description: profile.description,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code !== '23505') console.error(`  ❌ ${profile.username}: ${error.message}`);
      continue;
    }

    if (profile.followers > 0) {
      await supabase.from('creator_stats').insert({
        creator_id: created.id,
        recorded_at: TODAY,
        subscribers: profile.followers,
        followers: profile.followers,
        total_posts: profile.totalPosts || null,
        total_views: null,
      });
    }
    added++;
    console.log(`   ✅ ${profile.username} (${profile.followers.toLocaleString()} followers)`);
  }

  console.log(`\n✨ Done. Added ${added} new Rumble creators.`);
}

main().catch(e => { console.error('❌ Discovery failed:', e); process.exit(1); });
