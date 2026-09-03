import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { Users, Eye, Video, TrendingUp, ExternalLink, AlertCircle, Calendar, Target, Clock, Radio, Star, Play, ThumbsUp, MessageCircle, Lock, Share2, Check, Scale } from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import FunErrorState from '../components/FunErrorState';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { getChannelByUsername as getYouTubeChannel, getChannelById as getYouTubeChannelById, getRecentVideos as getYouTubeRecentVideos } from '../services/youtubeService';
import { getChannelByUsername as getTwitchChannel, getLiveStreams as getTwitchLiveStreams } from '../services/twitchService';
import { getChannelByUsername as getKickChannel, getLiveStreams as getKickLiveStreams } from '../services/kickService';
import { getBlueskyProfile } from '../services/blueskyService';
import { getMastodonProfile, getMastodonLatestStatus } from '../services/mastodonService';
import { getRumbleChannel } from '../services/rumbleService';
import { getSubstackPublication } from '../services/substackService';
import SubstackIcon from '../components/SubstackIcon';
import { getArtistByMbid, getArtistByName, getArtistTopTracks, getArtistTopAlbums } from '../services/musicService';
import { Music } from 'lucide-react';
import MusicIcon from '../components/MusicIcon';
import { upsertCreator, saveCreatorStats, getCreatorByUsername, isUsernameAmbiguous, getCreatorStats, getHoursWatched, getCreatorPeakStats, getCreatorRankContext } from '../services/creatorService';
import CreatorAvatar from '../components/CreatorAvatar';
import { ProfileSkeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import { followCreator, unfollowCreator, isFollowing as checkIsFollowing, getFollowedCreators } from '../services/followService';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import StructuredData, { createPersonSchema, createBreadcrumbSchema } from '../components/StructuredData';
import { analytics } from '../lib/analytics';
import { formatNumber, formatRelativeTime } from '../lib/utils';
import { addRecentlyViewed } from '../lib/recentlyViewed';
import logger from '../lib/logger';
import { supabase } from '../lib/supabase';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';

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
  const shareRef = useRef(null);
  // True only for the very first loadCreator() call of the very first
  // profile this component instance renders, and only when that first call
  // already has embedded data seeded. Lets loadCreator skip the loading-flash
  // reset on that one call while behaving completely normally on every
  // subsequent call (a client-side nav to a different creator, a retry, etc).
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    loadCreator(isFirstLoadRef.current && !!embeddedData);
    isFirstLoadRef.current = false;
  }, [platform, username]);

  // Record/rank context is purely supplementary — fetched separately so a
  // failure here never blocks the main profile load. Rank and the neighbouring
  // creators arrive together from one RPC; fetching nearby creators separately
  // used to add a third sequential stage to the page's request waterfall.
  useEffect(() => {
    if (!dbCreatorId) return;
    let cancelled = false;
    (async () => {
      try {
        const [peak, rank] = await Promise.all([
          getCreatorPeakStats(dbCreatorId),
          getCreatorRankContext(dbCreatorId, platform),
        ]);
        if (cancelled) return;
        setPeakStats(peak);
        setRankContext(rank);
        setNearbyCreators(rank?.nearby || []);
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
    if (!skipLoadingFlash) setLoading(true);
    setError(null);

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
      } else if (platform === 'rumble') {
        // Rumble: DB-first, because Rumble's edge 403s Vercel datacenter IPs.
        // Our daily collection (running from GitHub Actions IPs that don't get
        // blocked) keeps the stats fresh. The /api/rumble proxy stays as a
        // last-resort for creators not yet in the DB.
        const dbCreator = await getCreatorByUsername('rumble', username);
        if (dbCreator) {
          channelData = {
            platform: 'rumble',
            platformId: dbCreator.platform_id,
            username: dbCreator.username,
            displayName: dbCreator.display_name,
            profileImage: dbCreator.profile_image,
            bannerImage: dbCreator.banner_image,
            verified: dbCreator.verified,
            description: dbCreator.description,
            country: dbCreator.country,
            category: dbCreator.category,
            // subscribers/followers/totalPosts are filled in from the latest
            // creator_stats row by the page's standard merge logic below.
            subscribers: null,
            followers: null,
            totalPosts: null,
            totalViews: null,
            latestPost: dbCreator.latest_post_at ? {
              publishedAt: dbCreator.latest_post_at,
              title: dbCreator.latest_post_title,
              url: dbCreator.latest_post_url,
              thumbnail: dbCreator.latest_post_thumbnail,
              views: dbCreator.latest_post_views,
            } : null,
          };
        } else {
          channelData = await getRumbleChannel(username);
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
          };

          setDbCreatorId(dbCreator.id);
          setStatsHistory(history || []);
        }
      } else {
        const dbCreator = await getCreatorByUsername(platform, username);
        if (dbCreator) {
          setCreator(dbCreator);
        }
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
        }
      }
    } catch (err) {
      logger.error('Error loading creator:', err);
      setError(err.message || 'Failed to load creator');
    } finally {
      setLoading(false);
    }
  };

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
  const badgeEmbed = `<a href="${profileUrl}?utm_source=badge"><img src="${badgeUrl}" width="240" height="64" alt="${(creator?.display_name || username)} ${platformDisplayNames[platform] || platform} stats on ShinyPull"></a>`;
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

    // For "Last 30 days" metrics, use the 30th data point back from today (not the absolute
    // oldest in the 90-day window). sortedStats is descending, so index 29 = ~30 days ago.
    const last30Stat = sortedStats[Math.min(29, sortedStats.length - 1)];

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

    return {
      dailyStats: dailyStats.slice(0, 14),
      last30Days: { subs: subsGrowth, views: viewsGrowth, videos: videosGrowth },
      last14Days: { subs: last14Subs, views: last14Views },
      growthRates: { sevenDay: growth7DayPercent, thirtyDay: growth30DayPercent },
      dailyAverage: { subs: dailyAvgSubs, views: dailyAvgViews },
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
    if (platform === 'rumble') {
      const videos = creator.totalPosts ? ` and ${formatNumber(creator.totalPosts)} videos` : '';
      return `${name} has ${count} Rumble followers${videos}. Track follower growth and video output on ShinyPull.`;
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
                          alt={`${creator?.display_name || username} stats badge`}
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
                      <p className="text-xs text-neutral-400">A live badge for your website or blog. The count updates automatically and links back to this page.</p>
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
                  </div>
                  <p className="text-sm sm:text-base text-neutral-700 mb-1">@{creator.username}</p>

                  {/* Data Freshness Indicator */}
                  <div className="flex items-center gap-1.5 text-xs text-neutral-700 mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Updated {(() => {
                        if (!creator.updated_at) return 'recently';
                        const updated = new Date(creator.updated_at);
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

// ============================================================================
// Verdict-first profile layout (added 2026-08-28, generalized to all 9
// platforms same day). Replaces the old flat stack of equally-weighted cards
// with: a plain-language verdict sentence, one prominent relative-axis chart,
// a stat strip, a revenue+live row (YouTube/Twitch/Kick/Music only), and
// tabbed sections (Daily readings first, per the standing instruction —
// Recent videos/Latest post/Top tracks second, About third).
//
// Every number here derives from the SAME `metrics`/`statsHistory` the rest
// of the page already computes — no parallel calculation, so the chart's net
// growth, the hero delta, and the stat strip can never disagree with each
// other the way the old page's cards sometimes did.
//
// YouTube gets its own bespoke section (YouTubeVerdictSection) since it's the
// only platform with a revenue estimate and a real per-video "Recent videos"
// list. The other 8 platforms share GenericVerdictSection, configured per
// platform via GENERIC_PLATFORM_CONFIG below — each only gets a stat cell,
// chart metric, or tab it has real data for (see that section's own comment).
// ============================================================================

function fmtSigned(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + formatNumber(n);
}

// Milestone targets are always round numbers in the 1-9 x 10^n sequence
// (200B, 7M, etc). formatNumber() always shows 1-2 decimals, which turns a
// round number into "200.00B" — this drops the trailing zeros for exact
// milestones while still using formatNumber's real rounding elsewhere.
function fmtMilestone(n) {
  const s = formatNumber(n);
  return s.replace(/\.0+([BMK])$/, '$1');
}

// Bare 30-day view/subscriber deltas, safe wherever GrowthChart's own
// filteredData logic already lives — kept separate (not exported) so a
// change here can't affect the other 8 platforms' still-unmodified chart.
function buildYouTubeSeries(statsHistory, rangeDays) {
  const sorted = [...statsHistory].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  const cutoff = rangeDays >= 9999 ? null : (() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d;
  })();
  const filtered = cutoff ? sorted.filter((s) => new Date(s.recorded_at) >= cutoff) : sorted;
  return filtered.map((s) => ({
    date: s.recorded_at,
    views: s.total_views || 0,
    subscribers: s.subscribers || s.followers || 0,
    videos: s.total_posts || 0,
    label: new Date(s.recorded_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
}

// Real prior-30-days-vs-current-30-days views comparison, computed from raw
// history rather than asserted — returns null (not a guess) when there isn't
// enough history to compute it honestly.
function computeViewsMomentum(statsHistory) {
  const sorted = [...statsHistory].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  if (sorted.length < 45) return null; // need real signal on both sides of the comparison
  const latest = sorted[0];
  const day30 = sorted[Math.min(29, sorted.length - 1)];
  const day60 = sorted[Math.min(59, sorted.length - 1)];
  if (sorted.length < 60) return null;
  const current = latest.total_views - day30.total_views;
  const prior = day30.total_views - day60.total_views;
  if (!prior || prior <= 0) return null;
  return { current, prior, pct: ((current - prior) / prior) * 100 };
}

function buildYouTubeVerdict({ creator, metrics, rankContext, peakStats }) {
  const rank = rankContext?.rank;
  const total = rankContext?.total;
  const dailyViews = metrics?.dailyAverage?.views ?? 0;
  const weeklyViews = metrics?.weeklyAverage?.views ?? 0;
  // "Accelerating" is only said when the last-7-day pace genuinely beats the
  // last-30-day pace — not asserted by default.
  const accelerating = weeklyViews > 0 && dailyViews > weeklyViews;
  const isAllTimeHigh = peakStats?.subscribers ? creator.subscribers >= peakStats.subscribers : creator.subscribers > 0;
  // The rounding-artifact clause only renders when it's genuinely true: 7-day
  // subscriber delta reads as zero while there's real 30-day movement.
  const sevenDayFlat = metrics && metrics.last14Days && metrics.growthRates &&
    Math.round(metrics.growthRates.sevenDay * (creator.subscribers || 1) / 100) === 0 &&
    (metrics.last30Days?.subs || 0) !== 0;

  const rankClause = rank
    ? (rank === 1 ? <><span className="font-semibold text-neutral-900">#1</span> of {formatNumber(total)} tracked YouTube creators.</> : <>Ranked <span className="font-semibold text-neutral-900">#{formatNumber(rank)}</span> of {formatNumber(total)} tracked YouTube creators.</>)
    : null;

  return (
    <>
      {rankClause}{rankClause ? ' ' : ''}
      {dailyViews > 0 ? (
        <>Views climbing <span className="font-semibold text-emerald-600">{formatNumber(dailyViews)} views</span> a day{accelerating ? ' and accelerating' : ''}
          {isAllTimeHigh && <>; subscriber count is at an all-time high{sevenDayFlat ? ", but YouTube only reports three digits, so week-over-week reads as flat" : ''}</>}.
        </>
      ) : (
        <>Not enough recent data yet to show a growth trend.</>
      )}
    </>
  );
}

function YouTubeVerdictSection({ creator, statsHistory, metrics, peakStats, rankContext, dbCreatorId, recentVideos }) {
  const [activeTab, setActiveTab] = useState('daily'); // daily first, per standing instruction
  const [chartMetric, setChartMetric] = useState('views');
  const [chartRange, setChartRange] = useState(30);
  const [cpm, setCpm] = useState(3.5);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [scrubIndex, setScrubIndex] = useState(null);

  const total = rankContext?.total;
  const rank = rankContext?.rank;
  const band = getPercentileBand(rank, total);

  const series = useMemo(() => buildYouTubeSeries(statsHistory, chartRange), [statsHistory, chartRange]);
  const momentum = useMemo(() => computeViewsMomentum(statsHistory), [statsHistory]);

  const METRICS = [
    { value: 'views', label: 'Views', dataKey: 'views' },
    { value: 'subscribers', label: 'Subscribers', dataKey: 'subscribers' },
    { value: 'videos', label: 'Videos', dataKey: 'videos' },
  ];
  const currentMetric = METRICS.find((m) => m.value === chartMetric) || METRICS[0];
  const values = series.map((d) => d[currentMetric.dataKey]);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;
  const span = maxV - minV || 1;
  const pad = span * 0.12;
  const relData = series.map((d) => ({ ...d, rel: d[currentMetric.dataKey] - minV }));
  const heroValue = currentMetric.value === 'views' ? formatNumber(creator.totalViews)
    : currentMetric.value === 'subscribers' ? formatNumber(creator.subscribers)
    : formatNumber(creator.totalPosts);
  const netGrowth = values.length >= 2 ? values[values.length - 1] - values[0] : 0;

  const dailyReadingsRows = [...series].reverse();

  const nearestMilestone = useMemo(() => {
    const dailyGrowth = metrics?.dailyAverage?.views || 0;
    if (dailyGrowth <= 0 || !creator.totalViews) return null;
    const startPow = Math.floor(Math.log10(Math.max(creator.totalViews, 1)));
    for (let pow = startPow; pow < startPow + 3; pow++) {
      const decade = Math.pow(10, pow);
      for (let digit = 1; digit <= 9; digit++) {
        const m = digit * decade;
        if (m > creator.totalViews) {
          const days = Math.ceil((m - creator.totalViews) / dailyGrowth);
          const date = new Date();
          date.setDate(date.getDate() + days);
          return { milestone: m, days, date };
        }
      }
    }
    return null;
  }, [creator.totalViews, metrics]);

  const CPM_MEDIAN = 3.4;
  const monthlyRevenue = (metrics?.last30Days?.views || 0) / 1000 * cpm;

  const tabs = [
    { key: 'daily', label: 'Daily readings', count: dailyReadingsRows.length },
    { key: 'videos', label: 'Recent videos', count: recentVideos.length },
    { key: 'about', label: 'About', count: null },
  ];

  return (
    <div>
      {/* Verdict sentence */}
      <p className="text-[15px] leading-relaxed text-neutral-800 max-w-2xl text-pretty">
        {buildYouTubeVerdict({ creator, metrics, rankContext, peakStats })}
      </p>

      {/* Chart card */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
            {METRICS.map((m) => (
              <button
                key={m.value}
                onClick={() => setChartMetric(m.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartMetric === m.value ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg overflow-x-auto max-w-full">
            {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
              <button
                key={r.v}
                onClick={() => setChartRange(r.v)}
                className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartRange === r.v ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {r.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3 mt-6">
          <p className="text-3xl sm:text-[44px] font-bold tabular-nums text-neutral-900 leading-none tracking-tight">{heroValue}</p>
          <div className="pb-1">
            <p className={`text-sm font-semibold tabular-nums ${netGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSigned(netGrowth)}</p>
            <p className="text-xs text-neutral-500">last {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</p>
          </div>
        </div>

        <div className="h-56 sm:h-64 mt-4 cursor-pointer md:cursor-default" onClick={() => setDrilldownOpen(true)}>
          {relData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="ytVerdictGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} interval="preserveStartEnd" minTickGap={50} />
                <YAxis
                  domain={[0 - pad, span + pad]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#a3a3a3', fontSize: 11 }}
                  tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))}
                  width={56}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0].payload[currentMetric.dataKey];
                    return (
                      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2">
                        <p className="text-xs text-neutral-500">{new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <p className="text-sm font-semibold text-neutral-900 tabular-nums">{formatNumber(raw)}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2} fill="url(#ytVerdictGradient)" dot={false} activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-neutral-500">Not enough history yet for this range.</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-neutral-200/80 text-xs sm:text-sm text-neutral-600">
          <span>{series.length} daily readings</span>
          <span className="text-neutral-300">&middot;</span>
          <span>net {fmtSigned(netGrowth)}</span>
          <span className="flex-1" />
          {nearestMilestone && (
            <button onClick={() => setDrilldownOpen(true)} className="text-left hover:text-neutral-900 transition-colors">
              Next milestone <span className="font-semibold text-neutral-900">{fmtMilestone(nearestMilestone.milestone)} views</span> in ~{nearestMilestone.days} days
              <span className="text-neutral-400"> ({nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, at the current pace)</span>
              <span className="hidden sm:inline text-neutral-400"> Details &rsaquo;</span>
            </button>
          )}
        </div>
      </div>

      {/* 6-cell stat strip — real values, derived from the same metrics/rankContext as everywhere else on the page */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl divide-y divide-x-0 lg:divide-y-0 lg:divide-x divide-neutral-200/80 mt-6">
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Subscribers</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.subscribers)}</p>
          <p className="text-xs text-emerald-600 mt-1">all-time high</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Total views</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalViews)}</p>
          <p className="text-xs text-neutral-500 mt-1">{creator.createdAt ? `since ${new Date(creator.createdAt).getFullYear()}` : 'lifetime'}</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Videos</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalPosts)}</p>
          {metrics && <p className={`text-xs mt-1 ${metrics.last30Days.videos > 0 ? 'text-emerald-600' : 'text-neutral-500'}`}>{fmtSigned(metrics.last30Days.videos)} in 30 days</p>}
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Avg / video</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{creator.totalPosts > 0 ? formatNumber(creator.totalViews / creator.totalPosts) : '—'}</p>
          <p className="text-xs text-neutral-500 mt-1">lifetime</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">30-day views</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{metrics ? fmtSigned(metrics.last30Days.views) : '—'}</p>
          {momentum && (
            <p className={`text-xs mt-1 ${momentum.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{momentum.pct >= 0 ? '+' : ''}{momentum.pct.toFixed(2)}% vs. prior 30d</p>
          )}
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Platform rank</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{rank ? `#${formatNumber(rank)}` : '—'}</p>
          <p className="text-xs text-neutral-500 mt-1">{band != null ? `top ${band}% of tracked` : total ? `of ${formatNumber(total)} tracked` : ''}</p>
        </div>
      </div>

      {/* Revenue + live count row */}
      <div className="flex flex-col lg:flex-row gap-4 mt-6 items-stretch">
        <div className="flex-1 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Estimated revenue</p>
            <span className="flex-1" />
            <p className="text-xs text-neutral-500">your CPM assumption</p>
          </div>
          <div className="flex flex-wrap items-end gap-6 mt-3">
            <div>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-neutral-900 leading-none">{formatEarningsSingle(monthlyRevenue)}</p>
              <p className="text-xs text-neutral-500 mt-1.5">per month &middot; {formatEarningsSingle(monthlyRevenue * 12)} per year</p>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-base font-semibold tabular-nums text-neutral-900">${cpm.toFixed(2)}</span>
                <span className="text-xs text-neutral-500">CPM &middot; category median ${CPM_MEDIAN.toFixed(2)}</span>
              </div>
              <input type="range" min="1" max="12" step="0.1" value={cpm} onChange={(e) => setCpm(parseFloat(e.target.value))} className="w-full accent-neutral-900 h-8" />
              <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5"><span>$1</span><span>$12</span></div>
            </div>
          </div>
        </div>
        <div className="lg:w-72 flex-shrink-0 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Live subscriber count</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-neutral-900 mt-3">{creator.subscribers?.toLocaleString('en-US')}</p>
          <p className="text-xs text-neutral-500 mt-1">updated every 60s</p>
          <span className="flex-1" />
          <Link to={`/live/youtube/${creator.username}`} className="text-sm font-medium text-neutral-900 hover:underline mt-3 inline-flex items-center gap-1">
            Open full-screen counter <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Section tabs — Daily readings first, Recent videos second, About third */}
      <div className="flex gap-6 mt-8 border-b border-neutral-200/80 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-shrink-0 text-sm font-medium pb-3 -mb-px border-b-2 transition-colors ${
              activeTab === t.key ? 'text-neutral-900 border-neutral-900' : 'text-neutral-500 border-transparent hover:text-neutral-700'
            }`}
          >
            {t.label}{t.count != null && <span className="text-neutral-400 font-normal ml-1.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'daily' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl overflow-hidden mt-4">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Views</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">&Delta; views</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Subscribers</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Videos</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Est. revenue</th>
                </tr>
              </thead>
              <tbody>
                {dailyReadingsRows.map((row, i) => {
                  const prev = dailyReadingsRows[i + 1];
                  const delta = prev ? row.views - prev.views : null;
                  return (
                    <tr key={row.date} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 text-neutral-900 tabular-nums">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-5 py-3 text-right font-medium text-neutral-900 tabular-nums">{formatNumber(row.views)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 tabular-nums">{delta != null ? fmtSigned(delta) : '—'}</td>
                      <td className="px-5 py-3 text-right text-neutral-700 tabular-nums">{formatNumber(row.subscribers)}</td>
                      <td className="px-5 py-3 text-right text-neutral-500 tabular-nums">{row.videos}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 tabular-nums">{delta > 0 ? formatEarningsSingle(delta / 1000 * cpm) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile: list, not a table — tables don't survive 390px */}
          <div className="md:hidden divide-y divide-neutral-100">
            {dailyReadingsRows.map((row, i) => {
              const prev = dailyReadingsRows[i + 1];
              const delta = prev ? row.views - prev.views : null;
              return (
                <div key={row.date} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">{formatNumber(row.subscribers)} subs &middot; {row.videos} videos</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{delta != null ? fmtSigned(delta) : '—'}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 mt-0.5">&Delta; views</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{delta > 0 ? formatEarningsSingle(delta / 1000 * cpm) : '—'}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 mt-0.5">est. revenue</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="mt-4 space-y-3">
          {recentVideos.length > 0 ? (
            <>
              <a
                href={`https://youtube.com/watch?v=${recentVideos[0].videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors group"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="relative sm:w-72 flex-shrink-0">
                    <img src={recentVideos[0].thumbnail} alt={recentVideos[0].title} loading="lazy" className="w-full h-44 sm:h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <p className="text-xs font-medium text-neutral-500 mb-1.5">Most recent upload</p>
                      <h3 className="font-semibold text-neutral-900 mb-2 line-clamp-2 group-hover:text-neutral-700 transition-colors">{recentVideos[0].title}</h3>
                      <p className="text-sm text-neutral-500">{formatRelativeTime(recentVideos[0].publishedAt)}</p>
                    </div>
                    <div className="flex items-center gap-5 mt-3 text-sm text-neutral-700">
                      <span className="flex items-center gap-1.5 tabular-nums"><Eye className="w-4 h-4 text-neutral-400" />{formatNumber(recentVideos[0].views)}</span>
                      <span className="flex items-center gap-1.5 tabular-nums"><ThumbsUp className="w-4 h-4 text-neutral-400" />{formatNumber(recentVideos[0].likes)}</span>
                      <span className="flex items-center gap-1.5 tabular-nums"><MessageCircle className="w-4 h-4 text-neutral-400" />{formatNumber(recentVideos[0].comments)}</span>
                    </div>
                  </div>
                </div>
              </a>

              {recentVideos.length > 1 && (
                <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] divide-y divide-neutral-100 overflow-hidden">
                  {recentVideos.slice(1).map((video) => (
                    <a
                      key={video.videoId}
                      href={`https://youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3.5 px-4 py-3 hover:bg-neutral-50 transition-colors group"
                    >
                      <img src={video.thumbnail} alt={video.title} loading="lazy" className="w-24 h-14 flex-shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-medium text-neutral-900 line-clamp-1 group-hover:text-neutral-700 transition-colors">{video.title}</h4>
                        <p className="text-xs text-neutral-500 mt-1">{formatRelativeTime(video.publishedAt)}</p>
                        <div className="flex items-center gap-3.5 mt-1.5 text-xs text-neutral-500">
                          <span className="flex items-center gap-1 tabular-nums"><Eye className="w-3.5 h-3.5 text-neutral-400" />{formatNumber(video.views)}</span>
                          <span className="flex items-center gap-1 tabular-nums"><ThumbsUp className="w-3.5 h-3.5 text-neutral-400" />{formatNumber(video.likes)}</span>
                          <span className="flex items-center gap-1 tabular-nums"><MessageCircle className="w-3.5 h-3.5 text-neutral-400" />{formatNumber(video.comments)}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200/80 p-8 text-center text-sm text-neutral-500">No recent video data yet.</div>
          )}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-6 sm:p-7 mt-4 max-w-3xl">
          {creator.description && <p className="text-sm leading-relaxed text-neutral-700 text-pretty whitespace-pre-line">{creator.description}</p>}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-neutral-200/80">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Joined</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.createdAt ? new Date(creator.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Country</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.country || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Tracked since</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.dbCreatedAt ? new Date(creator.dbCreatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drill-down: scrubbable full-height chart + sticky footer, matches the approved design */}
      {drilldownOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden">
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-200/80">
            <button onClick={() => { setDrilldownOpen(false); setScrubIndex(null); }} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <p className="text-sm font-semibold text-neutral-900 flex-1">{currentMetric.label} &middot; {creator.displayName}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            {(() => {
              const idx = scrubIndex == null ? relData.length - 1 : scrubIndex;
              const pt = relData[idx];
              const prevPt = relData[idx - 1];
              const delta = pt && prevPt ? pt[currentMetric.dataKey] - prevPt[currentMetric.dataKey] : null;
              return pt ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{new Date(pt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <div className="flex items-end gap-3 mt-2">
                    <p className="text-4xl font-bold tabular-nums text-neutral-900 leading-none">{formatNumber(pt[currentMetric.dataKey])}</p>
                    {delta != null && <p className="text-sm font-semibold text-emerald-600 tabular-nums pb-1">{fmtSigned(delta)} that day</p>}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1.5">drag across the chart to read any day</p>
                </>
              ) : null;
            })()}
            <div
              className="relative mt-5"
              style={{ height: 280, touchAction: 'none' }}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setScrubIndex(Math.round(f * (relData.length - 1)));
              }}
              onPointerMove={(e) => {
                if (e.buttons === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setScrubIndex(Math.round(f * (relData.length - 1)));
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="ytDrilldownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0 - pad, span + pad]} axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 10 }} tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))} width={48} />
                  <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2.5} fill="url(#ytDrilldownGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-neutral-400 tabular-nums">
              <span>{relData[0] && new Date(relData[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{relData[relData.length - 1] && new Date(relData[relData.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-5">
              {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
                <button key={r.v} onClick={() => { setChartRange(r.v); setScrubIndex(null); }} className={`h-9 rounded-lg text-xs font-semibold ${chartRange === r.v ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-700'}`}>{r.l}</button>
              ))}
            </div>

            <div className="mt-5 border border-neutral-200/80 rounded-xl overflow-hidden divide-y divide-neutral-100">
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Total views</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{formatNumber(creator.totalViews)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Net over {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(netGrowth)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Best day</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(Math.max(...relData.map((d, i) => i > 0 ? d[currentMetric.dataKey] - relData[i - 1][currentMetric.dataKey] : 0)))}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Daily average</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(Math.round(netGrowth / Math.max(1, relData.length - 1)))}</span></div>
            </div>

            {nearestMilestone && (
              <div className="mt-4 rounded-xl bg-neutral-900 text-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Next milestone</p>
                <p className="text-xl font-bold mt-1.5">{fmtMilestone(nearestMilestone.milestone)} views</p>
                <p className="text-xs text-neutral-400 mt-1">~{nearestMilestone.days} days &middot; {nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at the current pace</p>
              </div>
            )}
            <div className="h-6" />
          </div>
          <div className="flex-shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200/80">
            <Link to={`/compare?creators=youtube:${creator.username}`} className="flex-1 h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold flex items-center justify-center">Compare channels</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function formatEarningsSingle(n) {
  if (!n || n < 0) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}

// ============================================================================
// Verdict-first layout for the other 8 platforms (added 2026-08-28).
// Same structure/pattern as YouTubeVerdictSection above, generalized via a
// per-platform config table instead of 8 near-duplicate components — mirrors
// how GrowthChart already branches its metrics array per platform. Every
// field referenced here is real (creator/metrics/rankContext/peakStats, the
// same objects the rest of the page already computes) — no platform gets a
// stat cell, a chart metric, a revenue estimate, or a third tab it doesn't
// have real data for. Notably: no platform except YouTube gets a revenue
// estimate (no CPM methodology exists for the others in this codebase, and
// inventing one would be fabricating a number) or a "recent items" tab
// unless it has one real item to show (a single latest post for Rumble/
// Mastodon/Substack, real top tracks for Music) — never a fabricated list.
// ============================================================================

const GENERIC_PLATFORM_CONFIG = {
  twitch: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }],
    hasLiveCount: true,
    liveLabel: 'Live follower count',
    thirdTab: null,
  },
  kick: {
    primaryLabel: 'Paid Subscribers',
    chartMetrics: [{ value: 'subscribers', label: 'Paid Subscribers', dataKey: 'subscribers' }],
    hasLiveCount: true,
    liveLabel: 'Live paid subscriber count',
    thirdTab: null,
  },
  tiktok: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'views', label: 'Likes', dataKey: 'views' }],
    hasLiveCount: false,
    thirdTab: null,
  },
  bluesky: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'videos', label: 'Posts', dataKey: 'videos' }],
    hasLiveCount: false,
    thirdTab: null,
  },
  mastodon: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'videos', label: 'Posts', dataKey: 'videos' }],
    hasLiveCount: false,
    thirdTab: null,
  },
  rumble: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'videos', label: 'Videos', dataKey: 'videos' }],
    hasLiveCount: false,
    thirdTab: 'latestPost',
  },
  substack: {
    primaryLabel: 'Subscribers',
    chartMetrics: [{ value: 'subscribers', label: 'Subscriber Reach', dataKey: 'subscribers' }],
    hasLiveCount: false,
    thirdTab: 'latestPost',
    noGrowthRate: true, // subscriber value is an order-of-magnitude band — a % would be misleading
  },
  music: {
    primaryLabel: 'Monthly Listeners',
    chartMetrics: [{ value: 'subscribers', label: 'Listeners', dataKey: 'subscribers' }, { value: 'views', label: 'Plays', dataKey: 'views' }],
    hasLiveCount: true,
    liveLabel: 'Live listener count',
    thirdTab: 'topTracks',
    noMilestone: true, // monthly listeners is a rolling 30-day window, not monotonically increasing
  },
};

function buildGenericVerdict({ platform, creator, metrics, rankContext, peakStats, primaryLabel }) {
  const rank = rankContext?.rank;
  const total = rankContext?.total;
  const dailySubs = metrics?.dailyAverage?.subs ?? 0;
  const primaryCount = creator.subscribers ?? creator.followers ?? 0;
  const isAllTimeHigh = peakStats?.subscribers ? primaryCount >= peakStats.subscribers : primaryCount > 0;
  const platformName = PLATFORM_DISPLAY_NAMES[platform] || platform;
  const noun = primaryLabel.toLowerCase();

  const rankClause = rank
    ? (rank === 1 ? <><span className="font-semibold text-neutral-900">#1</span> of {formatNumber(total)} tracked {platformName} creators.</> : <>Ranked <span className="font-semibold text-neutral-900">#{formatNumber(rank)}</span> of {formatNumber(total)} tracked {platformName} creators.</>)
    : null;

  return (
    <>
      {rankClause}{rankClause ? ' ' : ''}
      {dailySubs !== 0 ? (
        <>{dailySubs > 0 ? 'Gaining' : 'Losing'} <span className={`font-semibold ${dailySubs > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatNumber(Math.abs(dailySubs))} {noun}</span> a day{isAllTimeHigh && dailySubs > 0 ? '; currently at an all-time high.' : '.'}</>
      ) : (
        <>{noun.charAt(0).toUpperCase() + noun.slice(1)} count has been flat recently.</>
      )}
    </>
  );
}

function GenericVerdictSection({ platform, creator, statsHistory, metrics, peakStats, rankContext, musicTracks, musicAlbums }) {
  const config = GENERIC_PLATFORM_CONFIG[platform];
  const [activeTab, setActiveTab] = useState('daily');
  const [chartMetric, setChartMetric] = useState(config.chartMetrics[0].value);
  const [chartRange, setChartRange] = useState(30);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [scrubIndex, setScrubIndex] = useState(null);

  const total = rankContext?.total;
  const rank = rankContext?.rank;
  const band = getPercentileBand(rank, total);
  const primaryCount = creator.subscribers ?? creator.followers ?? 0;

  const series = useMemo(() => buildYouTubeSeries(statsHistory, chartRange), [statsHistory, chartRange]);
  const currentMetric = config.chartMetrics.find((m) => m.value === chartMetric) || config.chartMetrics[0];
  const values = series.map((d) => d[currentMetric.dataKey]);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;
  const span = maxV - minV || 1;
  const pad = span * 0.12;
  const relData = series.map((d) => ({ ...d, rel: d[currentMetric.dataKey] - minV }));
  const heroValue = formatNumber(currentMetric.dataKey === 'subscribers' ? primaryCount : creator[currentMetric.dataKey === 'views' ? 'totalViews' : 'totalPosts']);
  const netGrowth = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const dailyReadingsRows = [...series].reverse();

  const nearestMilestone = useMemo(() => {
    if (config.noMilestone) return null;
    const dailyGrowth = metrics?.dailyAverage?.subs || 0;
    const current = primaryCount;
    if (dailyGrowth <= 0 || !current) return null;
    const startPow = Math.floor(Math.log10(Math.max(current, 1)));
    for (let pow = startPow; pow < startPow + 3; pow++) {
      const decade = Math.pow(10, pow);
      for (let digit = 1; digit <= 9; digit++) {
        const m = digit * decade;
        if (m > current) {
          const days = Math.ceil((m - current) / dailyGrowth);
          const date = new Date();
          date.setDate(date.getDate() + days);
          return { milestone: m, days, date };
        }
      }
    }
    return null;
  }, [primaryCount, metrics, config.noMilestone]);

  const platformName = PLATFORM_DISPLAY_NAMES[platform] || platform;
  const hasThirdTabContent = config.thirdTab === 'latestPost' ? !!creator.latestPost
    : config.thirdTab === 'topTracks' ? musicTracks?.length > 0
    : false;

  const tabs = [
    { key: 'daily', label: 'Daily readings', count: dailyReadingsRows.length },
    ...(hasThirdTabContent ? [{ key: 'third', label: config.thirdTab === 'topTracks' ? 'Top tracks' : 'Latest post', count: null }] : []),
    { key: 'about', label: 'About', count: null },
  ];

  return (
    <div>
      <p className="text-[15px] leading-relaxed text-neutral-800 max-w-2xl text-pretty">
        {buildGenericVerdict({ platform, creator, metrics, rankContext, peakStats, primaryLabel: config.primaryLabel })}
      </p>

      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {config.chartMetrics.length > 1 ? (
            <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
              {config.chartMetrics.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setChartMetric(m.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    chartMetric === m.value ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : <div />}
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg overflow-x-auto max-w-full">
            {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
              <button
                key={r.v}
                onClick={() => setChartRange(r.v)}
                className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartRange === r.v ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {r.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3 mt-6">
          <p className="text-3xl sm:text-[44px] font-bold tabular-nums text-neutral-900 leading-none tracking-tight">{heroValue}</p>
          <div className="pb-1">
            <p className={`text-sm font-semibold tabular-nums ${netGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSigned(netGrowth)}</p>
            <p className="text-xs text-neutral-500">last {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</p>
          </div>
        </div>

        <div className="h-56 sm:h-64 mt-4 cursor-pointer md:cursor-default" onClick={() => setDrilldownOpen(true)}>
          {relData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id={`genVerdictGradient-${platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} interval="preserveStartEnd" minTickGap={50} />
                <YAxis domain={[0 - pad, span + pad]} axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))} width={56} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0].payload[currentMetric.dataKey];
                    return (
                      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2">
                        <p className="text-xs text-neutral-500">{new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <p className="text-sm font-semibold text-neutral-900 tabular-nums">{formatNumber(raw)}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2} fill={`url(#genVerdictGradient-${platform})`} dot={false} activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-neutral-500">Not enough history yet for this range.</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-neutral-200/80 text-xs sm:text-sm text-neutral-600">
          <span>{series.length} daily readings</span>
          <span className="text-neutral-300">&middot;</span>
          <span>net {fmtSigned(netGrowth)}</span>
          <span className="flex-1" />
          {nearestMilestone && (
            <button onClick={() => setDrilldownOpen(true)} className="text-left hover:text-neutral-900 transition-colors">
              Next milestone <span className="font-semibold text-neutral-900">{fmtMilestone(nearestMilestone.milestone)} {config.primaryLabel.toLowerCase()}</span> in ~{nearestMilestone.days} days
              <span className="text-neutral-400"> ({nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, at the current pace)</span>
            </button>
          )}
        </div>
      </div>

      {/* Stat strip — cells vary per platform, every value real */}
      <div className="grid grid-cols-2 lg:grid-cols-3 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl divide-y divide-x-0 lg:divide-y-0 lg:divide-x divide-neutral-200/80 mt-6">
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{config.primaryLabel}</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(primaryCount)}</p>
          <p className="text-xs text-emerald-600 mt-1">{peakStats?.subscribers && primaryCount >= peakStats.subscribers ? 'all-time high' : ''}</p>
        </div>

        {(platform === 'twitch' || platform === 'kick') && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Hours watched</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{creator.hoursWatchedMonth ? formatHoursWatched(creator.hoursWatchedMonth) : '—'}</p>
            <p className="text-xs text-neutral-500 mt-1">last 30 days</p>
          </div>
        )}
        {platform === 'tiktok' && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Total likes</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalViews)}</p>
          </div>
        )}
        {(platform === 'bluesky' || platform === 'mastodon') && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Posts</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalPosts)}</p>
          </div>
        )}
        {platform === 'rumble' && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Videos</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalPosts)}</p>
          </div>
        )}
        {platform === 'music' && (
          <>
            <div className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Total plays</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalViews)}</p>
            </div>
            {creator.description && (
              <div className="p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Genres</p>
                <p className="text-sm font-semibold text-neutral-900 mt-1.5 line-clamp-2">{creator.description}</p>
              </div>
            )}
          </>
        )}

        {!config.noGrowthRate && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">30-day {config.primaryLabel.toLowerCase()}</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{metrics ? fmtSigned(metrics.last30Days.subs) : '—'}</p>
            {metrics?.growthRates && <p className={`text-xs mt-1 ${metrics.growthRates.thirtyDay >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{metrics.growthRates.thirtyDay >= 0 ? '+' : ''}{metrics.growthRates.thirtyDay.toFixed(2)}% growth rate</p>}
          </div>
        )}

        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Platform rank</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{rank ? `#${formatNumber(rank)}` : '—'}</p>
          <p className="text-xs text-neutral-500 mt-1">{band != null ? `top ${band}% of tracked` : total ? `of ${formatNumber(total)} tracked` : ''}</p>
        </div>
      </div>

      {/* Live count row — only for platforms where numbers move fast enough to matter */}
      {config.hasLiveCount && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6 mt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{config.liveLabel}</p>
              <p className="text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{primaryCount.toLocaleString('en-US')}</p>
            </div>
          </div>
          <Link to={`/live/${platform}/${creator.username}`} className="text-sm font-medium text-neutral-900 hover:underline inline-flex items-center gap-1 flex-shrink-0">
            Open <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-6 mt-8 border-b border-neutral-200/80 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-shrink-0 text-sm font-medium pb-3 -mb-px border-b-2 transition-colors ${
              activeTab === t.key ? 'text-neutral-900 border-neutral-900' : 'text-neutral-500 border-transparent hover:text-neutral-700'
            }`}
          >
            {t.label}{t.count != null && <span className="text-neutral-400 font-normal ml-1.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'daily' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl overflow-hidden mt-4">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">{config.primaryLabel}</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">&Delta;</th>
                </tr>
              </thead>
              <tbody>
                {dailyReadingsRows.map((row, i) => {
                  const prev = dailyReadingsRows[i + 1];
                  const delta = prev ? row.subscribers - prev.subscribers : null;
                  return (
                    <tr key={row.date} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 text-neutral-900 tabular-nums">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-5 py-3 text-right font-medium text-neutral-900 tabular-nums">{formatNumber(row.subscribers)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-neutral-400'}`}>{delta != null ? fmtSigned(delta) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-neutral-100">
            {dailyReadingsRows.map((row, i) => {
              const prev = dailyReadingsRows[i + 1];
              const delta = prev ? row.subscribers - prev.subscribers : null;
              return (
                <div key={row.date} className="flex items-center gap-3 px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-900 flex-1">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold tabular-nums ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-neutral-400'}`}>{delta != null ? fmtSigned(delta) : '—'}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 mt-0.5">&Delta; {config.primaryLabel.toLowerCase()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'third' && config.thirdTab === 'latestPost' && creator.latestPost && (
        <a
          href={creator.latestPost.url || `https://${creator.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group block mt-4 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 hover:border-neutral-300 transition-colors"
        >
          <div className="flex gap-4">
            {creator.latestPost.thumbnail && (
              <div className="flex-shrink-0 w-32 sm:w-44 aspect-video rounded-lg overflow-hidden bg-neutral-100">
                <img src={creator.latestPost.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {creator.latestPost.title && <h3 className="text-base font-semibold text-neutral-900 leading-snug line-clamp-2 group-hover:underline">{creator.latestPost.title}</h3>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                {creator.latestPost.publishedAt && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatRelativeTime(creator.latestPost.publishedAt)}</span>}
                {creator.latestPost.views != null && <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{formatNumber(creator.latestPost.views)} views</span>}
                {creator.latestPost.reactions > 0 && <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" />{formatNumber(creator.latestPost.reactions)}</span>}
                {creator.latestPost.comments > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{formatNumber(creator.latestPost.comments)}</span>}
              </div>
            </div>
          </div>
        </a>
      )}

      {activeTab === 'third' && config.thirdTab === 'topTracks' && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(musicTracks || []).slice(0, 6).map((track, i) => (
            <a
              key={i}
              href={track.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-4 hover:border-neutral-300 transition-colors"
            >
              <span className="text-xs font-mono text-neutral-400">{i + 1}</span>
              <p className="text-sm font-semibold text-neutral-900 line-clamp-2 mt-1">{track.name}</p>
              {track.playcount && <p className="text-xs text-neutral-500 mt-1 tabular-nums">{formatNumber(Number(track.playcount))} plays</p>}
            </a>
          ))}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-6 sm:p-7 mt-4 max-w-3xl">
          {creator.description && <p className="text-sm leading-relaxed text-neutral-700 text-pretty whitespace-pre-line">{creator.description}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-neutral-200/80">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Joined</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.createdAt ? new Date(creator.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Country</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.country || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Tracked since</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.dbCreatedAt ? new Date(creator.dbCreatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drill-down */}
      {drilldownOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden">
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-200/80">
            <button onClick={() => { setDrilldownOpen(false); setScrubIndex(null); }} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <p className="text-sm font-semibold text-neutral-900 flex-1">{currentMetric.label} &middot; {creator.displayName}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            {(() => {
              const idx = scrubIndex == null ? relData.length - 1 : scrubIndex;
              const pt = relData[idx];
              const prevPt = relData[idx - 1];
              const delta = pt && prevPt ? pt[currentMetric.dataKey] - prevPt[currentMetric.dataKey] : null;
              return pt ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{new Date(pt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <div className="flex items-end gap-3 mt-2">
                    <p className="text-4xl font-bold tabular-nums text-neutral-900 leading-none">{formatNumber(pt[currentMetric.dataKey])}</p>
                    {delta != null && <p className={`text-sm font-semibold tabular-nums pb-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSigned(delta)} that day</p>}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1.5">drag across the chart to read any day</p>
                </>
              ) : null;
            })()}
            <div
              className="relative mt-5"
              style={{ height: 280, touchAction: 'none' }}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setScrubIndex(Math.round(f * (relData.length - 1)));
              }}
              onPointerMove={(e) => {
                if (e.buttons === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setScrubIndex(Math.round(f * (relData.length - 1)));
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id={`genDrilldownGradient-${platform}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0 - pad, span + pad]} axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 10 }} tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))} width={48} />
                  <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2.5} fill={`url(#genDrilldownGradient-${platform})`} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-neutral-400 tabular-nums">
              <span>{relData[0] && new Date(relData[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{relData[relData.length - 1] && new Date(relData[relData.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-5">
              {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
                <button key={r.v} onClick={() => { setChartRange(r.v); setScrubIndex(null); }} className={`h-9 rounded-lg text-xs font-semibold ${chartRange === r.v ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-700'}`}>{r.l}</button>
              ))}
            </div>
            <div className="mt-5 border border-neutral-200/80 rounded-xl overflow-hidden divide-y divide-neutral-100">
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Total {config.primaryLabel.toLowerCase()}</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{formatNumber(primaryCount)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Net over {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(netGrowth)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Best day</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(Math.max(...relData.map((d, i) => i > 0 ? d[currentMetric.dataKey] - relData[i - 1][currentMetric.dataKey] : 0)))}</span></div>
            </div>
            {nearestMilestone && (
              <div className="mt-4 rounded-xl bg-neutral-900 text-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Next milestone</p>
                <p className="text-xl font-bold mt-1.5">{fmtMilestone(nearestMilestone.milestone)} {config.primaryLabel.toLowerCase()}</p>
                <p className="text-xs text-neutral-400 mt-1">~{nearestMilestone.days} days &middot; {nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at the current pace</p>
              </div>
            )}
            <div className="h-6" />
          </div>
          <div className="flex-shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200/80">
            <Link to={`/compare?creators=${platform}:${creator.username}`} className="flex-1 h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold flex items-center justify-center">Compare channels</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function formatHoursWatched(hours) {
  if (!hours || hours === 0) return '0';
  if (hours >= 1000000) return `${(hours / 1000000).toFixed(1)}M`;
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}K`;
  return Math.round(hours).toLocaleString();
}

// Bands the raw rank/total ratio into human round numbers instead of a
// precise-looking decimal ("top 0.69%") that reads as fake precision.
function getPercentileBand(rank, total) {
  if (!rank || !total) return null;
  const pct = (rank / total) * 100;
  if (pct <= 1) return 1;
  if (pct <= 5) return 5;
  if (pct <= 10) return 10;
  if (pct <= 25) return 25;
  if (pct <= 50) return 50;
  return null; // below median isn't a flattering stat to surface
}

// "Similar in size" — creators ranked just above/below this one on the same
// platform. It's a scale signal (rank proximity), not a content-category
// match, so the copy is worded around size rather than claiming similarity
// of niche/content.
function SimilarCreators({ creators, platform, platformName, primaryLabel, excludeId }) {
  const filtered = (creators || []).filter((c) => c.id !== excludeId);
  if (filtered.length === 0) return null;

  return (
    <div className="mt-8 pt-8 border-t border-neutral-200/80">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600 mb-1">Nearby in the rankings</p>
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 mb-4">Similar-sized {platformName} creators</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/${platform}/${c.username}`}
            className="flex items-center gap-3 p-3 bg-white border border-neutral-200/80 rounded-xl hover:border-neutral-300 transition-colors"
          >
            <CreatorAvatar src={c.profile_image} name={c.display_name} size="md" className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 truncate">{c.display_name}</p>
              <p className="text-xs text-neutral-500 tabular-nums mt-0.5">
                {formatNumber(c.subscribers)} {primaryLabel} · #{formatNumber(c.rank_position)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
