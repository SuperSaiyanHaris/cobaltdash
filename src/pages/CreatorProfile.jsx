import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Clock, Radio, Star, Share2, Scale } from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import FunErrorState from '../components/FunErrorState';
import { getChannelByUsername as getYouTubeChannel, getChannelById as getYouTubeChannelById, getRecentVideos as getYouTubeRecentVideos } from '../services/youtubeService';
import { getChannelByUsername as getTwitchChannel, getLiveStreams as getTwitchLiveStreams } from '../services/twitchService';
import { getChannelByUsername as getKickChannel, getLiveStreams as getKickLiveStreams } from '../services/kickService';
import { getBlueskyProfile } from '../services/blueskyService';
import { getMastodonProfile, getMastodonLatestStatus } from '../services/mastodonService';
import { getSubstackPublication } from '../services/substackService';
import SubstackIcon from '../components/SubstackIcon';
import { getArtistByMbid, getArtistByName, getArtistTopTracks, getArtistTopAlbums } from '../services/musicService';
import { Music } from 'lucide-react';
import MusicIcon from '../components/MusicIcon';
import { upsertCreator, saveCreatorStats, getCreatorByUsername, isUsernameAmbiguous, getCreatorStats, getHoursWatched, getCreatorPeakStats, getCreatorRankContext, getCreatorGrade } from '../services/creatorService';
import CreatorAvatar from '../components/CreatorAvatar';
import StarRating from '../components/StarRating';
import { ProfileSkeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import { followCreator, unfollowCreator, isFollowing as checkIsFollowing } from '../services/followService';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import StructuredData, { createBreadcrumbSchema } from '../components/StructuredData';
import { analytics } from '../lib/analytics';
import { formatNumber } from '../lib/utils';
import { addRecentlyViewed } from '../lib/recentlyViewed';
import logger from '../lib/logger';
import { supabase } from '../lib/supabase';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';
import GenericVerdictSection, { GENERIC_PLATFORM_CONFIG } from '../components/profile/GenericVerdictSection';
import SimilarCreators from '../components/profile/SimilarCreators';
import YouTubeVerdictSection from '../components/profile/YouTubeVerdictSection';

// How far back getCreatorStats reaches for the chart/daily-readings history.
// Was hardcoded to 90 at both call sites below, which silently capped the
// "All" time-range button (and the Daily readings tab/count) to the last 90
// calendar days no matter how much real history a creator actually has —
// found 2026-08-31 after a user noticed MrBeast's "All" view only showed 88
// readings despite being tracked since 2026-03-29 (153 real daily rows sitting
// in creator_stats the whole time). 3650 days (10 years) is comfortably past
// any creator's real tracked history for a long time yet; getCreatorStats
// filters by date, not row count, so this only ever returns real rows.
const STATS_HISTORY_DAYS = 3650;

const platformIcons = {
  youtube: YouTubeIcon,
  twitch: TwitchIcon,
  kick: KickIcon,
  tiktok: TikTokIcon,
  bluesky: BlueskyIcon,
  music: MusicIcon,
  mastodon: MastodonIcon,
  rumble: RumbleIcon,
  substack: SubstackIcon,
};

const platformColors = {
  youtube:  { bg: 'bg-red-600',    light: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  twitch:   { bg: 'bg-purple-600', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  kick:     { bg: 'bg-green-600',  light: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  tiktok:   { bg: 'bg-pink-600',   light: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200' },
  bluesky:  { bg: 'bg-sky-500',    light: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200' },
  music:    { bg: 'bg-amber-600',  light: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  mastodon: { bg: 'bg-violet-600', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  rumble:   { bg: 'bg-lime-600',   light: 'bg-lime-50',   text: 'text-lime-700',   border: 'border-lime-200'   },
  substack: { bg: 'bg-orange-600', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
};

const platformUrls = {
  youtube: (username) => `https://youtube.com/@${username}`,
  twitch: (username) => `https://twitch.tv/${username}`,
  kick: (username) => `https://kick.com/${username}`,
  tiktok: (username) => `https://tiktok.com/@${username}`,
  bluesky: (username) => `https://bsky.app/profile/${username}`,
  music: (username, platformId) => `https://www.last.fm/music/${encodeURIComponent(username.replace(/-/g, '+'))}`,
  // Mastodon username is `user@instance.tld` — link to https://instance.tld/@user
  mastodon: (username) => {
    const [u, instance] = (username || '').split('@');
    return instance ? `https://${instance}/@${u}` : `https://mastodon.social/@${u}`;
  },
  // Rumble platform_id holds `c:slug` or `user:slug`. If we don't have it (called
  // with just username), default to /c/ — the /user/ fallback is handled by the
  // service when actually fetching.
  rumble: (username, platformId) => {
    if (platformId && platformId.includes(':')) {
      const [kind, slug] = platformId.split(':');
      return `https://rumble.com/${kind}/${slug}`;
    }
    return `https://rumble.com/c/${username}`;
  },
  // Substack username is the subdomain slug; the subdomain URL always resolves
  // (redirects to a custom domain if the publication uses one).
  substack: (username) => `https://${username}.substack.com`,
};

// Correctly-cased brand names live in lib/constants.js (single source of
// truth) — kept as a local alias here since this file's usages predate it.
const platformDisplayNames = PLATFORM_DISPLAY_NAMES;


// middleware.js embeds a <script id="__CREATOR_DATA__"> alongside the visible
// server-rendered content so this component's very first render already has
// real data instead of an empty loading skeleton — see the comment on
// `initialData` in middleware.js's getProfileContent for why that matters.
// Only trusted when it matches the URL actually being rendered (a client-side
// navigation to a different profile within the same session must not reuse
// the previous page's embedded data).
function readEmbeddedCreatorData(platform, username) {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('__CREATOR_DATA__');
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    if (data.platform !== platform || data.username?.toLowerCase() !== username?.toLowerCase()) return null;
    return data;
  } catch {
    return null;
  }
}

export default function CreatorProfile() {
  const { platform, username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  // No tier gates — every signed-in user gets full features.
  // Featured Listings is the only paid product; profile features are free.
  const maxFollows = Infinity;
  const hasExport = true;
  // Lazy initializers so readEmbeddedCreatorData only ever runs once, on the
  // very first render — not a bug if it's called from multiple initializers,
  // just wasteful, so it's read once here and reused.
  const [embeddedData] = useState(() => readEmbeddedCreatorData(platform, username));
  const [creator, setCreator] = useState(() => embeddedData ? {
    platform: embeddedData.platform,
    platformId: embeddedData.platformId,
    username: embeddedData.username,
    displayName: embeddedData.displayName,
    profileImage: embeddedData.profileImage,
    bannerImage: embeddedData.bannerImage,
    verified: embeddedData.verified,
    description: embeddedData.description,
    country: embeddedData.country,
    category: embeddedData.category,
    dbCreatedAt: embeddedData.dbCreatedAt,
    subscribers: embeddedData.subscribers,
    followers: embeddedData.followers,
    totalViews: embeddedData.totalViews,
    totalPosts: embeddedData.totalPosts,
    hoursWatchedDay: embeddedData.hoursWatchedDay,
    hoursWatchedWeek: embeddedData.hoursWatchedWeek,
    hoursWatchedMonth: embeddedData.hoursWatchedMonth,
    peakViewersDay: embeddedData.peakViewersDay,
    avgViewersDay: embeddedData.avgViewersDay,
    latestPost: embeddedData.latestPost,
  } : null);
  const [statsHistory, setStatsHistory] = useState(() => embeddedData?.statsHistory || []);
  // True once we've made a genuine attempt to fetch this creator's stats
  // history and know the real answer (populated OR confirmed empty for a
  // real brand-new creator) — distinct from `statsHistory.length`, which is
  // legitimately 0 in BOTH the "still loading" and "genuinely no history
  // yet" cases. Without this, the chart/verdict text can't tell those two
  // apart and shows "just added to tracking" for an established creator
  // during the ~1s fetch window. Seeded true when embedded server data is
  // present (already a real, current answer), reset false on every
  // subsequent load (see loadCreator below).
  const [statsReady, setStatsReady] = useState(() => !!embeddedData);
  const [loading, setLoading] = useState(() => !embeddedData);
  const [error, setError] = useState(null);
  const [chartRange, setChartRange] = useState(30);
  // Default to views for YouTube (subscriber counts are rounded by YouTube API)
  const [chartMetric, setChartMetric] = useState(platform === 'youtube' ? 'views' : 'subscribers');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [dbCreatorId, setDbCreatorId] = useState(() => embeddedData?.dbId || null); // Store database UUID
  const [isLive, setIsLive] = useState(false);
  const [liveStreamInfo, setLiveStreamInfo] = useState(null);
  const [recentVideos, setRecentVideos] = useState([]);
  const [musicTracks, setMusicTracks] = useState([]);
  const [musicAlbums, setMusicAlbums] = useState([]);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copiedProfile, setCopiedProfile] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedBadge, setCopiedBadge] = useState(false);
  const [peakStats, setPeakStats] = useState(null);
  const [rankContext, setRankContext] = useState(null);
  const [nearbyCreators, setNearbyCreators] = useState([]);
  const [grade, setGrade] = useState(null);
  const shareRef = useRef(null);
  // True only for the very first loadCreator() call of the very first
  // profile this component instance renders, and only when that first call
  // already has embedded data seeded. Lets loadCreator skip the loading-flash
  // reset on that one call while behaving completely normally on every
  // subsequent call (a client-side nav to a different creator, a retry, etc).
  const isFirstLoadRef = useRef(true);

  // Record/rank context is purely supplementary — fetched separately so a
  // failure here never blocks the main profile load. Rank and the neighbouring
  // creators arrive together from one RPC; fetching nearby creators separately
  // used to add a third sequential stage to the page's request waterfall.
  useEffect(() => {
    if (!dbCreatorId) return;
    let cancelled = false;
    (async () => {
      try {
        const [peak, rank, creatorGrade] = await Promise.all([
          getCreatorPeakStats(dbCreatorId),
          getCreatorRankContext(dbCreatorId, platform),
          getCreatorGrade(dbCreatorId),
        ]);
        if (cancelled) return;
        setPeakStats(peak);
        setRankContext(rank);
        setNearbyCreators(rank?.nearby || []);
        setGrade(creatorGrade);
      } catch (err) {
        logger.warn('Failed to load record/rank context:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [dbCreatorId, platform]);

  // Live-refresh stats while the tab is visible.
  // Polls supabase for the latest creator_stats row every 60s — cheap query, no external API hits.
  // Pauses when the tab is backgrounded to avoid wasted work.
  useEffect(() => {
    if (!dbCreatorId) return;
    let timer;

    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data } = await supabase
          .from('creator_stats')
          .select('subscribers, followers, total_views, total_posts, hours_watched_day, peak_viewers_day, avg_viewers_day, recorded_at')
          .eq('creator_id', dbCreatorId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setCreator((prev) => {
            if (!prev) return prev;
            const newSubs = data.subscribers ?? data.followers ?? prev.subscribers;
            // Only update if value actually changed — avoids re-renders
            if (
              newSubs === prev.subscribers &&
              (data.total_views ?? prev.totalViews) === prev.totalViews
            ) return prev;
            return {
              ...prev,
              subscribers: newSubs,
              followers: data.followers ?? newSubs,
              totalViews: data.total_views ?? prev.totalViews,
              totalPosts: data.total_posts ?? prev.totalPosts,
              hoursWatchedDay: data.hours_watched_day ?? prev.hoursWatchedDay,
              peakViewersDay: data.peak_viewers_day ?? prev.peakViewersDay,
              avgViewersDay: data.avg_viewers_day ?? prev.avgViewersDay,
            };
          });
        }
      } catch {
        // Polling failure is non-fatal — keep existing numbers
      }
    };

    timer = setInterval(refresh, 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dbCreatorId]);

  const loadCreator = async (skipLoadingFlash = false) => {
    if (!skipLoadingFlash) {
      setLoading(true);
      // Reset for a fresh load (a client-side nav to a different creator, or
      // a retry) — without this, statsReady stays stuck true from whatever
      // creator was shown before, and the new creator's chart briefly shows
      // stale-looking "no history" text instead of a loading skeleton.
      setStatsReady(false);
    }
    setError(null);

    // Rumble is delisted (2026-09-04) and, per direct 2026-09-15 instruction,
    // its existing profile pages no longer stay reachable either — this now
    // renders the same "not found" state as any other unknown creator. Rule
    // zero still applies: this is a rendering decision only, the 117 Rumble
    // creators' rows in `creators`/`creator_stats` are untouched in the DB.
    if (platform === 'rumble') {
      setError('Creator not found');
      setLoading(false);
      return;
    }

    try {
      let channelData = null;

      // DB fallback for the live-first platforms (YouTube/Twitch/Kick/Bluesky):
      // if the platform API is down, rate-limited, or a key is invalid, render
      // the profile from our own stored data instead of failing the whole page.
      // Counts stay null here — the standard merge logic below fills them from
      // the latest creator_stats row (same mechanism Rumble uses).
      const buildDbFallback = async () => {
        const dbCreator = await getCreatorByUsername(platform, username);
        if (!dbCreator) return null;
        // No live API to re-resolve against here (that's the whole reason
        // we're in the fallback), so if the username is ambiguous there is
        // no safe way to know which real creator this is. Confidently
        // showing the wrong one under someone else's name/URL is worse than
        // a clear "unavailable" error — better to surface the original
        // live-fetch error than guess. Verified 2026-08-31: without this
        // guard, /youtube/eminem's fallback picked a 469-subscriber copycat
        // over the real channel.
        if (await isUsernameAmbiguous(platform, username)) return null;
        return {
          platform,
          platformId: dbCreator.platform_id,
          username: dbCreator.username,
          displayName: dbCreator.display_name,
          profileImage: dbCreator.profile_image,
          bannerImage: dbCreator.banner_image,
          verified: dbCreator.verified,
          description: dbCreator.description,
          country: dbCreator.country,
          category: dbCreator.category,
          subscribers: null,
          followers: null,
          totalPosts: null,
          totalViews: null,
        };
      };

      if (platform === 'youtube') {
        try {
          // Priority 1: Use platformId from navigation state (e.g. from search results)
          // This avoids the race condition where search results haven't been persisted to DB yet
          const navPlatformId = location.state?.platformId;
          if (navPlatformId) {
            try {
              channelData = await getYouTubeChannelById(navPlatformId);
            } catch (e) {
              logger.warn('Failed to fetch by nav platformId, falling back:', e);
            }
          }

          // Priority 2: Check database for stored platform_id
          if (!channelData) {
            const knownCreator = await getCreatorByUsername('youtube', username);
            // Our own username derivation falls back to a channel's display
            // title when it has no claimed @handle, and titles aren't unique
            // on YouTube — this shortcut can silently pick a copycat/fan
            // channel's platform_id instead of the real one when several
            // creators share a username. Only trust it when the match is
            // unambiguous; otherwise fall through to Priority 3 below, which
            // resolves directly against YouTube's own real, unique handle.
            const ambiguous = knownCreator ? await isUsernameAmbiguous('youtube', username) : false;
            if (knownCreator?.platform_id && !ambiguous) {
              channelData = await getYouTubeChannelById(knownCreator.platform_id);
              // Verify the DB record points to the right channel — the stored username
              // must match what was requested (prevents stale/wrong DB mappings)
              if (channelData && channelData.username?.toLowerCase() !== username.toLowerCase()) {
                channelData = null;
              }
            }
          }

          // Priority 3: Look up by username/handle
          if (!channelData) {
            channelData = await getYouTubeChannel(username);
          }
        } catch (liveErr) {
          channelData = await buildDbFallback();
          if (!channelData) throw liveErr;
          logger.warn('YouTube live fetch failed, showing stored data:', liveErr);
        }
      } else if (platform === 'twitch') {
        try {
          channelData = await getTwitchChannel(username);
        } catch (liveErr) {
          channelData = await buildDbFallback();
          if (!channelData) throw liveErr;
          logger.warn('Twitch live fetch failed, showing stored data:', liveErr);
        }
      } else if (platform === 'kick') {
        try {
          channelData = await getKickChannel(username);
        } catch (liveErr) {
          channelData = await buildDbFallback();
          if (!channelData) throw liveErr;
          logger.warn('Kick live fetch failed, showing stored data:', liveErr);
        }
      } else if (platform === 'bluesky') {
        try {
          channelData = await getBlueskyProfile(username);
        } catch (liveErr) {
          channelData = await buildDbFallback();
          if (!channelData) throw liveErr;
          logger.warn('Bluesky live fetch failed, showing stored data:', liveErr);
        }
      } else if (platform === 'mastodon') {
        // Mastodon username is the full webfinger handle, e.g. "user@hachyderm.io".
        // DB-first because (a) the federated network has ~30 instances we track —
        // CSP can't enumerate them all, and (b) some instances rate-limit anon
        // lookups with 401. Live `/api/mastodon` proxy is used as fallback only.
        const dbCreator = await getCreatorByUsername('mastodon', username);
        if (dbCreator) {
          channelData = {
            platform: 'mastodon',
            platformId: dbCreator.platform_id,
            username: dbCreator.username,
            displayName: dbCreator.display_name,
            profileImage: dbCreator.profile_image,
            bannerImage: dbCreator.banner_image,
            verified: dbCreator.verified,
            description: dbCreator.description,
            country: dbCreator.country,
            category: dbCreator.category,
            subscribers: null,
            followers: null,
            totalPosts: null,
            totalViews: null,
            latestPost: dbCreator.latest_post_at ? {
              publishedAt: dbCreator.latest_post_at,
              title: dbCreator.latest_post_title,
              url: dbCreator.latest_post_url,
              thumbnail: dbCreator.latest_post_thumbnail,
            } : null,
            profileUrl: (() => {
              const [u, inst] = (dbCreator.username || '').split('@');
              return inst ? `https://${inst}/@${u}` : null;
            })(),
          };
          // Non-blocking: try to enrich latest post content. If the proxy errors
          // we keep the cached timestamp from the DB.
          try {
            const fresh = await getMastodonLatestStatus(dbCreator.username);
            if (fresh) channelData.latestPost = { ...(channelData.latestPost || {}), ...fresh };
          } catch { /* swallow — never fail the whole page on this */ }
        } else {
          // Lazy hydration for an unknown handle — go straight to the proxy in
          // full mode so we get profile + latest status in one round trip.
          channelData = await getMastodonProfile(username, { latest: true });
        }
      } else if (platform === 'substack') {
        // Substack: DB-first. The subscriber value is an order-of-magnitude
        // bucket from the category leaderboard, kept fresh by daily collection.
        // Lazy fallback hits the publication's homepage API for identity only.
        const dbCreator = await getCreatorByUsername('substack', username);
        if (dbCreator) {
          channelData = {
            platform: 'substack',
            platformId: dbCreator.platform_id,
            username: dbCreator.username,
            displayName: dbCreator.display_name,
            profileImage: dbCreator.profile_image,
            description: dbCreator.description,
            country: dbCreator.country,
            category: dbCreator.category,
            // subscribers/followers filled from latest creator_stats row below.
            subscribers: null,
            followers: null,
            totalPosts: null,
            totalViews: null,
            // Latest post is collected server-side (Substack's API is
            // CORS-blocked from the browser). Reactions live in
            // latest_post_views since Substack has no view metric.
            latestPost: dbCreator.latest_post_at ? {
              publishedAt: dbCreator.latest_post_at,
              title: dbCreator.latest_post_title,
              url: dbCreator.latest_post_url,
              reactions: dbCreator.latest_post_views,
            } : null,
          };
        } else {
          channelData = await getSubstackPublication(username);
        }
      } else if (platform === 'music') {
        // Music: username is a slug, platform_id is mbid or slug
        try {
          const navPlatformId = location.state?.platformId;
          const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (navPlatformId) {
            channelData = MBID_RE.test(navPlatformId)
              ? await getArtistByMbid(navPlatformId)
              : await getArtistByName(navPlatformId);
          }
          if (!channelData) {
            const dbCreator = await getCreatorByUsername('music', username);
            if (dbCreator?.platform_id) {
              channelData = MBID_RE.test(dbCreator.platform_id)
                ? await getArtistByMbid(dbCreator.platform_id)
                : await getArtistByName(dbCreator.display_name || username);
            }
          }
          if (!channelData) {
            throw new Error('Artist not found. Try searching Music for this artist.');
          }
        } catch (liveErr) {
          channelData = await buildDbFallback();
          if (!channelData) throw liveErr;
          logger.warn('Music live fetch failed, showing stored data:', liveErr);
        }
      } else if (platform === 'tiktok') {
        // TikTok: Load creator and latest stats from database in parallel
        const dbCreator = await getCreatorByUsername('tiktok', username);
        if (dbCreator) {
          // Start stats history fetch in parallel with latest stats
          const [latestStatsResult, history] = await Promise.all([
            supabase
              .from('creator_stats')
              .select('*')
              .eq('creator_id', dbCreator.id)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .single(),
            getCreatorStats(dbCreator.id, STATS_HISTORY_DAYS),
          ]);

          const latestStats = latestStatsResult.data;

          channelData = {
            platform: 'tiktok',
            platformId: dbCreator.platform_id,
            username: dbCreator.username,
            displayName: dbCreator.display_name || dbCreator.username,
            profileImage: dbCreator.profile_image,
            description: dbCreator.description,
            subscribers: latestStats?.followers || 0,
            followers: latestStats?.followers || 0,
            totalViews: latestStats?.total_views || 0,
            totalPosts: latestStats?.total_posts || 0,
            category: dbCreator.category,
            dbCreatedAt: dbCreator.created_at,
          };

          setDbCreatorId(dbCreator.id);
          setStatsHistory(history || []);
        }
        setStatsReady(true);
      } else {
        const dbCreator = await getCreatorByUsername(platform, username);
        if (dbCreator) {
          setCreator(dbCreator);
        }
        setStatsReady(true);
        setLoading(false);
        return;
      }

      if (channelData) {
        // Show profile immediately — don't wait for DB writes
        setCreator(channelData);
        setLoading(false);

        // Track profile view
        analytics.viewProfile(platform, username, channelData.displayName);

        // Track recently viewed
        addRecentlyViewed({
          platform,
          username: channelData.username || username,
          displayName: channelData.displayName,
          profileImage: channelData.profileImage,
          subscribers: channelData.subscribers,
          followers: channelData.followers,
        });

        // Fetch recent videos for YouTube channels (non-blocking)
        if (platform === 'youtube' && channelData.platformId) {
          getYouTubeRecentVideos(channelData.platformId).then(videos => {
            if (videos?.length) setRecentVideos(videos);
          });
        }

        // Load music-specific data (non-blocking)
        if (platform === 'music') {
          const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const isMbid = MBID_RE.test(channelData.platformId);
          const mbidParam = isMbid ? channelData.platformId : null;
          const nameParam = isMbid ? null : channelData.displayName;
          Promise.all([
            getArtistTopTracks(nameParam, mbidParam),
            getArtistTopAlbums(nameParam, mbidParam),
          ]).then(([tracks, albums]) => {
            setMusicTracks(tracks);
            setMusicAlbums(albums);
          }).catch(() => {});
        }

        // Check if streamer is live (non-blocking)
        if (platform === 'twitch' || platform === 'kick') {
          const liveStreamFn = platform === 'twitch' ? getTwitchLiveStreams : getKickLiveStreams;
          liveStreamFn([channelData.username || username]).then(liveData => {
            if (liveData && liveData.length > 0) {
              setIsLive(true);
              setLiveStreamInfo(liveData[0]);
            }
          }).catch(liveErr => {
            logger.warn('Failed to check live status:', liveErr);
          });
        }

        // DB operations in background — upsert, save stats, fetch history in parallel
        try {
          if (platform === 'youtube' && channelData.hasPublicPage === false) {
            logger.info('Skipping DB save for YouTube channel without public page:', username);
          } else if (platform !== 'tiktok') {
            // TikTok already fetched history above; other platforms do it here.
            // If the write path is down (proxy outage, RLS), fall back to the
            // existing DB row so the read-only history fetch below still runs.
            let dbCreator;
            try {
              dbCreator = await upsertCreator(channelData);
            } catch (upsertErr) {
              dbCreator = await getCreatorByUsername(platform, channelData.username || username);
              if (!dbCreator) throw upsertErr;
              logger.warn('Upsert failed, reading existing creator row:', upsertErr);
            }
            setDbCreatorId(dbCreator.id);
            setCreator(prev => ({ ...prev, dbCreatedAt: dbCreator.created_at }));

            // Save stats first, then fetch history. Skip when channelData has
            // null counts (Rumble synthesized-from-DB case) — the daily
            // collection script keeps stats fresh from the right IP range.
            // Non-fatal: a failed stats write must never block the read-only
            // history fetch below.
            if (channelData.subscribers || channelData.followers) {
              try {
                await saveCreatorStats(dbCreator.id, {
                  subscribers: channelData.subscribers || channelData.followers,
                  totalViews: channelData.totalViews,
                  totalPosts: channelData.totalPosts,
                });
              } catch (statsErr) {
                logger.warn('Failed to save stats snapshot:', statsErr);
              }
            }

            // Now fetch history + hours watched in parallel (both read-only)
            const readOps = [getCreatorStats(dbCreator.id, STATS_HISTORY_DAYS)];
            if (platform === 'twitch' || platform === 'kick') {
              readOps.push(getHoursWatched(dbCreator.id));
            }

            const results = await Promise.allSettled(readOps);

            // Update stats history (only if successful)
            if (results[0].status === 'fulfilled') {
              const history = results[0].value || [];
              setStatsHistory(history);
              // For platforms where we didn't live-fetch current stats (Rumble:
              // edge 403s our IPs), populate the displayed counts from the
              // most recent stats row. getCreatorStats returns ASCENDING order,
              // so the latest row is the LAST element (history[0] was showing
              // 90-day-old counts on every DB-first profile).
              if (history.length > 0 && !channelData.subscribers && !channelData.followers) {
                const latest = history[history.length - 1];
                setCreator(prev => ({
                  ...prev,
                  subscribers: latest.subscribers || latest.followers || 0,
                  followers: latest.followers || latest.subscribers || 0,
                  totalPosts: latest.total_posts || 0,
                  totalViews: latest.total_views || null,
                }));
              }
            }

            // Update hours watched data for Twitch/Kick (only if successful)
            if ((platform === 'twitch' || platform === 'kick') && results[1]?.status === 'fulfilled' && results[1].value) {
              const hoursWatchedData = results[1].value;
              setCreator(prev => ({
                ...prev,
                hoursWatchedDay: hoursWatchedData.hours_watched_day,
                hoursWatchedWeek: hoursWatchedData.hours_watched_week,
                hoursWatchedMonth: hoursWatchedData.hours_watched_month,
                peakViewersDay: hoursWatchedData.peak_viewers_day,
                avgViewersDay: hoursWatchedData.avg_viewers_day,
              }));
            }
          }
        } catch (dbErr) {
          logger.warn('Failed to save to database:', dbErr);
        } finally {
          // Whatever happened above, we've now made the real attempt at this
          // creator's stats history — fires whether it succeeded, partially
          // failed, or the youtube-no-public-page branch skipped it entirely.
          setStatsReady(true);
        }
      }
    } catch (err) {
      logger.error('Error loading creator:', err);
      setError(err.message || 'Failed to load creator');
      setStatsReady(true);
    } finally {
      setLoading(false);
    }
  };

  // Declared after loadCreator so the effect never reads it before its
  // declaration (react-hooks/immutability).
  useEffect(() => {
    loadCreator(isFirstLoadRef.current && !!embeddedData);
    isFirstLoadRef.current = false;
  }, [platform, username]);

  // Check follow status when user and creator are available
  useEffect(() => {
    async function checkFollowStatus() {
      if (isAuthenticated && user && dbCreatorId) {
        const following = await checkIsFollowing(user.id, dbCreatorId);
        setIsFollowing(following);
      }
    }
    checkFollowStatus();
  }, [isAuthenticated, user, dbCreatorId]);

  const handleFollowToggle = async () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to follow creators and see their latest stats quicker!' }
      }));
      return;
    }

    if (!dbCreatorId) {
      logger.error('Creator not found in database');
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowCreator(user.id, dbCreatorId);
        setIsFollowing(false);
        toast.success(`Unfollowed ${creator?.displayName || username}`);
      } else {
        await followCreator(user.id, dbCreatorId);
        setIsFollowing(true);
        toast.success(`Following ${creator?.displayName || username}`, {
          description: 'See your followed creators on the Dashboard.',
        });
      }
    } catch (err) {
      logger.error('Failed to toggle follow:', err);
      toast.error('Could not update follow status. Try again in a moment.');
    } finally {
      setFollowLoading(false);
    }
  };

  const profileUrl = `${window.location.origin}/${platform}/${creator?.username || username}`;
  const shareUrl = `${window.location.origin}/s/${platform}/${creator?.username || username}`;
  const embedCode = `<iframe src="${shareUrl}" width="520" height="400" frameborder="0" style="border-radius:16px;border:1px solid #e5e5e5" allowfullscreen></iframe>`;
  // Live SVG badge served by the edge — the anchor makes every embed a backlink.
  const badgeUrl = `https://shinypull.com/badge/${platform}/${encodeURIComponent(creator?.username || username)}`;
  const badgeEmbed = `<a href="${profileUrl}?utm_source=badge"><img src="${badgeUrl}" width="240" height="64" alt="${(creator?.displayName || username)} ${platformDisplayNames[platform] || platform} stats on ShinyPull"></a>`;
  // Share + embed are free for everyone — kept variable for minimal blast radius.
  const isMod = true;

  useEffect(() => {
    if (!showSharePanel) return;
    const handleClickOutside = (e) => {
      if (shareRef.current && !shareRef.current.contains(e.target)) {
        setShowSharePanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSharePanel]);

  const handleShareClick = () => setShowSharePanel(prev => !prev);

  const handleCopyProfile = () => {
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopiedProfile(true);
      toast.success('Profile link copied');
      setTimeout(() => setCopiedProfile(false), 2000);
    });
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedUrl(true);
      toast.success('Share link copied');
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopiedEmbed(true);
      toast.success('Embed code copied', { description: 'Paste into Notion, your site, or anywhere iframes work.' });
      setTimeout(() => setCopiedEmbed(false), 2000);
    });
  };

  const handleCopyBadge = () => {
    navigator.clipboard.writeText(badgeEmbed).then(() => {
      setCopiedBadge(true);
      toast.success('Badge code copied', { description: 'Paste the HTML anywhere. The count stays up to date automatically.' });
      setTimeout(() => setCopiedBadge(false), 2000);
    });
  };

  const Icon = platformIcons[platform];
  const colors = platformColors[platform] || platformColors.youtube;

  // Memoized on statsHistory only — this component re-renders often for
  // reasons that have nothing to do with stats (60s live-poll ticks, follow
  // toggles, share panel open/close), and re-sorting/re-slicing up to 90
  // rows of history on every one of those renders was pure waste.
  const metrics = useMemo(() => {
    if (statsHistory.length < 2) return null;

    const sortedStats = [...statsHistory].sort((a, b) =>
      new Date(b.recorded_at) - new Date(a.recorded_at)
    );

    const latest = sortedStats[0];

    const dailyStats = sortedStats.map((stat, index) => {
      const prevStat = sortedStats[index + 1];
      return {
        ...stat,
        subsChange: prevStat ? (stat.subscribers || stat.followers) - (prevStat.subscribers || prevStat.followers) : 0,
        viewsChange: prevStat ? stat.total_views - prevStat.total_views : 0,
        videosChange: prevStat ? (stat.total_posts || 0) - (prevStat.total_posts || 0) : 0,
      };
    });

    // "Last 30 days" baseline = the oldest reading dated within the last 30
    // calendar days, the exact rule the chart's 30D view uses (see
    // buildYouTubeSeries), so the stat cards and the chart's "net" can never
    // disagree. It used to be the 30th row back, which lands a day or two
    // earlier whenever a day's reading is missing (-5.6K card vs -5.4K chart).
    // Falls back to that row-based pick only when collection has stalled and
    // fewer than two readings fall inside the window.
    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);
    const inWindow = sortedStats.filter((s) => new Date(s.recorded_at) >= cutoff30);
    const last30Stat = inWindow.length >= 2
      ? inWindow[inWindow.length - 1]
      : sortedStats[Math.min(29, sortedStats.length - 1)];

    const subsGrowth = (latest.subscribers || latest.followers) - (last30Stat.subscribers || last30Stat.followers);
    const viewsGrowth = latest.total_views - last30Stat.total_views;
    const videosGrowth = (latest.total_posts || 0) - (last30Stat.total_posts || 0);

    // Use actual calendar days between the 30-day lookback point and today, not row count.
    // Rows can have gaps (e.g. 28 rows spanning 30 calendar days), so dividing by
    // row count overstates daily/weekly averages and skews milestone predictions.
    const calendarDays = Math.max(1, Math.round(
      (new Date(latest.recorded_at) - new Date(last30Stat.recorded_at)) / (1000 * 60 * 60 * 24)
    ));
    const dailyAvgSubs = Math.round(subsGrowth / calendarDays);
    const dailyAvgViews = Math.round(viewsGrowth / calendarDays);
    const weeklyAvgSubs = Math.round(subsGrowth / (calendarDays / 7));
    const weeklyAvgViews = Math.round(viewsGrowth / (calendarDays / 7));

    const last14Days = sortedStats.slice(0, Math.min(14, sortedStats.length));
    const last14First = last14Days[last14Days.length - 1];
    const last14Subs = last14Days.length > 1 ? (latest.subscribers || latest.followers) - (last14First.subscribers || last14First.followers) : 0;
    const last14Views = last14Days.length > 1 ? latest.total_views - last14First.total_views : 0;

    // Calculate 7-day and 30-day growth percentages
    const last7Days = sortedStats.slice(0, Math.min(7, sortedStats.length));
    const last7First = last7Days[last7Days.length - 1];
    const growth7DayPercent = last7Days.length > 1 && last7First.subscribers
      ? ((latest.subscribers || latest.followers) - (last7First.subscribers || last7First.followers)) / (last7First.subscribers || last7First.followers) * 100
      : 0;

    const growth30DayPercent = last30Stat.subscribers || last30Stat.followers
      ? subsGrowth / (last30Stat.subscribers || last30Stat.followers) * 100
      : 0;

    // dailyAvgSubs above is a real, correctly-measured average, but it's
    // measured across whatever the last 30 available ROWS span, not the
    // last 30 calendar days from today. For a creator whose collection has
    // stalled (an outage, a dead scraper) those rows can end weeks in the
    // past, so the average describes a window that's no longer current even
    // though the arithmetic is right. daysSinceLastUpdate lets the verdict
    // sentence below tell the difference between "here's today's trend" and
    // "here's what the trend was, last time we had data."
    const daysSinceLastUpdate = Math.floor((new Date() - new Date(latest.recorded_at)) / (1000 * 60 * 60 * 24));

    return {
      dailyStats: dailyStats.slice(0, 14),
      last30Days: { subs: subsGrowth, views: viewsGrowth, videos: videosGrowth },
      last14Days: { subs: last14Subs, views: last14Views },
      growthRates: { sevenDay: growth7DayPercent, thirtyDay: growth30DayPercent },
      dailyAverage: { subs: dailyAvgSubs, views: dailyAvgViews },
      daysSinceLastUpdate,
      weeklyAverage: { subs: weeklyAvgSubs, views: weeklyAvgViews },
    };
  }, [statsHistory]);

  if (loading) {
    return (
      <>
        <SEO title="Loading..." />
        <ProfileSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-8">
        <SEO title="Creator Not Found" noindex />
        <div className="max-w-4xl mx-auto">
          <FunErrorState
            type={error.includes('not found') || error.includes('Not found') ? 'notfound' : 'server'}
            message={error}
            onRetry={loadCreator}
            retryText="Try Again"
          />
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-8">
        <SEO title="Creator Not Found" noindex />
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8">
            <div className="flex items-start gap-6 mb-8">
              <div className={`w-24 h-24 ${colors.light} rounded-2xl flex items-center justify-center`}>
                {Icon && <Icon className={`w-12 h-12 ${colors.text}`} />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-neutral-900">@{username}</h1>
                  <a
                    href={platformUrls[platform]?.(username, creator?.platformId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm hover:opacity-90 transition-opacity ${
                      platform === 'youtube' || platform === 'twitch'
                        ? `bg-white border ${colors.border} ${colors.text}`
                        : `${colors.bg} text-white`
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {platformDisplayNames[platform] || platform}
                  </a>
                </div>
                <p className="text-neutral-700 mb-4">Creator not found</p>
                <a
                  href={platformUrls[platform]?.(username, creator?.platformId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Check on {platformDisplayNames[platform] || platform}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const primaryCount = creator.subscribers || creator.followers || 0;
  const primaryLabel = platform === 'twitch' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble' ? 'followers' : platform === 'music' ? 'listeners' : 'subscribers';

  const platformName = platformDisplayNames[platform] || platform.charAt(0).toUpperCase() + platform.slice(1);
  const seoTitle = primaryCount > 0
    ? `${creator.displayName} ${platformName} Stats (${formatNumber(primaryCount)} ${primaryLabel})`
    : `${creator.displayName} ${platformName} Statistics`;

  const seoDescription = (() => {
    const name = creator.displayName;
    const count = formatNumber(primaryCount);
    if (platform === 'youtube') {
      const views = creator.totalViews ? ` and ${formatNumber(creator.totalViews)} total views` : '';
      return `${name} has ${count} YouTube subscribers${views}. Track live stats, 30-day growth, earnings estimates, and full channel analytics on ShinyPull.`;
    }
    if (platform === 'tiktok') {
      const likes = creator.totalViews ? ` and ${formatNumber(creator.totalViews)} total likes` : '';
      return `${name} has ${count} TikTok followers${likes}. Track follower growth, post history, and analytics on ShinyPull.`;
    }
    if (platform === 'twitch') {
      return `${name} has ${count} Twitch followers. View hours watched, peak viewers, stream history, and growth trends on ShinyPull.`;
    }
    if (platform === 'kick') {
      return `${name} has ${count} Kick subscribers. View live stream stats, growth trends, and channel analytics on ShinyPull.`;
    }
    if (platform === 'bluesky') {
      const posts = creator.totalPosts ? ` and ${formatNumber(creator.totalPosts)} posts` : '';
      return `${name} has ${count} Bluesky followers${posts}. Track follower growth and post activity on ShinyPull.`;
    }
    if (platform === 'music') {
      const plays = creator.totalViews ? ` and ${formatNumber(creator.totalViews)} total plays` : '';
      return `${name} has ${count} monthly listeners${plays}. Track listener growth, total plays, and genre stats on ShinyPull.`;
    }
    if (platform === 'mastodon') {
      const posts = creator.totalPosts ? ` and ${formatNumber(creator.totalPosts)} posts` : '';
      return `${name} has ${count} Mastodon followers${posts}. Track follower growth and post activity on ShinyPull.`;
    }
    if (platform === 'substack') {
      return `${name} has ${count} subscribers on Substack. See where this newsletter ranks across every Substack category on ShinyPull.`;
    }
    return `Track ${name}'s ${platformName} statistics including followers, growth, and analytics on ShinyPull.`;
  })();

  const seoKeywords = `${creator.displayName} ${platformName} stats, ${creator.displayName} ${primaryLabel}, ${creator.displayName} analytics, ${platformName} statistics, ${creator.displayName} growth`;

  const profileSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    'name': `${creator.displayName} ${platformName} Statistics`,
    'url': `https://shinypull.com/${platform}/${creator.username}`,
    'mainEntity': {
      '@type': 'Person',
      'name': creator.displayName,
      'identifier': creator.username,
      ...(creator.profileImage ? { 'image': creator.profileImage } : {}),
      ...(creator.description ? { 'description': creator.description } : {}),
    },
  };

  // Breadcrumb schema — gives Google the "Home > Rankings > Platform > Creator" path
  // for richer search result snippets.
  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home',         url: 'https://shinypull.com' },
    { name: 'Rankings',     url: 'https://shinypull.com/rankings' },
    { name: platformName,   url: `https://shinypull.com/rankings/${platform}` },
    { name: creator.displayName, url: `https://shinypull.com/${platform}/${creator.username}` },
  ]);

  return (
    <>
      <SEO
        title={seoTitle}
        description={seoDescription}
        keywords={seoKeywords}
        // One shared profile card rather than a per-creator generated one.
        // The old /og-image/:platform/:username route rendered that creator's
        // live stats, but it was only ever set here on the client, so social
        // scrapers reading the server HTML never saw it anyway; middleware.js
        // now serves this same static card for every profile URL.
        image="https://shinypull.com/og/profile.jpg"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(profileSchema).replace(/<\/script>/gi, '<\\/script>') }} />
      <StructuredData schema={breadcrumbSchema} />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Hero banner — uses the creator's channel art as background with gradient fade.
            No banner: flat paper + a faint dot-grid texture (same motif as the home hero,
            adapted for light backgrounds) instead of a colored gradient wash. Product
            pages stay light and functional-color-only per the site's design system —
            platform identity already reads from the badge pill below, not this banner. */}
        <div className="relative h-40 sm:h-48 md:h-56 overflow-hidden">
          {creator.bannerImage ? (
            <>
              <img
                src={creator.bannerImage}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover opacity-60 scale-105 blur-[2px]"
              />
              <img
                src={creator.bannerImage}
                alt="Channel banner"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)' }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-neutral-100 hero-dot-grid-light" />
          )}
          {/* Bottom gradient fade so the card overlap is seamless */}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#fafaf9] via-[#fafaf9]/80 to-transparent pointer-events-none" />
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Profile Header — overlaps the banner */}
            <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 sm:p-6 md:p-8 mb-6 relative z-10 -mt-24 sm:-mt-28 md:-mt-32">
              {/* Action Buttons - Top Right */}
              <div ref={shareRef} className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
                {/* Compare button */}
                <button
                  onClick={() => navigate(`/compare?creators=${platform}:${username}`)}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-colors text-sm border bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                  title="Compare this creator"
                >
                  <Scale className="w-4 h-4" />
                  {/* Label only from lg up. Between md and lg the header puts
                      the avatar and name side by side while this cluster is
                      absolutely positioned over the same band, and a labelled
                      cluster (349px) leaves too little room for a long display
                      name beside the platform badge. */}
                  <span className="hidden lg:inline">Compare</span>
                </button>

                {/* Share button + panel */}
                <div>
                  <button
                    onClick={handleShareClick}
                    className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-colors text-sm border ${
                      showSharePanel
                        ? 'bg-neutral-900 border-neutral-900 text-white'
                        : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden lg:inline">Share</span>
                  </button>
                </div>

                  {/* Share panel dropdown */}
                  {showSharePanel && (
                    <div className="absolute top-full right-0 mt-2 w-[min(320px,calc(100vw-2rem))] bg-white border border-neutral-200 rounded-xl shadow-2xl p-4 z-30">

                      {/* Profile URL — everyone */}
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Profile URL</p>
                      <div className="flex items-center gap-2 mb-4">
                        <input
                          readOnly
                          value={profileUrl}
                          className="flex-1 min-w-0 px-3 py-2 bg-neutral-100 border border-neutral-300 rounded-lg text-xs text-neutral-800 font-mono truncate"
                        />
                        <button
                          onClick={handleCopyProfile}
                          className={`flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            copiedProfile ? 'bg-emerald-600 text-white' : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                          }`}
                        >
                          {copiedProfile ? 'Copied!' : 'Copy'}
                        </button>
                      </div>

                      {/* Clean share link — Mod only */}
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Clean share link</p>
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <input
                          readOnly
                          value={shareUrl}
                          className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-xs font-mono truncate bg-neutral-100 border-neutral-300 text-neutral-800"
                        />
                        <button
                          onClick={handleCopyUrl}
                          className={`flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            copiedUrl ? 'bg-emerald-600 text-white' : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                          }`}
                        >
                          {copiedUrl ? 'Copied!' : 'Copy'}
                        </button>
                      </div>

                      {/* Embed code */}
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Embed code</p>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          readOnly
                          value={embedCode}
                          className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-xs font-mono truncate bg-neutral-100 border-neutral-300 text-neutral-800"
                        />
                        <button
                          onClick={handleCopyEmbed}
                          className={`flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            copiedEmbed ? 'bg-emerald-700 text-emerald-100' : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                          }`}
                        >
                          {copiedEmbed ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      {isMod && <p className="text-xs text-neutral-400 mb-4">Embed works in Notion, websites, and anywhere iframes are supported.</p>}

                      {/* Stats badge — live-count image that links back to this profile */}
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Stats badge</p>
                      </div>
                      <a href={profileUrl} onClick={(e) => e.preventDefault()} className="inline-block mb-2 cursor-default">
                        <img
                          src={badgeUrl}
                          width="240"
                          height="64"
                          alt={`${creator?.displayName || username} stats badge`}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </a>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          readOnly
                          value={badgeEmbed}
                          className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-xs font-mono truncate bg-neutral-100 border-neutral-300 text-neutral-800"
                        />
                        <button
                          onClick={handleCopyBadge}
                          className={`flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            copiedBadge ? 'bg-emerald-600 text-white' : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                          }`}
                        >
                          {copiedBadge ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-neutral-400">A live badge for your website or blog. The count updates automatically and links back to this page. <Link to="/badge" className="underline hover:text-neutral-600">Markdown and more options</Link>.</p>
                    </div>
                  )}

                {/* Follow button — primary action is black-on-white; followed
                    state is a quiet bordered pill */}
                <button
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className={`inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                    isFollowing
                      ? 'bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Star className={`w-4 h-4 ${isFollowing ? 'fill-current' : ''}`} />
                  {followLoading ? 'Loading...' : isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>

              <div className="flex flex-col md:flex-row items-start gap-4 sm:gap-6">
                {(platform === 'music' && (!creator.profileImage || creator.profileImage.includes('2a96cbd8b46e442fc41c2b86b821562f'))) ? (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-amber-50 border-4 border-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] flex items-center justify-center flex-shrink-0">
                    <Music className="w-10 h-10 sm:w-12 sm:h-12 text-amber-600" />
                  </div>
                ) : (
                  <CreatorAvatar
                    src={creator.profileImage}
                    name={creator.displayName}
                    size="2xl"
                    rounded="rounded-2xl"
                    loading="eager"
                    className="sm:w-24 sm:h-24 md:w-28 md:h-28 border-4 border-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
                  />
                )}
                <div className="flex-1 w-full">
                  {/* Reserve room for the absolutely-positioned action cluster
                      above. Only needed from md up: below that the header
                      stacks (flex-col) and this row sits under the buttons
                      rather than beside them. Without it a long display name
                      plus the platform badge runs underneath the buttons. */}
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap md:pr-64 lg:pr-96">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-neutral-900">{creator.displayName}</h1>
                    <a
                      href={platformUrls[platform]?.(creator.username || username, creator?.platformId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm hover:opacity-90 transition-opacity ${
                        platform === 'youtube' || platform === 'twitch'
                          ? `bg-white border ${colors.border} ${colors.text}`
                          : `${colors.bg} text-white`
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {Icon && <Icon className="w-3 h-3 sm:w-4 sm:h-4" />}
                      {platformDisplayNames[platform] || platform}
                    </a>
                    {isLive && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm bg-red-500 text-white animate-pulse">
                        <Radio className="w-3 h-3 sm:w-4 sm:h-4" />
                        LIVE
                      </span>
                    )}
                    {creator.country && (
                      <span className="px-2 sm:px-2.5 py-1 bg-neutral-100 rounded-lg text-xs sm:text-sm text-neutral-700 font-medium">
                        {creator.country}
                      </span>
                    )}
                    {grade?.stars != null && (
                      <StarRating stars={grade.stars} size={16} className="px-2 sm:px-2.5 py-1 bg-neutral-50 border border-neutral-200/80 rounded-full" />
                    )}
                  </div>
                  <p className="text-sm sm:text-base text-neutral-700 mb-1">@{creator.username}</p>

                  {/* Data Freshness Indicator */}
                  <div className="flex items-center gap-1.5 text-xs text-neutral-700 mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Updated {(() => {
                        // creator.updated_at is never actually set anywhere in this
                        // file (checked: no channelData branch or setCreator call
                        // populates it, for any platform), so this always silently
                        // fell back to the vague "recently" regardless of real
                        // staleness. The real signal is the latest creator_stats
                        // row we already have in statsHistory (ascending order, so
                        // the last element is the most recent).
                        const latestStat = statsHistory.length > 0 ? statsHistory[statsHistory.length - 1] : null;
                        if (!latestStat?.recorded_at) return 'recently';
                        const updated = new Date(latestStat.recorded_at);
                        const now = new Date();
                        const diffHours = Math.floor((now - updated) / (1000 * 60 * 60));
                        if (diffHours < 1) return 'less than an hour ago';
                        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                        const diffDays = Math.floor(diffHours / 24);
                        if (diffDays === 1) return 'yesterday';
                        return `${diffDays} days ago`;
                      })()}
                    </span>
                  </div>

                  {/* Social Links */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <a
                      href={platformUrls[platform]?.(creator.username, creator?.platformId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 sm:gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-xs sm:text-sm"
                    >
                      <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">View on {platform === 'music' ? 'Last.fm' : platformDisplayNames[platform] || platform}</span>
                      <span className="xs:hidden">View</span>
                    </a>

                    {/* Watch Live Button for Twitch */}
                    {isLive && platform === 'twitch' && (
                      <>
                        <span className="text-neutral-700">•</span>
                        <a
                          href={`https://twitch.tv/${creator.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-medium text-xs sm:text-sm rounded-full transition-colors"
                        >
                          <Radio className="w-3 h-3" />
                          Watch Live
                          {liveStreamInfo?.viewer_count && (
                            <span className="ml-1 text-red-200">
                              ({formatNumber(liveStreamInfo.viewer_count)} viewers)
                            </span>
                          )}
                        </a>
                      </>
                    )}

                    {/* Additional social links for YouTube channels */}
                    {platform === 'youtube' && creator.platformId && (
                      <>
                        <a
                          href={`https://www.youtube.com/channel/${creator.platformId}/about`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          About
                        </a>
                        <a
                          href={`https://www.youtube.com/channel/${creator.platformId}/videos`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          Videos
                        </a>
                        <a
                          href={`https://www.youtube.com/channel/${creator.platformId}/community`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          Community
                        </a>
                      </>
                    )}

                    {/* Twitch-specific links */}
                    {platform === 'twitch' && (
                      <>
                        <a
                          href={`https://twitch.tv/${creator.username}/videos`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          Videos
                        </a>
                        <a
                          href={`https://twitch.tv/${creator.username}/schedule`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          Schedule
                        </a>
                        <a
                          href={`https://twitch.tv/${creator.username}/about`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          About
                        </a>
                      </>
                    )}

                    {/* Music-specific links */}
                    {platform === 'music' && (
                      <>
                        <a
                          href={`https://www.last.fm/music/${encodeURIComponent(creator.displayName)}/+wiki`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          Wiki
                        </a>
                        <a
                          href={`https://www.last.fm/music/${encodeURIComponent(creator.displayName)}/+similar`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
                        >
                          Similar Artists
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {platform === 'music' ? (
                creator.bio && (
                  <p className="text-neutral-700 text-sm mt-6 line-clamp-4 leading-relaxed">
                    {creator.bio}
                  </p>
                )
              ) : (
                creator.description && (
                  <p className="text-neutral-700 text-sm mt-6 line-clamp-3 leading-relaxed">
                    {creator.description}
                  </p>
                )
              )}
            </div>

            {/* "Awaiting first data point" banner —
                Some creators are added via the lazy-hydration flow when a user
                visits a profile URL for a brand-new account with 0 subs. The
                creator row exists but the data-integrity guard refuses to write
                a stats row with 0 subscribers, so the stat cards would show "0"
                everywhere. This banner is a friendlier explanation than a zero. */}
            {statsHistory.length === 0 && (creator.subscribers || creator.followers || 0) === 0 && (
              <div className="mb-6 bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 sm:p-6">
                <div className="flex items-start gap-3.5">
                  <Clock className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-neutral-900 mb-1">We just added this creator to our tracker.</h3>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      Stats will appear once {platformDisplayNames[platform] || platform} reports the first data point. Daily snapshots start as soon as the account has any followers.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {platform === 'youtube' && (
              <YouTubeVerdictSection
                creator={creator}
                statsHistory={statsHistory}
                statsReady={statsReady}
                metrics={metrics}
                peakStats={peakStats}
                rankContext={rankContext}
                dbCreatorId={dbCreatorId}
                recentVideos={recentVideos}
              />
            )}

            {GENERIC_PLATFORM_CONFIG[platform] && (
              <GenericVerdictSection
                platform={platform}
                creator={creator}
                statsHistory={statsHistory}
                statsReady={statsReady}
                metrics={metrics}
                peakStats={peakStats}
                rankContext={rankContext}
                musicTracks={musicTracks}
                musicAlbums={musicAlbums}
              />
            )}

            <SimilarCreators
              creators={nearbyCreators}
              platform={platform}
              platformName={platformName}
              primaryLabel={primaryLabel}
              excludeId={dbCreatorId}
            />
          </div>
        </div>
      </div>
    </>
  );
}
