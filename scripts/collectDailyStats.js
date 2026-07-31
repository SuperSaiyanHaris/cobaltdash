import { config } from 'dotenv';
import { parseChannelHtml as parseRumbleHtml } from '../src/services/rumbleService.js';
config();
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) { console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run without it.'); process.exit(1); }
const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY;
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.VITE_TWITCH_CLIENT_SECRET;
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const LASTFM_API_KEY = process.env.LASTFM_CLIENT_ID;

// Batch sizes
const YOUTUBE_BATCH_SIZE = 50;  // YouTube allows up to 50 channel IDs per request
const TWITCH_BATCH_SIZE = 100;  // Twitch allows up to 100 logins per request
const TWITCH_FOLLOWER_DELAY_MS = 80;   // 80ms = ~12.5/s, just under Twitch's 800/min app-token cap.
                                        // (Was 150ms which left half the budget unused — runtime was 1h+.)
const KICK_BATCH_SIZE = 50;    // Kick allows up to 50 slugs per request
const BLUESKY_BATCH_SIZE = 25;  // AT Protocol getProfiles allows up to 25 actors per request

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

let twitchAccessToken = null;

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchLastFmArtistStats(platformId, displayName) {
  const param = MBID_RE.test(platformId)
    ? `mbid=${encodeURIComponent(platformId)}`
    : `artist=${encodeURIComponent(displayName)}&autocorrect=1`;
  const url = `${LASTFM_BASE}?method=artist.getinfo&${param}&api_key=${LASTFM_API_KEY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm API error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm: ${data.message}`);
  const artist = data.artist;
  return {
    listeners: parseInt(artist?.stats?.listeners || 0),
    playcount: parseInt(artist?.stats?.playcount || 0),
  };
}

async function getTwitchAccessToken() {
  if (twitchAccessToken) return twitchAccessToken;

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();
  twitchAccessToken = data.access_token;
  return twitchAccessToken;
}

/**
 * Fetch YouTube stats for multiple channels in one request (up to 50)
 */
async function fetchYouTubeBatch(channelIds) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API key not configured');
  }

  const ids = channelIds.join(',');
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(`YouTube API error: ${data.error.message || data.error.code}`);
  }

  // Create a map of channelId -> stats
  const statsMap = new Map();
  (data.items || []).forEach((channel) => {
    statsMap.set(channel.id, {
      subscribers: parseInt(channel.statistics.subscriberCount) || 0,
      total_views: parseInt(channel.statistics.viewCount) || 0,
      total_posts: parseInt(channel.statistics.videoCount) || 0,
    });
  });

  return statsMap;
}

/**
 * Fetch Twitch user info for multiple users in one request (up to 100)
 */
async function fetchTwitchUsersBatch(usernames) {
  const token = await getTwitchAccessToken();

  const params = usernames.map((u) => `login=${encodeURIComponent(u)}`).join('&');
  const response = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();

  // Create a map of username -> user data
  const userMap = new Map();
  (data.data || []).forEach((user) => {
    userMap.set(user.login.toLowerCase(), {
      id: user.id,
      view_count: parseInt(user.view_count) || 0,
    });
  });

  return userMap;
}

/**
 * Fetch follower count for a single Twitch user.
 * Retries up to 3 times on 429, honouring the Ratelimit-Reset header.
 */
async function fetchTwitchFollowers(broadcasterId) {
  const token = await getTwitchAccessToken();

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`,
      {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (response.status === 429) {
      const resetHeader = response.headers.get('Ratelimit-Reset');
      const waitMs = resetHeader
        ? Math.max(1000, parseInt(resetHeader) * 1000 - Date.now() + 500)
        : (attempt + 1) * 2000;
      console.warn(`   ⏳ Twitch rate limited, waiting ${Math.round(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Followers API ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (data.total === undefined) {
      throw new Error(`Followers API returned no total field`);
    }
    return data.total;
  }

  throw new Error(`Followers API: rate limited, max retries exceeded`);
}

/**
 * Fetch total view count from VODs for a Twitch user
 * Since Twitch deprecated the view_count field, we sum up views from recent VODs
 */
async function fetchTwitchVODViews(broadcasterId) {
  const token = await getTwitchAccessToken();

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/videos?user_id=${broadcasterId}&first=100&type=archive`,
      {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();
    const totalViews = (data.data || []).reduce((sum, video) => sum + (video.view_count || 0), 0);
    return totalViews;
  } catch (err) {
    console.warn(`Failed to fetch VOD views: ${err.message}`);
    return 0;
  }
}

// ========== BLUESKY API HELPERS ==========

/**
 * Fetch Bluesky stats for multiple handles in one request (up to 25)
 * Uses the fully public AT Protocol API — no auth required
 */
async function fetchBlueskyBatch(handles) {
  const params = handles.map(h => `actors=${encodeURIComponent(h)}`).join('&');
  const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Bluesky API error: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Map handle -> stats
  const statsMap = new Map();
  (data.profiles || []).forEach(profile => {
    statsMap.set(profile.handle.toLowerCase(), {
      followers: profile.followersCount ?? 0,
      totalPosts: profile.postsCount ?? 0,
    });
  });
  return statsMap;
}

// ========== RUMBLE HELPERS (HTML scrape, no API) ==========
// Rumble channels live at `/c/{slug}` or `/user/{slug}`. We store the kind in
// `platform_id` (`c:slug` / `user:slug`) so we know which URL to fetch. ~1 req/sec
// to be polite — Rumble doesn't publish a rate limit but we're conservative.
const RUMBLE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
};

function rumbleParseAbbreviated(str) {
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

// Rumble doesn't print a total video count on the channel page (loaded by JS).
// The /videos tab is server-paginated 50/page so we can derive it by hitting
// the first page, finding the largest linked page number, fetching that page,
// and counting items on it: total = (lastPage - 1) * 50 + itemsOnLastPage.
async function fetchRumbleVideoCount(kind, slug) {
  try {
    const r1 = await fetch(`https://rumble.com/${kind}/${slug}/videos`, { headers: RUMBLE_HEADERS, signal: AbortSignal.timeout(15000) });
    const h1 = await r1.text();
    const pages = [...h1.matchAll(/[?&]page=(\d+)/g)].map(m => parseInt(m[1], 10)).filter(Number.isFinite);
    const firstCount = (h1.match(/data-video-id=/g) || []).length;
    if (pages.length === 0) return firstCount;
    const lastPage = Math.max(...pages);
    if (lastPage <= 1) return firstCount;
    const r2 = await fetch(`https://rumble.com/${kind}/${slug}/videos?page=${lastPage}`, { headers: RUMBLE_HEADERS, signal: AbortSignal.timeout(15000) });
    const h2 = await r2.text();
    const lastCount = (h2.match(/data-video-id=/g) || []).length;
    const morePages = [...h2.matchAll(/[?&]page=(\d+)/g)].map(m => parseInt(m[1], 10)).filter(Number.isFinite);
    const trueLast = morePages.length ? Math.max(lastPage, ...morePages) : lastPage;
    return (trueLast - 1) * 50 + lastCount;
  } catch {
    return 0;
  }
}

async function fetchRumbleChannel(platformId) {
  // platformId is `c:slug` or `user:slug` (legacy rows might just be a slug — default to `c:`)
  let kind = 'c';
  let slug = platformId;
  if (platformId && platformId.includes(':')) {
    [kind, slug] = platformId.split(':');
  }
  const url = `https://rumble.com/${kind}/${slug}`;
  const res = await fetch(url, { headers: RUMBLE_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const html = await res.text();

  // Use the shared rumbleService parser (single source of truth) for followers /
  // avatar / banner / verified / latest post. It handles BOTH the legacy plural
  // "Followers" template and the newer "<span>N Follower(s)</span>" template, so
  // /user/ channels (and newer /c/ pages) parse correctly. The video count from
  // the page is unreliable for large channels, so we override it with the
  // paginator-derived total below.
  const prof = parseRumbleHtml(html, { slug, kind, profileUrl: url });
  if (!prof) return null;

  const totalPosts = await fetchRumbleVideoCount(kind, slug);

  return {
    followers: prof.followers,
    totalPosts: totalPosts || prof.totalPosts || null,
    displayName: prof.displayName,
    profileImage: prof.profileImage,
    bannerImage: prof.bannerImage,
    verified: prof.verified,
    latestPost: prof.latestPost,
  };
}

// ========== MASTODON API HELPERS ==========
// Federated, no auth. Each handle = `user@instance`. No batch endpoint, so we
// fetch one at a time with light pacing. Grouped by instance to keep HTTP
// connections warm and rate-limit pain isolated per server.
async function fetchMastodonProfile(handle) {
  const [username, instance] = (handle || '').split('@');
  if (!username || !instance) throw new Error('Invalid handle');
  const url = `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const account = await res.json();
  const headerMissing = !account.header || account.header.endsWith('/headers/original/missing.png');
  return {
    followers: account.followers_count ?? 0,
    totalPosts: account.statuses_count ?? 0,
    bannerImage: headerMissing ? null : account.header,
    verified: Array.isArray(account.fields) && account.fields.some(f => f.verified_at),
    // Use last_status_at directly — full status content is on-demand only
    latestPost: account.last_status_at ? { publishedAt: account.last_status_at } : null,
    accountId: account.id,
  };
}

// ========== SUBSTACK LEADERBOARD HELPERS ==========
// Substack exposes no exact subscriber counts — only order-of-magnitude
// buckets via the category leaderboard. We sweep every top category's `/paid`
// leaderboard once, merge + dedupe by publication id, and compute a global
// rank ordered by (total-subscriber bucket DESC, paid bucket DESC, best
// category position ASC). Tracked creators are matched by platform_id.
const SUBSTACK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};
const SUBSTACK_CATEGORIES = [
  { id: 96, slug: 'culture' }, { id: 4, slug: 'technology' }, { id: 62, slug: 'business' },
  { id: 76739, slug: 'us-politics' }, { id: 153, slug: 'finance' }, { id: 13645, slug: 'food' },
  { id: 94, slug: 'sports' }, { id: 15417, slug: 'art' }, { id: 76740, slug: 'world-politics' },
  { id: 103, slug: 'news' }, { id: 49715, slug: 'fashionandbeauty' }, { id: 11, slug: 'music' },
  { id: 223, slug: 'faith' }, { id: 76741, slug: 'health-politics' },
];
const SUBSTACK_PAGES_PER_CATEGORY = 8;

async function buildSubstackRanking() {
  const byId = new Map();
  for (const cat of SUBSTACK_CATEGORIES) {
    for (let page = 0; page < SUBSTACK_PAGES_PER_CATEGORY; page++) {
      try {
        const url = `https://substack.com/api/v1/category/public/${cat.id}/paid?page=${page}`;
        const res = await fetch(url, { headers: SUBSTACK_HEADERS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) break;
        const data = await res.json();
        const pubs = data.publications || [];
        pubs.forEach((pub, i) => {
          if (!pub.id || !pub.subdomain) return;
          const position = page * 25 + i;
          const existing = byId.get(pub.id);
          if (!existing || position < existing.bestPosition) {
            byId.set(pub.id, {
              pub,
              bestPosition: existing ? Math.min(existing.bestPosition, position) : position,
            });
          }
        });
        await new Promise((r) => setTimeout(r, 400));
        if (!data.more || pubs.length === 0) break;
      } catch { break; }
    }
  }
  // Resolve the best subscriber number Substack exposes for a publication:
  // the precise total ("freeSubscriberCount": "2,900,000") when present, else
  // the order-of-magnitude band floor. Total (free + paid), the headline number.
  const subsFor = (pub) => {
    if (pub.freeSubscriberCount) {
      const n = parseInt(String(pub.freeSubscriberCount).replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return pub.rankingDetailFreeIncludedOrderOfMagnitude || pub.rankingDetailOrderOfMagnitude || 0;
  };
  // Global ranking: by precise subscriber count DESC, then best leaderboard
  // position as a tiebreaker for pubs that share a value.
  const ranked = [...byId.values()].map((e) => ({ ...e, subs: subsFor(e.pub) }))
    .sort((a, b) => (b.subs - a.subs) || (a.bestPosition - b.bestPosition));
  const out = new Map();
  ranked.forEach((r, i) => {
    out.set(String(r.pub.id), { subscribers: r.subs, globalRank: i + 1 });
  });
  return out;
}

// Latest published post for a Substack publication via its public archive API
// (server-side only — the browser is CORS-blocked). Reactions are stored in
// the shared latest_post_views column since Substack has no view metric.
async function fetchSubstackLatestPost(slug) {
  try {
    const res = await fetch(`https://${slug}.substack.com/api/v1/archive?sort=new&limit=1&offset=0`, {
      headers: SUBSTACK_HEADERS, signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const post = Array.isArray(arr) ? arr[0] : null;
    if (!post) return null;
    const reactions = post.reaction_count
      || (post.reactions ? Object.values(post.reactions).reduce((a, b) => a + (b || 0), 0) : 0);
    return {
      title: (post.title || post.social_title || '').replace(/\s+/g, ' ').trim().substring(0, 500) || null,
      url: post.canonical_url || null,
      publishedAt: post.post_date || null,
      reactions,
    };
  } catch {
    return null;
  }
}

// ========== KICK API HELPERS ==========
let kickAccessToken = null;

async function getKickAccessToken() {
  if (kickAccessToken) return kickAccessToken;

  const response = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw new Error(`Kick token request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  kickAccessToken = data.access_token;
  return kickAccessToken;
}

/**
 * Fetch Kick channel info for multiple slugs (up to 50)
 */
async function fetchKickChannelsBatch(slugs) {
  const token = await getKickAccessToken();
  const slugParams = slugs.map(s => `slug=${encodeURIComponent(s)}`).join('&');

  const response = await fetch(`https://api.kick.com/public/v1/channels?${slugParams}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  // Never silently treat a failed request as "0 channels found" — that
  // misclassifies every real channel in the batch as not-found instead of
  // letting the caller's try/catch retry it next run. Throwing here is what
  // makes that retry path actually fire.
  if (!response.ok) {
    throw new Error(`Kick channels request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const channelMap = new Map();
  (data.data || []).forEach(channel => {
    // active_subscribers_count is a real, common, legitimate 0 for the vast
    // majority of small Kick streamers (paid subs, not followers) — it is
    // NOT the same "0 means the API call failed" signal that applies to
    // YouTube/Twitch subscriber counts. Only `|| 0` to cover a genuinely
    // missing field, never to paper over a failed request (handled above).
    channelMap.set(channel.slug.toLowerCase(), {
      subscribers: channel.active_subscribers_count || 0,
    });
  });
  return channelMap;
}

/**
 * Get today's date in America/New_York timezone (YYYY-MM-DD format)
 * This ensures consistent date handling regardless of UTC offset
 */
function getTodayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Process array in chunks
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}


async function collectDailyStats() {
  const today = getTodayLocal();
  console.log('📊 Starting daily stats collection (batch mode)...');
  console.log(`   Date: ${today} (America/New_York)\n`);

  // Check credentials
  console.log('🔑 Checking credentials...');
  console.log(`   YouTube API Key: ${YOUTUBE_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Twitch Client ID: ${TWITCH_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Twitch Client Secret: ${TWITCH_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Kick Client ID: ${KICK_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Kick Client Secret: ${KICK_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Last.fm API Key: ${LASTFM_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log('');

  // Get all creators from database (Supabase default limit is 1000, so paginate)
  let creators = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error: fetchError } = await supabase
      .from('creators')
      .select('*')
      // .order('id') is REQUIRED: range pagination without a stable unique
      // sort lets Postgres return rows in any order per page, which silently
      // repeats some creators and skips others. Skipped creators get no stats
      // this run, which looks like an API failure but is really a paging bug.
      .order('id')
      .range(from, from + pageSize - 1);
    if (fetchError) {
      console.error('❌ Error fetching creators:', fetchError.message);
      return;
    }
    creators = creators.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Platform selection.
  //  - rumble.com and substack.com HARD-BLOCK GitHub Actions datacenter IPs
  //    (every fetch 403s), so collecting them from CI silently yields nothing.
  //    They are skipped in CI and collected from a non-datacenter IP via a local
  //    scheduled task (scripts/local/collect-rumble-substack.bat) instead.
  //  - COLLECT_ONLY="rumble,substack" restricts this run to just those platforms
  //    (used by that local task). Empty = run everything allowed in this env.
  const IP_BLOCKED_IN_CI = ['rumble', 'substack'];
  const onlyList = (process.env.COLLECT_ONLY || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const inCI = process.env.GITHUB_ACTIONS === 'true';
  const wants = (platform) => {
    if (onlyList.length) return onlyList.includes(platform);
    if (inCI && IP_BLOCKED_IN_CI.includes(platform)) return false;
    return true;
  };
  const pick = (platform) => (wants(platform) ? creators.filter((c) => c.platform === platform) : []);

  const youtubeCreators = pick('youtube');
  const twitchCreators = pick('twitch');
  const kickCreators = pick('kick');
  const blueskyCreators = pick('bluesky');
  const musicCreators = pick('music');
  const mastodonCreators = pick('mastodon');
  const rumbleCreators = pick('rumble');
  const substackCreators = pick('substack');
  // TikTok is handled by refreshTikTokProfiles.js via separate GitHub Actions workflow

  if (inCI && !onlyList.length) {
    console.log('ℹ️  Running in CI — Rumble + Substack are skipped here (their sites block datacenter IPs); collected via the local scheduled task.');
  }

  console.log(`Found ${creators.length} creators to update`);
  console.log(`   YouTube: ${youtubeCreators.length}`);
  console.log(`   Twitch: ${twitchCreators.length}`);
  console.log(`   Kick: ${kickCreators.length}`);
  console.log(`   Bluesky: ${blueskyCreators.length}`);
  console.log(`   Music: ${musicCreators.length}`);
  console.log(`   Mastodon: ${mastodonCreators.length}`);
  console.log(`   Rumble: ${rumbleCreators.length}`);
  console.log(`   Substack: ${substackCreators.length}\n`);

  let successCount = 0;
  let errorCount = 0;
  const statsToUpsert = [];
  // Per-creator metadata updates (latest post, banner, verified) — separate
  // from creator_stats because these are mutable "current state" fields.
  const creatorUpdates = [];

  // ========== YOUTUBE (batch by 50) ==========
  if (youtubeCreators.length > 0 && YOUTUBE_API_KEY) {
    console.log('📺 Processing YouTube creators...');
    const youtubeBatches = chunk(youtubeCreators, YOUTUBE_BATCH_SIZE);
    console.log(`   ${youtubeBatches.length} batch(es) of up to ${YOUTUBE_BATCH_SIZE} channels\n`);

    for (let i = 0; i < youtubeBatches.length; i++) {
      const batch = youtubeBatches[i];
      const channelIds = batch.map((c) => c.platform_id);

      try {
        const statsMap = await fetchYouTubeBatch(channelIds);

        for (const creator of batch) {
          const stats = statsMap.get(creator.platform_id);
          if (stats && stats.subscribers > 0) {
            statsToUpsert.push({
              creator_id: creator.id,
              recorded_at: today,
              subscribers: stats.subscribers,
              followers: stats.subscribers,
              total_views: stats.total_views,
              total_posts: stats.total_posts,
            });
            console.log(`   ✅ ${creator.display_name}: ${(stats.subscribers / 1000000).toFixed(1)}M subs`);
            successCount++;
          } else if (stats && stats.subscribers === 0) {
            // YouTube returned 0 — likely a hidden subscriber count or API anomaly.
            // Never write 0 to the database; skip this creator for today.
            console.log(`   ⚠️  ${creator.display_name}: Skipping — API returned 0 subscribers`);
            errorCount++;
          } else {
            console.log(`   ❌ ${creator.display_name}: Channel not found`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`   ❌ Batch ${i + 1} failed: ${error.message}`);
        errorCount += batch.length;
      }

      // Small delay between batches
      if (i < youtubeBatches.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  // ========== TWITCH (batch user lookup, parallel followers) ==========
  if (twitchCreators.length > 0 && TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    console.log('\n🎮 Processing Twitch creators...');
    const twitchBatches = chunk(twitchCreators, TWITCH_BATCH_SIZE);
    console.log(`   ${twitchBatches.length} batch(es) of up to ${TWITCH_BATCH_SIZE} users\n`);

    for (let i = 0; i < twitchBatches.length; i++) {
      const batch = twitchBatches[i];
      const usernames = batch.map((c) => c.username.toLowerCase());

      try {
        // Get all user info in one request
        const userMap = await fetchTwitchUsersBatch(usernames);

        // Fetch followers sequentially with a delay to stay under Twitch's 800 req/min limit
        const results = [];
        for (const creator of batch) {
          const userData = userMap.get(creator.username.toLowerCase());
          if (!userData) {
            results.push({ creator, error: 'User not found' });
            continue;
          }
          try {
            const [followers, vodViews] = await Promise.all([
              fetchTwitchFollowers(userData.id),
              fetchTwitchVODViews(userData.id),
            ]);
            results.push({ creator, stats: { followers, total_views: vodViews } });
          } catch (err) {
            results.push({ creator, error: err.message });
          }
          await new Promise(r => setTimeout(r, TWITCH_FOLLOWER_DELAY_MS));
        }

        for (const result of results) {
          if (result.error) {
            console.log(`   ❌ ${result.creator.display_name}: ${result.error}`);
            errorCount++;
          } else if (!result.stats.followers) {
            // Banned/deactivated accounts resolve with total=0 (HTTP 200).
            // A 0 is never a real value for a tracked creator — skip the write
            // so the account keeps its last-good count (data rule: never write 0).
            console.log(`   ⚠️  ${result.creator.display_name}: Skipping — API returned 0 followers`);
            errorCount++;
          } else {
            statsToUpsert.push({
              creator_id: result.creator.id,
              recorded_at: today,
              subscribers: result.stats.followers,
              followers: result.stats.followers,
              total_views: result.stats.total_views,
              total_posts: 0,
            });
            console.log(`   ✅ ${result.creator.display_name}: ${(result.stats.followers / 1000000).toFixed(1)}M followers`);
            successCount++;
          }
        }
      } catch (error) {
        console.error(`   ❌ Batch ${i + 1} failed: ${error.message}`);
        errorCount += batch.length;
      }

      // Small delay between batches
      if (i < twitchBatches.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  // ========== KICK (batch by 50) ==========
  if (kickCreators.length > 0 && KICK_CLIENT_ID && KICK_CLIENT_SECRET) {
    console.log('\n🟢 Processing Kick creators...');
    const kickBatches = chunk(kickCreators, KICK_BATCH_SIZE);
    console.log(`   ${kickBatches.length} batch(es) of up to ${KICK_BATCH_SIZE} channels\n`);

    for (let i = 0; i < kickBatches.length; i++) {
      const batch = kickBatches[i];
      const slugs = batch.map((c) => c.username.toLowerCase());

      try {
        const channelMap = await fetchKickChannelsBatch(slugs);

        for (const creator of batch) {
          const channelData = channelMap.get(creator.username.toLowerCase());
          // channelData is undefined only when Kick's API genuinely did not
          // return this slug (deleted/banned/renamed) — that's the real
          // failure case to skip. A present channelData with subscribers=0
          // is a real, common reading (most small streamers have zero paid
          // subs) and must be written, not discarded, or the channel can
          // never get a fresh row again once it first reads 0. This was the
          // single largest cause of stale Kick coverage (~1,000 creators
          // stuck for a week+) found and fixed 2026-07-25.
          if (channelData) {
            statsToUpsert.push({
              creator_id: creator.id,
              recorded_at: today,
              subscribers: channelData.subscribers,
              followers: channelData.subscribers,
              total_views: 0,
              total_posts: 0,
            });
            console.log(`   ✅ ${creator.display_name}: ${channelData.subscribers} paid subs`);
            successCount++;
          } else {
            console.log(`   ❌ ${creator.display_name}: Channel not found`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`   ❌ Batch ${i + 1} failed: ${error.message}`);
        errorCount += batch.length;
      }

      if (i < kickBatches.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // ========== BLUESKY (batch by 25, no auth required) ==========
  if (blueskyCreators.length > 0) {
    console.log('\n🦋 Processing Bluesky creators...');
    const blueskyBatches = chunk(blueskyCreators, BLUESKY_BATCH_SIZE);
    console.log(`   ${blueskyBatches.length} batch(es) of up to ${BLUESKY_BATCH_SIZE} profiles\n`);

    for (let i = 0; i < blueskyBatches.length; i++) {
      const batch = blueskyBatches[i];
      const handles = batch.map((c) => c.username.toLowerCase());

      try {
        const statsMap = await fetchBlueskyBatch(handles);

        for (const creator of batch) {
          const stats = statsMap.get(creator.username.toLowerCase());
          if (stats && stats.followers > 0) {
            statsToUpsert.push({
              creator_id: creator.id,
              recorded_at: today,
              subscribers: stats.followers,
              followers: stats.followers,
              total_views: null,
              total_posts: stats.totalPosts,
            });
            console.log(`   ✅ ${creator.display_name}: ${stats.followers.toLocaleString()} followers`);
            successCount++;
          } else if (stats && stats.followers === 0) {
            // API returned 0 — could be a brand new or private account. Skip to avoid corrupting history.
            console.log(`   ⚠️  ${creator.display_name}: Skipping — API returned 0 followers`);
            errorCount++;
          } else {
            console.log(`   ❌ ${creator.display_name}: Profile not found`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`   ❌ Batch ${i + 1} failed: ${error.message}`);
        errorCount += batch.length;
      }

      // Small delay between batches to be polite to the public API
      if (i < blueskyBatches.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // ========== MASTODON (sequential per handle, ~10/sec, no batch API) ==========
  // Mastodon is federated — each handle maps to a specific instance, so requests
  // can't be batched. We rate-limit per request to stay polite (300/5min default
  // per instance). Skip writes when followers=0 (data integrity rule).
  if (mastodonCreators.length > 0) {
    console.log('\n🐘 Processing Mastodon creators...');
    console.log(`   ${mastodonCreators.length} accounts (sequential)\n`);

    for (let i = 0; i < mastodonCreators.length; i++) {
      const creator = mastodonCreators[i];
      try {
        const stats = await fetchMastodonProfile(creator.username);
        if (stats && stats.followers > 0) {
          statsToUpsert.push({
            creator_id: creator.id,
            recorded_at: today,
            subscribers: stats.followers,
            followers: stats.followers,
            total_views: null,
            total_posts: stats.totalPosts,
          });
          creatorUpdates.push({
            id: creator.id,
            banner_image: stats.bannerImage,
            verified: !!stats.verified,
            latest_post_at: stats.latestPost?.publishedAt || null,
            latest_post_title: null,
            latest_post_url: null,
            latest_post_thumbnail: null,
            latest_post_views: null,
            // Stamp freshness so rankings can filter out instances that died.
            // Without this, dead-but-once-seeded accounts (e.g. defunct
            // sportsbots.xyz, climatenews-xyz.fly.dev) keep their last good
            // follower count and pollute the top-of-Mastodon leaderboard.
            last_verified_at: new Date().toISOString(),
          });
          console.log(`   ✅ ${creator.display_name}: ${stats.followers.toLocaleString()} followers`);
          successCount++;
        } else if (stats && stats.followers === 0) {
          console.log(`   ⚠️  ${creator.display_name}: Skipping — API returned 0 followers`);
          errorCount++;
        } else {
          console.log(`   ❌ ${creator.display_name}: Profile not found`);
          errorCount++;
        }
      } catch (error) {
        console.error(`   ❌ ${creator.display_name}: ${error.message}`);
        errorCount++;
      }
      // 100ms pacing = 10 req/s. With 1k+ creators spread across ~15 instances
      // each instance sees well under its 300/5min budget.
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // ========== RUMBLE (HTML scrape, sequential ~1 req/sec) ==========
  // No public API. Each fetch is a full HTML page (~50-100KB). For 1K creators
  // that's ~10-15 minutes at the polite delay. Skip writes when followers=0.
  if (rumbleCreators.length > 0) {
    console.log('\n🎬 Processing Rumble creators...');
    console.log(`   ${rumbleCreators.length} channels (sequential)\n`);

    for (const creator of rumbleCreators) {
      try {
        const stats = await fetchRumbleChannel(creator.platform_id);
        if (stats && stats.followers > 0) {
          statsToUpsert.push({
            creator_id: creator.id,
            recorded_at: today,
            subscribers: stats.followers,
            followers: stats.followers,
            total_views: null,
            total_posts: stats.totalPosts || null,
          });
          const rumbleUpd = {
            id: creator.id,
            banner_image: stats.bannerImage,
            verified: !!stats.verified,
            latest_post_at: stats.latestPost?.publishedAt || null,
            latest_post_title: stats.latestPost?.title || null,
            latest_post_url: stats.latestPost?.url || null,
            latest_post_thumbnail: stats.latestPost?.thumbnail || null,
            latest_post_views: stats.latestPost?.views || null,
          };
          // Keep the avatar fresh (only when we actually parsed one — never null
          // out an existing image on a parse miss).
          if (stats.profileImage) rumbleUpd.profile_image = stats.profileImage;
          // Self-heal display names: update only when we parsed a REAL name that
          // differs from the slug (username) and from what's stored. This fixes
          // any slug-style names and tracks channel renames, but never clobbers a
          // good name with a slug fallback (parse miss returns the slug).
          if (stats.displayName && stats.displayName !== creator.username && stats.displayName !== creator.display_name) {
            rumbleUpd.display_name = stats.displayName;
          }
          creatorUpdates.push(rumbleUpd);
          console.log(`   ✅ ${creator.display_name}: ${stats.followers.toLocaleString()} followers`);
          successCount++;
        } else if (stats && stats.followers === 0) {
          console.log(`   ⚠️  ${creator.display_name}: Skipping — page returned 0 followers (parse miss or removed)`);
          errorCount++;
        } else {
          console.log(`   ❌ ${creator.display_name}: Channel not found`);
          errorCount++;
        }
      } catch (error) {
        console.error(`   ❌ ${creator.display_name}: ${error.message}`);
        errorCount++;
      }
      // 800ms pacing = ~1.25 req/s. For 1K creators that's ~13 min.
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // ========== SUBSTACK (one leaderboard sweep, match by publication id) ==========
  // Substack data is a single bulk fetch of the category leaderboards, not a
  // per-creator request. We refresh the subscriber bucket + leaderboard_rank
  // for every tracked publication that still appears on a leaderboard. Pubs
  // that dropped off keep their last-good values (data integrity — no 0 write).
  if (substackCreators.length > 0) {
    console.log('\n📰 Processing Substack publications...');
    console.log(`   ${substackCreators.length} tracked — sweeping leaderboards\n`);
    try {
      const ranking = await buildSubstackRanking();
      console.log(`   Leaderboard returned ${ranking.size} ranked publications`);
      let sbLatest = 0;
      for (const creator of substackCreators) {
        const entry = ranking.get(String(creator.platform_id));
        if (entry && entry.subscribers > 0) {
          statsToUpsert.push({
            creator_id: creator.id,
            recorded_at: today,
            subscribers: entry.subscribers,
            followers: entry.subscribers,
            total_views: null,
            total_posts: null,
          });
          // Fetch the latest post (server-side; browser is CORS-blocked).
          // Only for the top-ranked pubs — Substack throttles sustained archive
          // requests, and these are the publications users actually visit.
          // Reactions live in latest_post_views (Substack has no view metric).
          let latest = null;
          if (entry.globalRank <= 300) {
            latest = await fetchSubstackLatestPost(creator.username);
            if (!latest) { // one retry after a short pause for transient throttles
              await new Promise((r) => setTimeout(r, 600));
              latest = await fetchSubstackLatestPost(creator.username);
            }
            if (latest) sbLatest++;
            await new Promise((r) => setTimeout(r, 250)); // pace the per-pub archive fetch
          }
          const upd = {
            id: creator.id,
            leaderboard_rank: entry.globalRank,
          };
          // Only write latest_post_* on a SUCCESSFUL fetch. A failed/throttled
          // fetch leaves the last-good values intact (no null clobber), so
          // coverage of top pubs accumulates toward 100% across daily runs.
          if (latest) {
            upd.latest_post_at = latest.publishedAt;
            upd.latest_post_title = latest.title;
            upd.latest_post_url = latest.url;
            upd.latest_post_views = latest.reactions ?? null;
          }
          creatorUpdates.push(upd);
          successCount++;
        } else {
          // Dropped off the leaderboard — keep last-good, don't write 0.
          errorCount++;
        }
      }
      console.log(`   ✅ Refreshed tracked publications (${sbLatest} with latest post)`);
    } catch (error) {
      console.error(`   ❌ Substack leaderboard sweep failed: ${error.message}`);
      errorCount += substackCreators.length;
    }
  }

  // ========== MUSIC / LAST.FM (individual requests, ~5 req/s) ==========
  if (musicCreators.length > 0 && LASTFM_API_KEY) {
    console.log('\n🎵 Processing Music artists (Last.fm)...');
    console.log(`   ${musicCreators.length} artists\n`);

    for (const creator of musicCreators) {
      try {
        const stats = await fetchLastFmArtistStats(creator.platform_id, creator.display_name);
        if (stats.listeners > 0) {
          statsToUpsert.push({
            creator_id: creator.id,
            recorded_at: today,
            subscribers: stats.listeners,
            followers: stats.listeners,
            total_views: stats.playcount,
            total_posts: null,
          });
          console.log(`   ✅ ${creator.display_name}: ${stats.listeners.toLocaleString()} listeners`);
          successCount++;
        } else {
          console.log(`   ⚠️  ${creator.display_name}: Skipping — API returned 0 listeners`);
          errorCount++;
        }
      } catch (error) {
        console.error(`   ❌ ${creator.display_name}: ${error.message}`);
        errorCount++;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // ========== BULK UPSERT TO DATABASE ==========
  if (statsToUpsert.length > 0) {
    console.log(`\n💾 Saving ${statsToUpsert.length} stats entries to database...`);

    // Upsert in chunks of 1000 to avoid request size limits
    const dbBatches = chunk(statsToUpsert, 1000);
    for (const batch of dbBatches) {
      const { error: upsertError } = await supabase
        .from('creator_stats')
        .upsert(batch, { onConflict: 'creator_id,recorded_at' });

      if (upsertError) {
        console.error('   ❌ Database upsert error:', upsertError.message);
      }
    }
    console.log('   ✅ Database updated');
  }

  // ========== UPDATE CREATOR METADATA (latest post, banner, verified) ==========
  // Done as one-by-one updates because PostgREST's upsert clobbers fields we
  // didn't intend to touch (e.g. country/category/description). We only want
  // to refresh the columns we just learned about.
  if (creatorUpdates.length > 0) {
    console.log(`\n🧾 Updating creator metadata for ${creatorUpdates.length} rows...`);
    let metaOk = 0;
    for (const upd of creatorUpdates) {
      const { id, ...fields } = upd;
      // Skip if every field is null/false — nothing to update
      const hasAny = Object.values(fields).some((v) => v !== null && v !== false);
      if (!hasAny) continue;
      const { error: updateErr } = await supabase
        .from('creators')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (!updateErr) metaOk++;
    }
    console.log(`   ✅ Updated ${metaOk}/${creatorUpdates.length} creator rows`);
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(60));
  console.log('📊 Collection complete!');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📝 Total: ${creators.length}`);

  // Performance stats
  console.log(`\n📡 API calls made:`);
  console.log(`   YouTube: ${Math.ceil(youtubeCreators.length / YOUTUBE_BATCH_SIZE)} (batched ${YOUTUBE_BATCH_SIZE}/request)`);
  console.log(`   Twitch Users: ${Math.ceil(twitchCreators.length / TWITCH_BATCH_SIZE)} (batched ${TWITCH_BATCH_SIZE}/request)`);
  console.log(`   Twitch Followers: ${twitchCreators.length} (individual requests)`);
  console.log(`   Kick: ${Math.ceil(kickCreators.length / KICK_BATCH_SIZE)} (batched ${KICK_BATCH_SIZE}/request)`);
  console.log(`   Bluesky: ${Math.ceil(blueskyCreators.length / BLUESKY_BATCH_SIZE)} (batched ${BLUESKY_BATCH_SIZE}/request, no auth)`);
  console.log(`   Music: ${musicCreators.length} (individual, Last.fm)`);
}

collectDailyStats().catch(console.error);
