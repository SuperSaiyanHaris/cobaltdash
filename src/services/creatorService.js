import { supabase } from '../lib/supabase';
import { withErrorHandling } from '../lib/errorHandler';

/**
 * Save or update a creator and stats via server-side API
 * This calls /api/update-creator which uses service role key
 */
export const upsertCreator = withErrorHandling(
  async (creatorData) => {
    // Call server-side API endpoint instead of direct database write
    const response = await fetch('/api/update-creator', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creatorData: {
          platform: creatorData.platform,
          platformId: creatorData.platformId,
          username: creatorData.username,
          displayName: creatorData.displayName,
          profileImage: creatorData.profileImage,
          description: creatorData.description,
          country: creatorData.country,
          category: creatorData.category,
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to save creator' }));
      throw new Error(error.error || 'Failed to save creator');
    }

    const result = await response.json();
    return result.creator;
  },
  'creatorService.upsertCreator'
);

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
 * Save creator stats snapshot via server-side API
 * This should ONLY save stats, not touch the creator record
 */
// Stats are no longer written from the client. The /api/update-creator endpoint
// is gated only by an Origin header (forgeable outside a browser), so letting it
// write creator_stats would allow anyone to inject fake subscriber numbers and
// corrupt the historical charts. The server-side daily collection is the single
// writer of creator_stats, pulling real numbers from the platforms. A creator
// added via search gets its first data point on the next collection run.
// Kept as a no-op so existing callers don't need to change.
export const saveCreatorStats = async () => ({ success: true, skipped: true });

// Creator profile metadata changes rarely (avatar, description updates).
// Cache per (platform, username) with stale-while-revalidate.
const _creatorByUsernameCache = new Map();
const CREATOR_PROFILE_TTL = 5 * 60 * 1000; // 5 minutes

async function _fetchCreatorByUsername(platform, username) {
  // Case-insensitive exact match. Most platforms store usernames lowercase, but
  // Rumble preserves the original case (Bongino vs bongino are both valid URL
  // forms for the same channel). ILIKE without wildcards behaves as exact
  // case-insensitive equality.
  const { data, error } = await supabase
    .from('creators')
    .select('*')
    .eq('platform', platform)
    .ilike('username', username)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error && error.code !== 'PGRST116') throw error;
  return (data && data.length > 0) ? data[0] : null;
}

/**
 * Get creator by platform and username
 */
export const getCreatorByUsername = withErrorHandling(
  async (platform, username) => {
    const key = `${platform}:${username.toLowerCase()}`;
    const hit = _creatorByUsernameCache.get(key);
    const now = Date.now();
    if (hit) {
      if (now - hit.ts > CREATOR_PROFILE_TTL) {
        _fetchCreatorByUsername(platform, username)
          .then(data => _creatorByUsernameCache.set(key, { data, ts: Date.now() }))
          .catch(() => {});
      }
      return hit.data;
    }
    const data = await _fetchCreatorByUsername(platform, username);
    _creatorByUsernameCache.set(key, { data, ts: now });
    return data;
  },
  'creatorService.getCreatorByUsername'
);

/**
 * Get creator by platform and platform ID
 */
export const getCreatorByPlatformId = withErrorHandling(
  async (platform, platformId) => {
    const { data, error } = await supabase
      .from('creators')
      .select('*')
      .eq('platform', platform)
      .eq('platform_id', platformId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
  'creatorService.getCreatorByPlatformId'
);

// Stats history changes 2x/day — 10-min TTL balances freshness vs round-trips.
// Key includes `days` so switching chart ranges fetches correctly.
const _creatorStatsCache = new Map();
const CREATOR_STATS_TTL = 10 * 60 * 1000; // 10 minutes

async function _fetchCreatorStats(creatorId, days) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const { data, error } = await supabase
    .from('creator_stats')
    .select('*')
    .eq('creator_id', creatorId)
    .gte('recorded_at', startDate.toISOString().split('T')[0])
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Get creator stats history
 */
export const getCreatorStats = withErrorHandling(
  async (creatorId, days = 30) => {
    const key = `${creatorId}:${days}`;
    const hit = _creatorStatsCache.get(key);
    const now = Date.now();
    if (hit) {
      if (now - hit.ts > CREATOR_STATS_TTL) {
        _fetchCreatorStats(creatorId, days)
          .then(data => _creatorStatsCache.set(key, { data, ts: Date.now() }))
          .catch(() => {});
      }
      return hit.data;
    }
    const data = await _fetchCreatorStats(creatorId, days);
    _creatorStatsCache.set(key, { data, ts: now });
    return data;
  },
  'creatorService.getCreatorStats'
);

/**
 * All-time peak stat value + the date it happened, straight off full
 * creator_stats history (not just the recent window getCreatorStats fetches).
 */
export const getCreatorPeakStats = withErrorHandling(
  async (creatorId) => {
    const { data, error } = await supabase
      .from('creator_stats')
      .select('subscribers, recorded_at')
      .eq('creator_id', creatorId)
      .order('subscribers', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },
  'creatorService.getCreatorPeakStats'
);

/**
 * Where a creator sits in their platform's ranking. rank is null when the
 * creator doesn't clear the rankings_cache top-500 threshold — callers must
 * hide the stat then, not estimate a rank we don't actually have.
 */
export const getCreatorRankContext = withErrorHandling(
  async (creatorId, platform) => {
    const [{ data: rankRow }, { count }] = await Promise.all([
      supabase
        .from('rankings_cache')
        .select('rank_position')
        .eq('platform', platform)
        .eq('rank_type', 'subscribers')
        .eq('creator_id', creatorId)
        .maybeSingle(),
      supabase
        .from('creators')
        .select('id', { count: 'exact', head: true })
        .eq('platform', platform),
    ]);
    return { rank: rankRow?.rank_position ?? null, total: count ?? 0 };
  },
  'creatorService.getCreatorRankContext'
);

/**
 * Creators ranked just above/below this one on the same platform, straight
 * off rankings_cache's (platform, rank_type, rank_position) primary key, so
 * it's a cheap indexed range read, not a new table scan. Only meaningful for
 * creators who clear the top-500 cache; callers must hide the module when
 * rank is null rather than fall back to a weaker signal.
 */
export const getNearbyRankedCreators = withErrorHandling(
  async (platform, rank, span = 3) => {
    if (!rank) return [];
    const { data, error } = await supabase
      .from('rankings_cache')
      .select('creator_id, username, display_name, profile_image, subscribers, rank_position')
      .eq('platform', platform)
      .eq('rank_type', 'subscribers')
      .gte('rank_position', Math.max(1, rank - span))
      .lte('rank_position', rank + span)
      .neq('rank_position', rank)
      .order('rank_position', { ascending: true });
    if (error) throw error;
    return (data || []).map((c) => ({ ...c, id: c.creator_id }));
  },
  'creatorService.getNearbyRankedCreators'
);

/**
 * Get hours watched stats for a Twitch creator
 */
export const getHoursWatched = withErrorHandling(
  async (creatorId) => {
    const { data, error } = await supabase
      .from('creator_stats')
      .select('hours_watched_day, hours_watched_week, hours_watched_month, peak_viewers_day, avg_viewers_day, streams_count_day')
      .eq('creator_id', creatorId)
      .gt('hours_watched_month', 0)
      .order('recorded_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] ?? null;
  },
  'creatorService.getHoursWatched'
);

/**
 * Search creators in database (fuzzy: dots, underscores, dashes are ignored)
 */
export const searchCreators = withErrorHandling(
  async (query, platform = null) => {
    // Sanitize query to prevent injection via RPC params
    const sanitized = query.replace(/[,%()\\]/g, '').trim();
    if (!sanitized) return [];

    // If stripping all separators leaves fewer than 2 chars, the RPC would
    // match everything or nothing useful — skip the round-trip.
    const stripped = sanitized.replace(/[._\-\s]/g, '');
    if (stripped.length < 2) return [];

    const { data, error } = await supabase.rpc('search_creators_fuzzy', {
      p_query: sanitized,
      p_platform: platform,
      p_limit: 20,
    });

    if (error) throw error;
    return data || [];
  },
  'creatorService.searchCreators'
);

// Latest stat row — used for the odometer display, same TTL as stats history.
const _latestStatsCache = new Map();
const LATEST_STATS_TTL = 5 * 60 * 1000; // 5 minutes

async function _fetchLatestStats(creatorId) {
  const { data, error } = await supabase
    .from('creator_stats')
    .select('*')
    .eq('creator_id', creatorId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get latest stats for a creator
 */
export const getLatestStats = withErrorHandling(
  async (creatorId) => {
    const hit = _latestStatsCache.get(creatorId);
    const now = Date.now();
    if (hit) {
      if (now - hit.ts > LATEST_STATS_TTL) {
        _fetchLatestStats(creatorId)
          .then(data => _latestStatsCache.set(creatorId, { data, ts: Date.now() }))
          .catch(() => {});
      }
      return hit.data;
    }
    const data = await _fetchLatestStats(creatorId);
    _latestStatsCache.set(creatorId, { data, ts: now });
    return data;
  },
  'creatorService.getLatestStats'
);

// Module-level rankings cache — survives component unmounts and SPA navigation.
// Data changes at most 2x/day, so 10-minute TTL is conservative and safe.
// Pattern: stale-while-revalidate — serve cached data instantly, refresh in background.
const _rankingsCache = new Map(); // key → { data, ts }
const RANKINGS_TTL = 10 * 60 * 1000; // 10 minutes

async function _fetchRankings(platform, rankType, limit) {
  const { data, error } = await supabase
    .from('rankings_cache')
    .select('creator_id, platform, username, display_name, profile_image, platform_id, subscribers, total_views, total_posts, growth_30d, hours_watched_day, hours_watched_week, hours_watched_month, computed_at')
    .eq('platform', platform)
    .eq('rank_type', rankType)
    .order('rank_position', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((creator) => ({
    ...creator,
    id: creator.creator_id,
    computedAt: creator.computed_at,
    latestStats: {
      subscribers: creator.subscribers,
      followers: creator.subscribers,
      total_views: creator.total_views,
      total_posts: creator.total_posts,
      hours_watched_day: creator.hours_watched_day,
      hours_watched_week: creator.hours_watched_week,
      hours_watched_month: creator.hours_watched_month,
    },
    totalViews: creator.total_views,
    totalPosts: creator.total_posts,
    growth30d: creator.growth_30d,
    sortValue: rankType === 'views' ? creator.total_views
      : rankType === 'growth' ? creator.growth_30d
      : creator.subscribers,
  }));
}

// Module-level listings cache — same SWR pattern as rankings.
// Featured listings change very infrequently (only on create/expire), so 5-min TTL is safe.
const _listingsCache = new Map(); // key (platform) → { data, ts }
const LISTINGS_TTL = 5 * 60 * 1000; // 5 minutes

async function _fetchFeaturedListings(platform) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('featured_listings')
    .select('id, platform, placement_tier, is_mod_free, active_until, creators(id, username, display_name, profile_image, platform)')
    .eq('platform', platform)
    .eq('status', 'active')
    .gt('active_until', now)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Get active featured listings for a platform.
 * Returns listings ordered by created_at ascending — first come, first served.
 * Earliest listing gets the best slot (position 15), later ones fill every 5th row after.
 * Cached with stale-while-revalidate — instant on subsequent visits.
 */
export async function getFeaturedListings(platform) {
  const hit = _listingsCache.get(platform);
  const now = Date.now();

  if (hit) {
    if (now - hit.ts > LISTINGS_TTL) {
      _fetchFeaturedListings(platform)
        .then(data => _listingsCache.set(platform, { data, ts: Date.now() }))
        .catch(() => {});
    }
    return hit.data;
  }

  const data = await _fetchFeaturedListings(platform);
  _listingsCache.set(platform, { data, ts: now });
  return data;
}

/**
 * Validate a ShinyPull profile URL and return the creator record.
 * Accepts: https://shinypull.com/youtube/mrbeast OR youtube/mrbeast
 */
export async function validateFeaturedCreatorUrl(urlOrPath) {
  const path = urlOrPath
    .replace(/^https?:\/\/shinypull\.com\//, '')
    .replace(/^\//, '')
    .trim();
  const parts = path.split('/');
  if (parts.length < 2) return null;
  const [platform, username] = parts;
  const { data } = await supabase
    .from('creators')
    .select('id, platform, username, display_name, profile_image')
    .eq('platform', platform.toLowerCase())
    .eq('username', username.toLowerCase())
    .maybeSingle();
  return data || null;
}

/**
 * Get ranked creators with latest stats.
 * Cached per (platform, rankType, limit) with stale-while-revalidate.
 */
export const getRankedCreators = withErrorHandling(
  async (platform, rankType = 'subscribers', limit = 50) => {
    const key = `${platform}:${rankType}:${limit}`;
    const hit = _rankingsCache.get(key);
    const now = Date.now();

    if (hit) {
      // Serve stale data immediately; refresh in background if TTL expired
      if (now - hit.ts > RANKINGS_TTL) {
        _fetchRankings(platform, rankType, limit)
          .then(data => _rankingsCache.set(key, { data, ts: Date.now() }))
          .catch(() => {}); // keep serving stale on background failure
      }
      return hit.data;
    }

    // Cold cache — must fetch synchronously
    const data = await _fetchRankings(platform, rankType, limit);
    _rankingsCache.set(key, { data, ts: now });
    return data;
  },
  'creatorService.getRankedCreators'
);

// --- #1 creator on every platform, in one query ---
// Used by the home hero's rotating focal card. Same SWR cache pattern as rankings.
let _topByPlatformCache = null; // { data, ts }
const TOP_BY_PLATFORM_TTL = 10 * 60 * 1000;

async function _fetchTopByPlatform() {
  const { data, error } = await supabase
    .from('rankings_cache')
    .select('creator_id, platform, username, display_name, profile_image, subscribers, growth_30d, computed_at')
    .eq('rank_type', 'subscribers')
    .eq('rank_position', 1);
  if (error) throw error;
  return (data || []).map((c) => ({ ...c, id: c.creator_id, computedAt: c.computed_at }));
}

// --- Hub pages (/best/:slug) ---
// Deliberately NOT sourced from rankings_cache: that table only holds the top
// 500 per platform, so a genre hub built on it would show the handful of its
// members big enough to chart globally (ambient returned 1 of 44) and silently
// drop the rest. The RPC reads creators + creator_stats directly and ranks
// within the category. Same SWR cache pattern as rankings.
const _hubCache = new Map(); // slug → { data, ts }
const HUB_TTL = 10 * 60 * 1000;

async function _fetchHubCreators(hub, limit) {
  const { data, error } = await supabase.rpc('get_hub_creators', {
    p_platform: hub.platform,
    p_categories: hub.categories,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []).map((c, i) => ({
    ...c,
    id: c.creator_id,
    platform: hub.platform,
    rank: i + 1,
    latestStats: {
      subscribers: c.subscribers,
      followers: c.subscribers,
      total_views: c.total_views,
    },
    totalViews: c.total_views,
  }));
}

/**
 * Ranked creators for a hub, biggest first. `hub` is an entry from
 * src/lib/hubs.js. Read-only and anon-safe.
 */
export const getHubCreators = withErrorHandling(
  async (hub, limit = 100) => {
    if (!hub) return [];
    const key = `${hub.slug}:${limit}`;
    const hit = _hubCache.get(key);
    const now = Date.now();
    if (hit) {
      if (now - hit.ts > HUB_TTL) {
        _fetchHubCreators(hub, limit)
          .then((data) => _hubCache.set(key, { data, ts: Date.now() }))
          .catch(() => {}); // keep serving stale on background failure
      }
      return hit.data;
    }
    const data = await _fetchHubCreators(hub, limit);
    _hubCache.set(key, { data, ts: now });
    return data;
  },
  'creatorService.getHubCreators'
);

/**
 * Creators for the auth-page showcase wall: top ranks across the popular
 * platforms, enough to fill a few floating columns. Read-only, anon-safe.
 */
export const getShowcaseCreators = withErrorHandling(
  async (perPlatform = 8) => {
    const { data, error } = await supabase
      .from('rankings_cache')
      .select('creator_id, platform, username, display_name, profile_image, subscribers')
      .eq('rank_type', 'subscribers')
      .in('platform', ['youtube', 'twitch', 'tiktok', 'kick', 'bluesky', 'music', 'rumble'])
      .lte('rank_position', perPlatform);
    if (error) throw error;
    return (data || []).map((c) => ({ ...c, id: c.creator_id }));
  },
  'creatorService.getShowcaseCreators'
);

export const getTopCreatorsByPlatform = withErrorHandling(
  async () => {
    const now = Date.now();
    if (_topByPlatformCache) {
      if (now - _topByPlatformCache.ts > TOP_BY_PLATFORM_TTL) {
        _fetchTopByPlatform()
          .then(data => { _topByPlatformCache = { data, ts: Date.now() }; })
          .catch(() => {});
      }
      return _topByPlatformCache.data;
    }
    const data = await _fetchTopByPlatform();
    _topByPlatformCache = { data, ts: now };
    return data;
  },
  'creatorService.getTopCreatorsByPlatform'
);

// --- Sparkline data: batched 30-day stats for a set of creators ---
// Single Supabase query, then bucket by creator_id and downsample to ~12 points each.
// Used to render inline trend charts in the rankings table.
const _sparklineCache = new Map();
const SPARKLINE_TTL = 15 * 60 * 1000;

export const getSparklineData = withErrorHandling(
  async (creatorIds, days = 30) => {
    if (!creatorIds || creatorIds.length === 0) return {};
    const cacheKey = creatorIds.slice().sort().join(',') + `:${days}`;
    const hit = _sparklineCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < SPARKLINE_TTL) return hit.data;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('creator_stats')
      .select('creator_id, recorded_at, subscribers')
      .in('creator_id', creatorIds)
      .gte('recorded_at', cutoff)
      .order('recorded_at', { ascending: true });
    if (error) throw error;

    // Bucket: creator_id → array of subscriber counts in chronological order
    const result = {};
    for (const id of creatorIds) result[id] = [];
    for (const row of data || []) {
      if (result[row.creator_id]) result[row.creator_id].push(row.subscribers);
    }

    _sparklineCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  },
  'creatorService.getSparklineData'
);
