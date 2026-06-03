/**
 * Seed top Rumble creators.
 *
 * Strategy (Rumble has no public API):
 *   1. Hardcoded curated list of well-known channels (~150 handles).
 *   2. Scrape every Rumble category browse page across 10+ categories.
 *   3. Filter to followers >= 5000 and dedupe by `kind:slug`.
 *   4. Insert until we hit ~1000.
 *
 * Run: node scripts/seedTopRumbleCreators.js
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
const TARGET_COUNT = 1000;
const FETCH_DELAY_MS = 800; // ~1.25 req/sec — polite
const TODAY = new Date().toISOString().split('T')[0];

// Categories on Rumble's /browse pages. Each has multiple pages of channel listings.
const CATEGORIES = [
  'viral', 'news', 'podcasts', 'sports', 'gaming', 'finance-and-crypto',
  'entertainment', 'science-and-tech', 'cooking', 'health-and-fitness',
  'vlogs', 'music', 'auto-and-vehicles',
];

// Curated handles known to be popular on Rumble. `c:` for /c/ channels, `user:` for /user/.
const CURATED = [
  'c:Bongino', 'c:RussellBrand', 'c:JordanBPeterson', 'c:joerogan',
  'c:DonaldTrump', 'c:Kim_Iversen', 'c:Timcast', 'c:VivaFrei',
  'c:DanBongino', 'c:BannonsWarRoom', 'c:OAN', 'c:RightSideBroadcasting',
  'c:NewsNOW', 'c:GBNews', 'c:RumbleNews', 'c:RealAmericasVoice',
  'c:GlennBeck', 'c:LouderwithCrowder', 'c:MichaelKnowles', 'c:MattWalsh',
  'c:Saagar', 'c:KrystalBall', 'c:RubinReport', 'c:Patrick-Bet-David',
  'c:BretWeinstein', 'c:UncoverDC', 'c:WSCS', 'c:LaraTrump',
  'c:DineshDSouza', 'c:CharlieKirk', 'c:JackPosobiec', 'c:CandaceOwens',
  'c:NickJFuentes', 'c:StevenCrowder', 'c:BannedDotVideo', 'c:DrDrewMD',
  'c:ColinRugg', 'c:RobertFKennedyJr', 'c:CallieAndKayla', 'c:ZeroHedge',
  'c:GregReese', 'c:ChannelPower', 'c:LudwigInTheUS', 'c:thejimmydorehour',
  'user:Styxhexenhammer666', 'user:dailycaller', 'user:LisaBoothe',
  'user:NinoBruno', 'user:DLive', 'user:RumbleSports', 'user:KrakenTraders',
  'c:NTDTV', 'c:EpochTV', 'c:NTDNews', 'c:NTDImpactTodayCN',
  'c:DonLemonTonight', 'c:PiersMorganUncensored', 'c:TuckerCarlson',
  'c:RealJamesWoods', 'c:Megyn-Kelly', 'c:JamesOKeefe',
  'c:AwakenWithJP', 'c:ThePsychSurvivor', 'c:KimDotcom',
  'c:Sequel', 'c:Survival', 'c:CoolBatteries', 'c:goldsilver',
  'c:PeakProsperity', 'c:RonPaulLibertyReport', 'c:DailyWire',
  'c:TheBabylonBee', 'c:BlazeTV', 'c:PragerU', 'c:TurningPointUSA',
  'c:OANN', 'c:Newsmax', 'c:RealAmericasVoiceVID', 'c:NewsmaxTV',
  'c:FlashPointShow', 'c:USSANewsToday', 'c:Forensic-News',
  'c:Frontiersman', 'c:BretBaier', 'c:JesseWaters', 'c:MariaBartiromo',
  'c:GodzillaNewsNetwork', 'c:JordanPetersonClips', 'c:RebelMedia',
  'c:RebelEdge', 'c:EzraLevant', 'c:DavidJHarrisJr', 'c:WeAreChange',
  'c:RebelNews', 'c:RokfinShow', 'c:CountDankula', 'c:NewsCannon',
  'c:FoxNewsClips', 'c:CivilianAdvanced', 'c:LiveBookTV', 'c:GovernmentInternational',
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

// Rumble HTML mixes quoted/unquoted/single-quoted attributes — robust extractor
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

// Delegate to the shared rumbleService parser (single source of truth) so this
// handles BOTH the legacy plural "Followers" template and the newer
// "<span>N Follower(s)</span>" template. The old inline copy here only matched
// the legacy template, which is why earlier seed runs skipped most channels
// (parsed 0 followers) and the catalog got stuck at ~106.
function parseChannelHtml(html, { slug, kind, profileUrl }) {
  const p = parseRumbleHtml(html, { slug, kind, profileUrl });
  if (!p) return null;
  return {
    platformId: p.platformId,
    username: p.username,
    displayName: p.displayName,
    profileImage: p.profileImage,
    description: p.description,
    followers: p.followers,
    totalPosts: p.totalPosts,
    profileUrl: p.profileUrl,
  };
}

async function fetchChannel(kind, slug) {
  const url = `${BASE}/${kind}/${slug}`;
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const html = await res.text();
    return parseChannelHtml(html, { slug, kind, profileUrl: url });
  } catch {
    return null;
  }
}

async function fetchPathHandles(path) {
  // Generic page fetcher — same 410-tolerant pattern as fetchCategoryHandles
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    if (!html || html.length < 1000) return [];
    const seen = new Set();
    const out = [];
    const re = /href="\/(c|user)\/([^"/?#]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const key = `${m[1]}:${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: m[1], slug: m[2] });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchCategoryHandles(category, page) {
  const url = `${BASE}/browse/${category}${page > 1 ? `?page=${page}` : ''}`;
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
    // Rumble's edge returns HTTP 410 for /browse pages but serves the full HTML body anyway.
    // Don't gate on res.ok — just try to parse whatever came back.
    const html = await res.text();
    if (!html || html.length < 1000) return [];
    const seen = new Set();
    const out = [];
    // Rumble appends `?e9s=src_v1_clr` tracking params to channel hrefs, so
    // the slug is followed by ? or " — match either as a terminator.
    const re = /href="\/(c|user)\/([^"/?#]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const key = `${m[1]}:${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: m[1], slug: m[2] });
    }
    return out;
  } catch {
    return [];
  }
}

async function existingIds() {
  const ids = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('platform_id')
      .eq('platform', 'rumble')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => r.platform_id && ids.add(r.platform_id));
    if (data.length < 1000) break;
    from += 1000;
  }
  return ids;
}

async function insertCreator(profile) {
  const { data, error } = await supabase
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
    if (error.code === '23505') return null;
    console.error(`  ❌ ${profile.username}: ${error.message}`);
    return null;
  }
  return data;
}

async function insertStats(creatorId, profile) {
  if (profile.followers <= 0) return; // Data integrity: never write 0
  await supabase.from('creator_stats').insert({
    creator_id: creatorId,
    recorded_at: TODAY,
    subscribers: profile.followers,
    followers: profile.followers,
    total_posts: profile.totalPosts || null,
    total_views: null,
  });
}

async function main() {
  console.log('🎬 Rumble seed starting...\n');
  const existing = await existingIds();
  console.log(`📊 Already tracking ${existing.size} Rumble channels\n`);

  // Map keyed by platform_id so curated handles + browse-discovered handles dedupe naturally
  const candidates = new Map();

  // ----- Phase 1: curated -----
  console.log(`🎯 Phase 1: ${CURATED.length} curated handles`);
  for (const handle of CURATED) {
    const [kind, slug] = handle.split(':');
    const platformId = `${kind}:${slug}`;
    if (existing.has(platformId) || candidates.has(platformId)) continue;
    candidates.set(platformId, { kind, slug });
  }
  console.log(`   ${candidates.size} queued\n`);

  // ----- Phase 2a: editor-picks page (Rumble's curated picks — ~70 channels) -----
  console.log(`📌 Phase 2a: editor-picks`);
  const picksHandles = await fetchPathHandles('/editor-picks');
  for (const h of picksHandles) {
    const platformId = `${h.kind}:${h.slug}`;
    if (existing.has(platformId) || candidates.has(platformId)) continue;
    candidates.set(platformId, h);
  }
  await sleep(FETCH_DELAY_MS);
  console.log(`   total collected: ${candidates.size}\n`);

  // ----- Phase 2b: browse categories, paginated -----
  console.log(`🌐 Phase 2b: browse ${CATEGORIES.length} categories × 8 pages`);
  for (const cat of CATEGORIES) {
    for (let page = 1; page <= 8; page++) {
      const handles = await fetchCategoryHandles(cat, page);
      let added = 0;
      for (const h of handles) {
        const platformId = `${h.kind}:${h.slug}`;
        if (existing.has(platformId) || candidates.has(platformId)) continue;
        candidates.set(platformId, h);
        added++;
      }
      await sleep(FETCH_DELAY_MS);
      // Stop early if we get no new channels on this page (saturated)
      if (added === 0 && page > 2) break;
    }
    console.log(`   ${cat}: collected so far ${candidates.size}`);
  }
  console.log(`   ${candidates.size} unique candidates\n`);

  // ----- Phase 3: hydrate + insert -----
  console.log(`💾 Phase 3: hydrating up to ${TARGET_COUNT} channels`);
  let inserted = 0;
  let skippedLowFollowers = 0;
  let skippedFailed = 0;

  for (const [platformId, { kind, slug }] of candidates) {
    if (inserted >= TARGET_COUNT) break;

    const profile = await fetchChannel(kind, slug);
    await sleep(FETCH_DELAY_MS);

    if (!profile) {
      skippedFailed++;
      continue;
    }
    if (profile.followers < MIN_FOLLOWERS) {
      skippedLowFollowers++;
      continue;
    }

    const creator = await insertCreator(profile);
    if (creator) {
      await insertStats(creator.id, profile);
      inserted++;
      if (inserted % 25 === 0) {
        console.log(`   ${inserted}/${TARGET_COUNT}: ${profile.username} (${profile.followers.toLocaleString()} followers)`);
      }
    }
  }

  console.log(`\n✨ Done.`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped (<${MIN_FOLLOWERS} followers): ${skippedLowFollowers}`);
  console.log(`   Skipped (fetch failed): ${skippedFailed}`);
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
