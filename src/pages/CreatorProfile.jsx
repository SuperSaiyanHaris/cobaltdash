import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { Youtube, Twitch, Users, Eye, Video, TrendingUp, ExternalLink, AlertCircle, Calendar, Target, Clock, Radio, Star, Play, ThumbsUp, MessageCircle, Download, Lock, Share2, Check, Scale } from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import FunErrorState from '../components/FunErrorState';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { getChannelByUsername as getYouTubeChannel, getChannelById as getYouTubeChannelById, getLatestVideo as getYouTubeLatestVideo } from '../services/youtubeService';
import { getChannelByUsername as getTwitchChannel, getLiveStreams as getTwitchLiveStreams } from '../services/twitchService';
import { getChannelByUsername as getKickChannel, getLiveStreams as getKickLiveStreams } from '../services/kickService';
import { getBlueskyProfile } from '../services/blueskyService';
import { getMastodonProfile, getMastodonLatestStatus } from '../services/mastodonService';
import { getRumbleChannel } from '../services/rumbleService';
import { getSubstackPublication } from '../services/substackService';
import SubstackIcon from '../components/SubstackIcon';
import { getArtistByMbid, getArtistByName, getArtistTopTracks, getArtistTopAlbums } from '../services/musicService';
import { Music } from 'lucide-react';
import { upsertCreator, saveCreatorStats, getCreatorByUsername, getCreatorStats, getHoursWatched } from '../services/creatorService';
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

const platformIcons = {
  youtube: Youtube,
  twitch: Twitch,
  kick: KickIcon,
  tiktok: TikTokIcon,
  bluesky: BlueskyIcon,
  music: Music,
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

const platformDisplayNames = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  kick: 'Kick',
  tiktok: 'TikTok',
  bluesky: 'Bluesky',
  music: 'Music',
  mastodon: 'Mastodon',
  rumble: 'Rumble',
  substack: 'Substack',
};

export default function CreatorProfile() {
  const { platform, username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  // No tier gates — every signed-in user gets full features.
  // Featured Listings is the only paid product; profile features are free.
  const maxFollows = Infinity;
  const historyDays = Infinity;
  const hasExport = true;
  const [creator, setCreator] = useState(null);
  const [statsHistory, setStatsHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartRange, setChartRange] = useState(30);
  // Default to views for YouTube (subscriber counts are rounded by YouTube API)
  const [chartMetric, setChartMetric] = useState(platform === 'youtube' ? 'views' : 'subscribers');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [dbCreatorId, setDbCreatorId] = useState(null); // Store database UUID
  const [isLive, setIsLive] = useState(false);
  const [liveStreamInfo, setLiveStreamInfo] = useState(null);
  const [latestVideo, setLatestVideo] = useState(null);
  const [musicTracks, setMusicTracks] = useState([]);
  const [musicAlbums, setMusicAlbums] = useState([]);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copiedProfile, setCopiedProfile] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const shareRef = useRef(null);

  useEffect(() => {
    loadCreator();
  }, [platform, username]);

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

  const loadCreator = async () => {
    setLoading(true);
    setError(null);

    try {
      let channelData = null;

      if (platform === 'youtube') {
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
          if (knownCreator?.platform_id) {
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
      } else if (platform === 'twitch') {
        channelData = await getTwitchChannel(username);
      } else if (platform === 'kick') {
        channelData = await getKickChannel(username);
      } else if (platform === 'bluesky') {
        channelData = await getBlueskyProfile(username);
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
            getCreatorStats(dbCreator.id, 90),
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

        // Fetch latest video for YouTube channels (non-blocking)
        if (platform === 'youtube' && channelData.platformId) {
          getYouTubeLatestVideo(channelData.platformId).then(video => {
            if (video) setLatestVideo(video);
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
            // TikTok already fetched history above; other platforms do it here
            const dbCreator = await upsertCreator(channelData);
            setDbCreatorId(dbCreator.id);
            setCreator(prev => ({ ...prev, dbCreatedAt: dbCreator.created_at }));

            // Save stats first, then fetch history. Skip when channelData has
            // null counts (Rumble synthesized-from-DB case) — the daily
            // collection script keeps stats fresh from the right IP range.
            if (channelData.subscribers || channelData.followers) {
              await saveCreatorStats(dbCreator.id, {
                subscribers: channelData.subscribers || channelData.followers,
                totalViews: channelData.totalViews,
                totalPosts: channelData.totalPosts,
              });
            }

            // Now fetch history + hours watched in parallel (both read-only)
            const readOps = [getCreatorStats(dbCreator.id, 90)];
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
              // most recent stats row.
              if (history.length > 0 && !channelData.subscribers && !channelData.followers) {
                const latest = history[0];
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

  const Icon = platformIcons[platform];
  const colors = platformColors[platform] || platformColors.youtube;

  const handleExportCSV = () => {
    if (!statsHistory.length) return;

    const sorted = [...statsHistory].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    const creatorName = creator?.display_name || creator?.username || username;
    const exportDate = new Date().toISOString().split('T')[0];

    // Compute daily deltas for every row
    const withChanges = sorted.map((s, i) => {
      const prev = sorted[i - 1];
      return {
        ...s,
        subsChange: prev != null ? (s.subscribers || s.followers || 0) - (prev.subscribers || prev.followers || 0) : null,
        viewsChange: prev != null ? (s.total_views || 0) - (prev.total_views || 0) : null,
        postsChange: prev != null ? (s.total_posts || 0) - (prev.total_posts || 0) : null,
      };
    });

    const fmtDate = (d) => d ? d.split('T')[0] : '';
    const fmtDelta = (n) => n === null || n === undefined ? '' : (n >= 0 ? `+${n}` : `${n}`);
    const esc = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const PLATFORM_LABELS = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music' };

    const meta = [
      ['ShinyPull Stats Export'],
      ['Creator', creatorName],
      ['Platform', PLATFORM_LABELS[platform] || platform],
      ['Exported', exportDate],
      ['Profile URL', `https://shinypull.com/${platform}/${username}`],
      [],
    ];

    let headers, rows;
    if (platform === 'youtube') {
      headers = ['Date', 'Subscribers', 'Total Views', 'Daily Views', 'Videos', 'Video Change', 'Est Daily Revenue Low ($)', 'Est Daily Revenue High ($)', 'Est Monthly Revenue Low ($)', 'Est Monthly Revenue High ($)'];
      rows = withChanges.map(s => {
        const dv = s.viewsChange;
        const hasViews = dv != null && dv > 0;
        return [
          fmtDate(s.recorded_at),
          s.subscribers ?? '',
          s.total_views ?? '',
          fmtDelta(s.viewsChange),
          s.total_posts ?? '',
          fmtDelta(s.postsChange),
          hasViews ? (dv * 2 / 1000).toFixed(2) : '',
          hasViews ? (dv * 7 / 1000).toFixed(2) : '',
          hasViews ? (dv * 30 * 2 / 1000).toFixed(2) : '',
          hasViews ? (dv * 30 * 7 / 1000).toFixed(2) : '',
        ];
      });
    } else if (platform === 'tiktok') {
      headers = ['Date', 'Followers', 'Follower Change', 'Total Likes', 'Daily Likes', 'Videos', 'Video Change'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.followers ?? s.subscribers ?? '',
        fmtDelta(s.subsChange),
        s.total_views ?? '',
        fmtDelta(s.viewsChange),
        s.total_posts ?? '',
        fmtDelta(s.postsChange),
      ]);
    } else if (platform === 'twitch') {
      headers = ['Date', 'Followers', 'Follower Change', 'Hours Watched', 'Peak Viewers', 'Avg Viewers'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.followers ?? s.subscribers ?? '',
        fmtDelta(s.subsChange),
        s.hours_watched_day ?? '',
        s.peak_viewers_day ?? '',
        s.avg_viewers_day ?? '',
      ]);
    } else if (platform === 'kick') {
      headers = ['Date', 'Paid Subscribers', 'Sub Change', 'Hours Watched', 'Peak Viewers', 'Avg Viewers'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.subscribers ?? '',
        fmtDelta(s.subsChange),
        s.hours_watched_day ?? '',
        s.peak_viewers_day ?? '',
        s.avg_viewers_day ?? '',
      ]);
    } else if (platform === 'bluesky') {
      headers = ['Date', 'Followers', 'Follower Change', 'Posts', 'Post Change'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.subscribers ?? '',
        fmtDelta(s.subsChange),
        s.total_posts ?? '',
        fmtDelta(s.postsChange),
      ]);
    } else if (platform === 'music') {
      headers = ['Date', 'Monthly Listeners', 'Listener Change', 'Total Plays'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.subscribers ?? s.followers ?? '',
        fmtDelta(s.subsChange),
        s.total_views ?? '',
      ]);
    } else if (platform === 'mastodon') {
      headers = ['Date', 'Followers', 'Follower Change', 'Posts', 'Post Change'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.subscribers ?? s.followers ?? '',
        fmtDelta(s.subsChange),
        s.total_posts ?? '',
        fmtDelta(s.postsChange),
      ]);
    } else if (platform === 'rumble') {
      headers = ['Date', 'Followers', 'Follower Change', 'Videos', 'Video Change'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.subscribers ?? s.followers ?? '',
        fmtDelta(s.subsChange),
        s.total_posts ?? '',
        fmtDelta(s.postsChange),
      ]);
    } else if (platform === 'substack') {
      headers = ['Date', 'Subscribers', 'Subscriber Change'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.subscribers ?? s.followers ?? '',
        fmtDelta(s.subsChange),
      ]);
    } else {
      headers = ['Date', 'Followers', 'Follower Change'];
      rows = withChanges.map(s => [
        fmtDate(s.recorded_at),
        s.followers ?? s.subscribers ?? '',
        fmtDelta(s.subsChange),
      ]);
    }

    const csvStr = '\uFEFF' + [...meta, headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shinypull-${platform}-${creator?.username || username}-${exportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const calculateGrowthMetrics = () => {
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
  };

  const metrics = calculateGrowthMetrics();

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-8">
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
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${colors.bg} text-white hover:opacity-90 transition-opacity`}
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
                  Check on {platform}
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
    return `Track ${name}'s ${platform} statistics including followers, growth, and analytics on ShinyPull.`;
  })();

  const seoKeywords = `${creator.displayName} ${platform} stats, ${creator.displayName} ${primaryLabel}, ${creator.displayName} analytics, ${platform} statistics, ${creator.displayName} growth`;

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
        image={`https://shinypull.com/api/og?platform=${platform}&username=${encodeURIComponent(creator.username || username)}`}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(profileSchema).replace(/<\/script>/gi, '<\\/script>') }} />
      <StructuredData schema={breadcrumbSchema} />

      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero banner — uses the creator's channel art as background with gradient fade.
            When no banner exists, render a soft platform-colored gradient instead of dead space. */}
        <div className="relative h-48 sm:h-56 md:h-72 overflow-hidden">
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
            <div className={`absolute inset-0 bg-gradient-to-br ${
              platform === 'youtube' ? 'from-red-900/30 via-rose-900/15 to-transparent' :
              platform === 'twitch' ? 'from-purple-900/40 via-violet-900/20 to-transparent' :
              platform === 'kick' ? 'from-green-900/40 via-emerald-900/20 to-transparent' :
              platform === 'tiktok' ? 'from-pink-900/35 via-fuchsia-900/15 to-transparent' :
              platform === 'bluesky' ? 'from-sky-900/40 via-cyan-900/20 to-transparent' :
              platform === 'mastodon' ? 'from-violet-900/40 via-purple-900/20 to-transparent' :
              platform === 'rumble' ? 'from-lime-900/40 via-green-900/20 to-transparent' :
              platform === 'substack' ? 'from-orange-900/40 via-amber-900/20 to-transparent' :
              'from-amber-900/40 via-orange-900/20 to-transparent'
            }`} />
          )}
          {/* Bottom gradient fade so the card hover is seamless */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#fafafa] via-[#fafafa]/80 to-transparent pointer-events-none" />
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Profile Header — overlaps the banner */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4 sm:p-6 md:p-8 mb-6 relative z-10 -mt-32 sm:-mt-36 md:-mt-40">
              {/* Action Buttons - Top Right */}
              <div ref={shareRef} className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
                {/* Compare button */}
                <button
                  onClick={() => navigate(`/compare?creators=${platform}:${username}`)}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-all duration-200 text-sm shadow-lg border bg-white border-neutral-200 text-neutral-700 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50"
                  title="Compare this creator"
                >
                  <Scale className="w-4 h-4" />
                  <span className="hidden sm:inline">Compare</span>
                </button>

                {/* Share button + panel */}
                <div>
                  <button
                    onClick={handleShareClick}
                    className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-all duration-200 text-sm shadow-lg border ${
                      showSharePanel
                        ? 'bg-neutral-100 border-neutral-300 text-neutral-900'
                        : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:text-neutral-900'
                    }`}
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Share</span>
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
                      {isMod && <p className="text-xs text-neutral-400">Embed works in Notion, websites, and anywhere iframes are supported.</p>}
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
                  <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-amber-50 border-4 border-amber-200 shadow-lg flex items-center justify-center flex-shrink-0">
                    <Music className="w-10 h-10 sm:w-12 sm:h-12 text-amber-600" />
                  </div>
                ) : (
                  <CreatorAvatar
                    src={creator.profileImage}
                    name={creator.displayName}
                    size="2xl"
                    rounded="rounded-2xl"
                    loading="eager"
                    className="sm:w-24 sm:h-24 md:w-28 md:h-28 border-4 border-neutral-200 shadow-lg"
                  />
                )}
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-neutral-900">{creator.displayName}</h1>
                    <a
                      href={platformUrls[platform]?.(creator.username || username, creator?.platformId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm ${colors.bg} text-white hover:opacity-90 transition-opacity`}
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

            {/* Stats Grid */}
            <div className={`grid gap-2 sm:gap-4 mb-6 ${
              platform === 'tiktok' ? 'grid-cols-3'
              : platform === 'kick' ? (creator.category ? 'grid-cols-2' : 'grid-cols-1 max-w-md')
              : platform === 'twitch' && creator.category ? 'grid-cols-2 sm:grid-cols-3'
              : platform === 'twitch' ? 'grid-cols-2'
              : platform === 'bluesky' ? 'grid-cols-2'
              : platform === 'mastodon' ? 'grid-cols-2'
              : platform === 'rumble' ? 'grid-cols-2'
              : platform === 'substack' ? 'grid-cols-1 max-w-md'
              : platform === 'music' ? (creator.description ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')
              : 'grid-cols-2 lg:grid-cols-4'
            }`}>
              {/* Subscribers/Followers Card */}
              <StatCard
                icon={Users}
                label={platform === 'tiktok' || platform === 'twitch' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble' ? 'Followers' : platform === 'kick' ? 'Paid Subscribers' : platform === 'music' ? 'Monthly Listeners' : 'Subscribers'}
                value={formatNumber(creator.subscribers || creator.followers)}
                sublabel={creator.hiddenSubscribers ? '(hidden)' : (platform === 'youtube' && (creator.subscribers || 0) >= 1000) ? '(rounded by YouTube)' : creator.broadcasterType ? `(${creator.broadcasterType})` : null}
              />

              {/* TikTok: Show Likes and Videos */}
              {platform === 'tiktok' && (
                <>
                  <StatCard
                    icon={Eye}
                    label="Total Likes"
                    value={formatNumber(creator.totalViews || 0)}
                  />
                  <StatCard
                    icon={Video}
                    label="Videos"
                    value={formatNumber(creator.totalPosts || 0)}
                  />
                </>
              )}

              {/* Bluesky: Show Posts count */}
              {platform === 'bluesky' && (
                <StatCard
                  icon={Video}
                  label="Posts"
                  value={formatNumber(creator.totalPosts || 0)}
                />
              )}

              {/* Mastodon: Show Posts count (same as Bluesky) */}
              {platform === 'mastodon' && (
                <StatCard
                  icon={Video}
                  label="Posts"
                  value={formatNumber(creator.totalPosts || 0)}
                />
              )}

              {/* Rumble: Show Videos count */}
              {platform === 'rumble' && (
                <StatCard
                  icon={Video}
                  label="Videos"
                  value={formatNumber(creator.totalPosts || 0)}
                />
              )}

              {/* Music: Show Total Plays + Genres */}
              {platform === 'music' && (
                <>
                  <StatCard
                    icon={Play}
                    label="Total Plays"
                    value={formatNumber(creator.totalViews || 0)}
                  />
                  {creator.description && (
                    <StatCard
                      icon={Music}
                      label="Genres"
                      value={creator.description}
                    />
                  )}
                </>
              )}

              {/* Hours Watched / Total Views */}
              {platform === 'twitch' ? (
                <StatCard
                  icon={Eye}
                  label="Hours Watched"
                  value={
                    creator.hoursWatchedMonth
                      ? formatHoursWatched(creator.hoursWatchedMonth)
                      : (creator.dbCreatedAt || creator.created_at) &&
                        Date.now() - new Date(creator.dbCreatedAt || creator.created_at).getTime() > 30 * 24 * 60 * 60 * 1000
                        ? '0'
                        : 'Tracking...'
                  }
                  sublabel="Last 30 days"
                />
              ) : platform === 'youtube' ? (
                <StatCard
                  icon={Eye}
                  label="Total Views"
                  value={formatNumber(creator.totalViews)}
                />
              ) : null}

              {/* Videos / Category */}
              {platform === 'twitch' && creator.category && (
                <StatCard
                  icon={Video}
                  label="Category"
                  value={creator.category}
                />
              )}
              {platform === 'kick' && creator.category && (
                <StatCard
                  icon={Video}
                  label="Category"
                  value={creator.category}
                />
              )}
              {platform === 'youtube' && (
                <StatCard
                  icon={Video}
                  label="Videos"
                  value={formatNumber(creator.totalPosts)}
                />
              )}

              {/* Avg Views/Video - Only for YouTube */}
              {platform === 'youtube' && (
                <StatCard
                  icon={TrendingUp}
                  label="Avg Views/Video"
                  value={creator.totalPosts > 0 ? formatNumber(Math.round(creator.totalViews / creator.totalPosts)) : '-'}
                />
              )}
            </div>

            {/* Latest Post Card — Rumble, Mastodon, Substack */}
            {(platform === 'rumble' || platform === 'mastodon' || platform === 'substack') && creator.latestPost?.publishedAt && (
              <a
                href={creator.latestPost.url || creator.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block mb-6 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-4 sm:p-5 hover:border-neutral-300 transition-colors"
              >
                <div className="flex gap-4">
                  {creator.latestPost.thumbnail && (
                    <div className="flex-shrink-0 w-32 sm:w-44 aspect-video rounded-lg overflow-hidden bg-neutral-100">
                      <img
                        src={creator.latestPost.thumbnail}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${
                      platform === 'rumble' ? 'text-lime-700' : platform === 'substack' ? 'text-orange-700' : 'text-violet-700'
                    }`}>
                      Latest {platform === 'rumble' ? 'Video' : 'Post'}
                    </div>
                    {creator.latestPost.title && (
                      <h3 className="text-base sm:text-lg font-bold text-neutral-900 leading-snug line-clamp-2 group-hover:underline">
                        {creator.latestPost.title}
                      </h3>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelativeTime(creator.latestPost.publishedAt)}
                      </span>
                      {creator.latestPost.views != null && (
                        <span className="inline-flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {formatNumber(creator.latestPost.views)} views
                        </span>
                      )}
                      {creator.latestPost.reactions != null && creator.latestPost.reactions > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="w-3.5 h-3.5" />
                          {formatNumber(creator.latestPost.reactions)}
                        </span>
                      )}
                      {creator.latestPost.comments != null && creator.latestPost.comments > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {formatNumber(creator.latestPost.comments)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            )}

            {/* Growth Rate Cards + Summary - Combined row for Twitch/Kick/Bluesky */}
            {(platform === 'twitch' || platform === 'kick' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble') && metrics && metrics.growthRates && statsHistory.length >= 7 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <GrowthRateCard
                  label="7-Day Growth"
                  value={metrics.growthRates.sevenDay}
                  platform={platform}
                />
                <GrowthRateCard
                  label="30-Day Growth"
                  value={metrics.growthRates.thirtyDay}
                  platform={platform}
                />
                <SummaryCard
                  label={platform === 'kick' ? 'Paid Subscribers' : 'Followers'}
                  sublabel="Last 30 days"
                  value={metrics ? formatNumber(metrics.last30Days.subs) : '--'}
                  change={metrics?.last30Days.subs}
                />
              </div>
            )}

            {/* Fallback Summary for Twitch/Kick/Bluesky when not enough history for growth rates */}
            {(platform === 'twitch' || platform === 'kick' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble') && metrics && !(metrics.growthRates && statsHistory.length >= 7) && (
              <div className="grid grid-cols-1 max-w-xs gap-4 mb-6">
                <SummaryCard
                  label={platform === 'kick' ? 'Paid Subscribers' : 'Followers'}
                  sublabel="Last 30 days"
                  value={formatNumber(metrics.last30Days.subs)}
                  change={metrics?.last30Days.subs}
                />
              </div>
            )}

            {/* Growth Rate Cards - Other platforms (Mastodon uses the Twitch/Kick/Bluesky branch above).
                Substack is excluded entirely: its subscriber value is an order-of-
                magnitude bucket, so a growth percentage would be misleading. */}
            {platform !== 'twitch' && platform !== 'kick' && platform !== 'bluesky' && platform !== 'mastodon' && platform !== 'rumble' && platform !== 'substack' && metrics && metrics.growthRates && statsHistory.length >= 7 && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <GrowthRateCard
                  label="7-Day Growth"
                  value={metrics.growthRates.sevenDay}
                  platform={platform}
                />
                <GrowthRateCard
                  label="30-Day Growth"
                  value={metrics.growthRates.thirtyDay}
                  platform={platform}
                />
              </div>
            )}

            {/* Growth Summary - Non Twitch/Kick/Bluesky/Mastodon platforms (those use the SummaryCard rendered above) */}
            {platform !== 'twitch' && platform !== 'kick' && platform !== 'bluesky' && platform !== 'mastodon' && platform !== 'rumble' && platform !== 'substack' && (creator.subscribers || creator.followers) && (
              <div className={`grid gap-4 mb-6 ${
                platform === 'youtube' ? 'grid-cols-2 lg:grid-cols-4'
                : platform === 'tiktok' || platform === 'music' ? 'grid-cols-2'
                : 'grid-cols-2 lg:grid-cols-4'
              }`}>
                {platform === 'youtube' ? (
                  <>
                    {/* For YouTube, lead with Views (accurate) instead of Subscribers (rounded) */}
                    <SummaryCard
                      label="Views"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.views) : '--'}
                      change={metrics?.last30Days.views}
                    />
                    <SummaryCard
                      label="Videos"
                      sublabel="Last 30 days"
                      value={metrics ? `${metrics.last30Days.videos >= 0 ? '+' : ''}${metrics.last30Days.videos}` : '--'}
                    />
                    <SummaryCard
                      label="Monthly Est."
                      sublabel="Based on avg CPM"
                      value={metrics && metrics.last30Days.views > 0
                        ? formatEarnings(metrics.last30Days.views / 1000 * 2, metrics.last30Days.views / 1000 * 7)
                        : '--'
                      }
                    />
                    <SummaryCard
                      label="Yearly Est."
                      sublabel="Based on avg CPM"
                      value={metrics && metrics.last30Days.views > 0
                        ? formatEarnings(metrics.last30Days.views / 1000 * 2 * 12, metrics.last30Days.views / 1000 * 7 * 12)
                        : '--'
                      }
                    />
                  </>
                ) : platform === 'tiktok' ? (
                  <>
                    <SummaryCard
                      label="Followers"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.subs) : '--'}
                      change={metrics?.last30Days.subs}
                    />
                    <SummaryCard
                      label="Likes"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.views) : '--'}
                      change={metrics?.last30Days.views}
                    />
                  </>
                ) : platform === 'music' ? (
                  <>
                    <SummaryCard
                      label="Monthly Listeners"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.subs) : '--'}
                      change={metrics?.last30Days.subs}
                    />
                    <SummaryCard
                      label="Total Plays"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.views) : '--'}
                      change={metrics?.last30Days.views}
                    />
                  </>
                ) : (
                  <>
                    <SummaryCard
                      label="Subscribers"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.subs) : '--'}
                      change={metrics?.last30Days.subs}
                    />
                    <SummaryCard
                      label="Views"
                      sublabel="Last 30 days"
                      value={metrics ? formatNumber(metrics.last30Days.views) : '--'}
                      change={metrics?.last30Days.views}
                    />
                  </>
                )}
              </div>
            )}

            {/* Latest Video Card - YouTube only */}
            {platform === 'youtube' && latestVideo && (
              <a
                href={`https://youtube.com/watch?v=${latestVideo.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden mb-6 hover:border-neutral-300 transition-colors group"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="relative sm:w-72 flex-shrink-0">
                    <img
                      src={latestVideo.thumbnail}
                      alt={latestVideo.title}
                      loading="lazy"
                      className="w-full h-44 sm:h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <p className="text-xs font-medium text-indigo-600 mb-1.5">Latest Video</p>
                      <h3 className="font-semibold text-neutral-900 mb-2 line-clamp-2 group-hover:text-indigo-400 transition-colors">
                        {latestVideo.title}
                      </h3>
                      <p className="text-sm text-neutral-700">
                        Uploaded {(() => {
                          const published = new Date(latestVideo.publishedAt);
                          const now = new Date();
                          const diffDays = Math.floor((now - published) / (1000 * 60 * 60 * 24));
                          if (diffDays === 0) return 'today';
                          if (diffDays === 1) return 'yesterday';
                          if (diffDays < 7) return `${diffDays} days ago`;
                          if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
                          if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
                          return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-5 mt-3 text-sm text-neutral-700">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-neutral-700" />
                        {formatNumber(latestVideo.views)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ThumbsUp className="w-4 h-4 text-neutral-700" />
                        {formatNumber(latestVideo.likes)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4 text-neutral-700" />
                        {formatNumber(latestVideo.comments)}
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            )}

            {/* Live Counter Link - Hidden for TikTok, Bluesky, and Mastodon.
                These platforms don't have a meaningful "ticking up in real time" experience —
                follower counts change slowly. The counter exists for YT/Twitch/Kick where numbers move every second. */}
            {platform !== 'tiktok' && platform !== 'bluesky' && platform !== 'mastodon' && platform !== 'rumble' && platform !== 'substack' && (
              <Link
                to={`/live/${platform}/${creator.username}`}
                className="flex items-center justify-between bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-4 sm:p-5 mb-6 hover:border-neutral-300 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base text-neutral-900 truncate">
                      Live {platform === 'twitch' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble' ? 'Follower' : platform === 'kick' ? 'Paid Subscriber' : platform === 'music' ? 'Listener' : 'Subscriber'} Count
                    </p>
                    <p className="text-xs sm:text-sm text-neutral-500 truncate">Watch the count update in real-time</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900 flex-shrink-0 group-hover:gap-2.5 transition-all">
                  <span className="hidden sm:inline">Open</span>
                  <ExternalLink className="w-4 h-4" />
                </span>
              </Link>
            )}

            {/* Milestone Predictions — hidden for music since monthly listeners fluctuate
                (rolling 30-day window, not monotonically increasing like subs/followers) */}
            {metrics && platform !== 'music' && (
              platform === 'youtube'
                ? creator.totalViews && metrics.dailyAverage.views > 0
                : creator.subscribers || creator.followers
            ) && (
              <MilestonePredictions
                currentCount={platform === 'youtube' ? creator.totalViews : (creator.subscribers || creator.followers)}
                dailyGrowth={platform === 'youtube' ? metrics.dailyAverage.views : metrics.dailyAverage.subs}
                platform={platform}
              />
            )}

            {/* Growth Chart */}
            {statsHistory.length >= 2 && (
              <GrowthChart
                data={statsHistory}
                range={chartRange}
                onRangeChange={(val) => {
                  setChartRange(val);
                }}
                metric={chartMetric}
                onMetricChange={(metric) => {
                  setChartMetric(metric);
                  analytics.changeChartMetric(metric);
                }}
                platform={platform}
                maxHistoryDays={historyDays}
                subscribers={creator?.subscribers || 0}
              />
            )}

            {/* Music: Top Albums */}
            {platform === 'music' && musicAlbums.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-neutral-200">
                  <h3 className="text-lg font-semibold text-neutral-900">Top Albums</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0">
                  {musicAlbums.slice(0, 6).map((album, i) => {
                    const img = album.image?.find(im => im.size === 'large' || im.size === 'extralarge')?.['#text'];
                    const hasImg = img && !img.includes('2a96cbd8b46e442fc41c2b86b821562f');
                    return (
                      <a
                        key={i}
                        href={album.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block aspect-square overflow-hidden hover:z-10"
                      >
                        {hasImg ? (
                          <img
                            src={img}
                            alt={album.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-amber-50 flex items-center justify-center">
                            <Music className="w-8 h-8 text-amber-700" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                          <p className="text-white text-xs font-semibold line-clamp-2 leading-tight">{album.name}</p>
                          {album.playcount && (
                            <p className="text-neutral-700 text-xs mt-0.5">{formatNumber(parseInt(album.playcount))} plays</p>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Music: Top Tracks */}
            {platform === 'music' && musicTracks.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-neutral-200">
                  <h3 className="text-lg font-semibold text-neutral-900">Top Tracks</h3>
                </div>
                <div className="divide-y divide-gray-800">
                  {musicTracks.slice(0, 10).map((track, i) => (
                    <a
                      key={i}
                      href={track.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 px-6 py-3 hover:bg-neutral-50 transition-colors group"
                    >
                      <span className="w-6 text-center text-sm font-mono text-neutral-400 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate group-hover:text-amber-700 transition-colors">{track.name}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        {track.listeners && (
                          <span className="text-xs text-neutral-500 hidden sm:block">{formatNumber(parseInt(track.listeners))} listeners</span>
                        )}
                        {track.playcount && (
                          <span className="text-xs text-neutral-700 font-medium w-20 text-right">{formatNumber(parseInt(track.playcount))} plays</span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Metrics Table */}
            {metrics ? (
              <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-neutral-900">Daily Channel Metrics</h3>
                  <button
                    onClick={handleExportCSV}
                    title="Export as CSV"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      hasExport
                        ? 'bg-white hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border border-neutral-200'
                        : 'bg-neutral-50 text-neutral-400 border border-neutral-200 cursor-pointer'
                    }`}
                  >
                    {hasExport ? <Download className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                        <th className="px-6 py-4 font-semibold text-neutral-700">Date</th>
                        <th className="px-6 py-4 font-semibold text-neutral-700 text-right">
                          {platform === 'tiktok' || platform === 'twitch' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble' ? 'Followers' : platform === 'kick' ? 'Paid Subs' : platform === 'music' ? 'Listeners' : 'Subscribers'}
                        </th>
                        {platform === 'tiktok' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Likes</th>}
                        {platform === 'tiktok' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Videos</th>}
                        {platform === 'bluesky' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Posts</th>}
                        {platform === 'mastodon' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Posts</th>}
                        {platform === 'rumble' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Videos</th>}
                        {platform === 'music' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Total Plays</th>}
                        {platform === 'youtube' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Views</th>}
                        {platform === 'youtube' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Videos</th>}
                        {platform === 'youtube' && <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Est. Earnings</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.dailyStats.map((stat) => (
                        <tr key={stat.recorded_at} className="border-b border-neutral-200 hover:bg-neutral-50 transition-colors">
                          <td className="px-6 py-4 text-neutral-900">
                            {new Date(stat.recorded_at + 'T12:00:00').toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-medium text-neutral-900">{formatNumber(stat.subscribers || stat.followers)}</span>
                              {(platform === 'tiktok' || platform === 'twitch' || platform === 'kick' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble' || platform === 'substack' || platform === 'music' || (platform === 'youtube' && (creator.subscribers || 0) < 1000)) && stat.subsChange !== 0 && (
                                <span className={`text-xs ${stat.subsChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {stat.subsChange > 0 ? '+' : ''}{formatNumber(stat.subsChange)}
                                </span>
                              )}
                            </div>
                          </td>
                          {platform === 'tiktok' && (
                            <>
                              <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-medium text-neutral-900">{formatNumber(stat.total_views || 0)}</span>
                                  {stat.viewsChange !== 0 && (
                                    <span className={`text-xs ${stat.viewsChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {stat.viewsChange > 0 ? '+' : ''}{formatNumber(stat.viewsChange)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-medium text-neutral-900">{formatNumber(stat.total_posts || 0)}</span>
                                  {stat.videosChange !== 0 && (
                                    <span className={`text-xs ${stat.videosChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {stat.videosChange > 0 ? '+' : ''}{stat.videosChange}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                          {platform === 'bluesky' && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-medium text-neutral-900">{formatNumber(stat.total_posts || 0)}</span>
                                {stat.videosChange !== 0 && (
                                  <span className={`text-xs ${stat.videosChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {stat.videosChange > 0 ? '+' : ''}{stat.videosChange}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                          {platform === 'mastodon' && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-medium text-neutral-900">{formatNumber(stat.total_posts || 0)}</span>
                                {stat.videosChange !== 0 && (
                                  <span className={`text-xs ${stat.videosChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {stat.videosChange > 0 ? '+' : ''}{stat.videosChange}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                          {platform === 'rumble' && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-medium text-neutral-900">{formatNumber(stat.total_posts || 0)}</span>
                                {stat.videosChange !== 0 && (
                                  <span className={`text-xs ${stat.videosChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {stat.videosChange > 0 ? '+' : ''}{stat.videosChange}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                          {platform === 'music' && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-medium text-neutral-900">{formatNumber(stat.total_views || 0)}</span>
                                {stat.viewsChange !== 0 && (
                                  <span className={`text-xs ${stat.viewsChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {stat.viewsChange > 0 ? '+' : ''}{formatNumber(stat.viewsChange)}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                          {platform === 'youtube' && (
                            <>
                              <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-medium text-neutral-900">{formatNumber(stat.total_views)}</span>
                                  {stat.viewsChange !== 0 && (
                                    <span className={`text-xs ${stat.viewsChange > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>
                                      {stat.viewsChange > 0 ? '+' : ''}{formatNumber(stat.viewsChange)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-medium text-neutral-900">{formatNumber(stat.total_posts || 0)}</span>
                                  {stat.videosChange !== 0 && (
                                    <span className={`text-xs ${stat.videosChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {stat.videosChange > 0 ? '+' : ''}{stat.videosChange}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right text-neutral-700">
                                {stat.viewsChange > 0
                                  ? formatEarnings(stat.viewsChange / 1000 * 2, stat.viewsChange / 1000 * 7)
                                  : '—'
                                }
                              </td>
                            </>
                          )}
                        </tr>
                      ))}

                      {/* Summary Rows */}
                      <tr className="bg-indigo-50 font-semibold">
                        <td className="px-6 py-4 text-indigo-200">Daily Average</td>
                        <td className="px-6 py-4 text-right">
                          {/* For large YouTube channels, hide sub average since counts are rounded */}
                          {platform === 'youtube' && (creator.subscribers || 0) >= 1000 ? (
                            <span className="text-neutral-700">—</span>
                          ) : (
                            <span className={metrics.dailyAverage.subs >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {metrics.dailyAverage.subs >= 0 ? '+' : ''}{formatNumber(metrics.dailyAverage.subs)}
                            </span>
                          )}
                        </td>
                        {platform === 'tiktok' && (
                          <>
                            <td className="px-6 py-4 text-right">
                              <span className={metrics.dailyAverage.views >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {metrics.dailyAverage.views > 0 ? `+${formatNumber(metrics.dailyAverage.views)}` : '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right"></td>
                          </>
                        )}
                        {platform === 'music' && (
                          <td className="px-6 py-4 text-right">
                            <span className={metrics.dailyAverage.views >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {metrics.dailyAverage.views > 0 ? `+${formatNumber(metrics.dailyAverage.views)}` : '—'}
                            </span>
                          </td>
                        )}
                        {platform === 'youtube' && (
                          <>
                            <td className={`px-6 py-4 text-right ${metrics.dailyAverage.views > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>
                              {metrics.dailyAverage.views > 0
                                ? `+${formatNumber(metrics.dailyAverage.views)}`
                                : '—'
                              }
                            </td>
                            <td className="px-6 py-4 text-right"></td>
                            <td className="px-6 py-4 text-right text-indigo-200">
                              {metrics.dailyAverage.views > 0
                                ? formatEarnings(metrics.dailyAverage.views / 1000 * 2, metrics.dailyAverage.views / 1000 * 7)
                                : '—'
                              }
                            </td>
                          </>
                        )}
                      </tr>

                      <tr className="bg-indigo-50 font-semibold">
                        <td className="px-6 py-4 text-indigo-200">Weekly Average</td>
                        <td className="px-6 py-4 text-right">
                          {platform === 'youtube' ? (
                            <span className="text-neutral-700">—</span>
                          ) : (
                            <span className={metrics.weeklyAverage.subs >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {metrics.weeklyAverage.subs >= 0 ? '+' : ''}{formatNumber(metrics.weeklyAverage.subs)}
                            </span>
                          )}
                        </td>
                        {platform === 'tiktok' && (
                          <>
                            <td className="px-6 py-4 text-right">
                              <span className={metrics.weeklyAverage.views >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {metrics.weeklyAverage.views > 0 ? `+${formatNumber(metrics.weeklyAverage.views)}` : '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right"></td>
                          </>
                        )}
                        {platform === 'music' && (
                          <td className="px-6 py-4 text-right">
                            <span className={metrics.weeklyAverage.views >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {metrics.weeklyAverage.views > 0 ? `+${formatNumber(metrics.weeklyAverage.views)}` : '—'}
                            </span>
                          </td>
                        )}
                        {platform === 'youtube' && (
                          <>
                            <td className={`px-6 py-4 text-right ${metrics.weeklyAverage.views > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>
                              {metrics.weeklyAverage.views > 0
                                ? `+${formatNumber(metrics.weeklyAverage.views)}`
                                : '—'
                              }
                            </td>
                            <td className="px-6 py-4 text-right"></td>
                            <td className="px-6 py-4 text-right text-indigo-200">
                              {metrics.weeklyAverage.views > 0
                                ? formatEarnings(metrics.weeklyAverage.views / 1000 * 2, metrics.weeklyAverage.views / 1000 * 7)
                                : '—'
                              }
                            </td>
                          </>
                        )}
                      </tr>

                      <tr className="bg-indigo-50 font-semibold">
                        <td className="px-6 py-4 text-indigo-200">Last 30 Days</td>
                        <td className="px-6 py-4 text-right">
                          {platform === 'youtube' ? (
                            <span className="text-neutral-700">—</span>
                          ) : (
                            <span className={metrics.last30Days.subs >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {metrics.last30Days.subs >= 0 ? '+' : ''}{formatNumber(metrics.last30Days.subs)}
                            </span>
                          )}
                        </td>
                        {platform === 'tiktok' && (
                          <>
                            <td className={`px-6 py-4 text-right ${metrics.last30Days.views >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {metrics.last30Days.views >= 0 ? '+' : ''}{formatNumber(metrics.last30Days.views)}
                            </td>
                            <td className={`px-6 py-4 text-right ${metrics.last30Days.videos >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {metrics.last30Days.videos >= 0 ? '+' : ''}{metrics.last30Days.videos}
                            </td>
                          </>
                        )}
                        {platform === 'music' && (
                          <td className={`px-6 py-4 text-right ${metrics.last30Days.views >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {metrics.last30Days.views >= 0 ? '+' : ''}{formatNumber(metrics.last30Days.views)}
                          </td>
                        )}
                        {platform === 'youtube' && (
                          <>
                            <td className="px-6 py-4 text-right text-emerald-600">
                              {metrics.last30Days.views > 0
                                ? `+${formatNumber(metrics.last30Days.views)}`
                                : '—'
                              }
                            </td>
                            <td className={`px-6 py-4 text-right ${metrics.last30Days.videos >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {metrics.last30Days.videos >= 0 ? '+' : ''}{metrics.last30Days.videos}
                            </td>
                            <td className="px-6 py-4 text-right text-indigo-200">
                              {metrics.last30Days.views > 0
                                ? formatEarnings(metrics.last30Days.views / 1000 * 2, metrics.last30Days.views / 1000 * 7)
                                : '—'
                              }
                            </td>
                          </>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8 text-center">
                <TrendingUp className="w-6 h-6 text-neutral-300 mx-auto mb-4" />
                <h3 className="text-base font-medium text-neutral-900 mb-1.5">Building Historical Data</h3>
                <p className="text-neutral-500 text-sm mb-2">
                  This creator is being tracked. We collect daily snapshots to show growth trends and metrics.
                </p>
                <p className="text-xs text-neutral-400 tabular-nums">
                  {statsHistory.length} day(s) of data collected • Check back soon for trends
                </p>
              </div>
            )}

            {/* Channel Creation Date */}
            {creator.createdAt && (
              <div className="mt-6 flex items-center gap-2 text-sm text-neutral-700">
                <Calendar className="w-4 h-4" />
                <span>Channel created: {new Date(creator.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Precision system: stat identity is a muted icon tint, nothing else.
const STAT_TINTS = {
  Subscribers:        'text-red-500',
  Followers:          'text-pink-500',
  'Total Views':      'text-indigo-500',
  Videos:             'text-sky-500',
  'Avg Views/Video':  'text-amber-500',
  'Hours Watched':    'text-purple-500',
  'Paid Subscribers': 'text-emerald-600',
  'Monthly Listeners':'text-amber-500',
  Posts:              'text-sky-500',
};

function StatCard({ icon: Icon, label, value, sublabel }) {
  const tint = STAT_TINTS[label] || 'text-neutral-400';
  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3 sm:p-5">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
        {Icon && <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${tint}`} />}
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 leading-tight line-clamp-2 break-words">{label}</p>
      </div>
      <p className="text-lg sm:text-3xl font-semibold text-neutral-900 tabular-nums truncate">{value}</p>
      {sublabel && <p className="text-[10px] sm:text-xs text-neutral-400 mt-1 sm:mt-1.5 truncate">{sublabel}</p>}
    </div>
  );
}

function SummaryCard({ label, sublabel, value, change }) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  // Use smaller text for longer values (like earnings ranges)
  const isLongValue = value && value.length > 12;

  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 sm:p-5">
      <p className={`font-semibold text-neutral-900 mb-1 tabular-nums ${isLongValue ? 'text-lg sm:text-xl md:text-2xl' : 'text-xl sm:text-2xl md:text-3xl'}`}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">{label}</p>
      {sublabel && <p className="text-xs text-neutral-400 mt-1">{sublabel}</p>}
      {change !== undefined && change !== null && (
        <p className={`text-xs mt-2 font-medium tabular-nums ${isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-neutral-400'}`}>
          {isPositive ? '+' : ''}{formatNumber(change)}
        </p>
      )}
    </div>
  );
}

function GrowthRateCard({ label, value, platform }) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  const valueColor = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-neutral-400';

  const followerLabel = platform === 'kick' ? 'Paid Subscribers'
    : platform === 'tiktok' || platform === 'twitch' || platform === 'bluesky' || platform === 'mastodon' || platform === 'rumble' ? 'Followers'
    : 'Subscribers';

  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">{label}</span>
        <TrendingUp className={`w-4 h-4 ${valueColor} ${isNegative ? 'rotate-180' : ''}`} />
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${valueColor}`}>
        {isPositive ? '+' : ''}{value.toFixed(2)}%
      </div>
      <p className="text-xs text-neutral-400 mt-1">{followerLabel} growth rate</p>
    </div>
  );
}

function formatEarnings(low, high) {
  if (!low || !high) return '$0';
  const formatCurrency = (num) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${Math.round(num)}`;
  };
  return `${formatCurrency(low)} - ${formatCurrency(high)}`;
}

function formatHoursWatched(hours) {
  if (!hours || hours === 0) return '0';
  if (hours >= 1000000) return `${(hours / 1000000).toFixed(1)}M`;
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}K`;
  return Math.round(hours).toLocaleString();
}

function MilestonePredictions({ currentCount, dailyGrowth, platform }) {
  // Generate the next N milestones algorithmically using the 1–9 × 10^n sequence.
  // Every "round number" humans care about (7M, 8M, 9M, 10M, 20M, 1B, etc.) fits this pattern.
  // No static list needed — works for any count at any scale, forever.
  //   450K  → [500K, 600K, 700K]
  //   6.4M  → [7M, 8M, 9M]
  //   995K  → [1M, 2M, 3M]
  //   85B   → [90B, 100B, 200B]
  const getNextMilestones = (count, n = 3) => {
    const results = [];
    const startPow = Math.floor(Math.log10(Math.max(count, 1)));
    for (let pow = startPow; results.length < n; pow++) {
      const decade = Math.pow(10, pow);
      for (let digit = 1; digit <= 9 && results.length < n; digit++) {
        if (digit * decade > count) results.push(digit * decade);
      }
    }
    return results;
  };

  const metricLabel = platform === 'youtube' ? 'views'
    : platform === 'kick' ? 'paid subscribers'
    : platform === 'music' ? 'listeners'
    : 'followers';

  if (dailyGrowth <= 0) return null;

  const nextMilestones = getNextMilestones(currentCount);
  if (nextMilestones.length === 0) return null;

  const predictions = nextMilestones.map(milestone => {
    const needed = milestone - currentCount;
    const daysNeeded = Math.ceil(needed / dailyGrowth);
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + daysNeeded);
    return { milestone, needed, daysNeeded, estimatedDate };
  });

  const formatMilestone = (num) => {
    if (num >= 1e12) return (num / 1e12).toFixed(0) + 'T';
    if (num >= 1e9) {
      const v = num / 1e9;
      return (Number.isInteger(v) ? v.toFixed(0) : parseFloat(v.toFixed(2)).toString()) + 'B';
    }
    if (num >= 1e6) {
      const v = num / 1e6;
      return (Number.isInteger(v) ? v.toFixed(0) : parseFloat(v.toFixed(1)).toString()) + 'M';
    }
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toLocaleString();
  };

  const formatDays = (days) => {
    if (days > 365) {
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      return `~${years}y ${months}m`;
    }
    if (days > 30) {
      const months = Math.floor(days / 30);
      const remainingDays = days % 30;
      return `~${months}mo ${remainingDays}d`;
    }
    return `~${days} days`;
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-indigo-600" />
        <h3 className="text-lg font-semibold text-neutral-900">Milestone Predictions</h3>
      </div>
      <p className="text-sm text-neutral-700 mb-4">
        Based on current {metricLabel} growth of <span className="font-semibold text-indigo-600">+{formatNumber(dailyGrowth)}/day</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {predictions.map((pred, index) => (
          <div
            key={pred.milestone}
            className={`rounded-xl p-4 border ${
              index === 0
                ? 'bg-neutral-900 border-neutral-900'
                : 'bg-white border-neutral-200/80'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Target className={`w-4 h-4 ${index === 0 ? 'text-neutral-400' : 'text-neutral-300'}`} />
              <span className={`text-2xl font-semibold tabular-nums ${
                index === 0 ? 'text-white' : 'text-neutral-900'
              }`}>
                {formatMilestone(pred.milestone)}
              </span>
            </div>
            <div className="space-y-1">
              <p className={`text-sm flex items-center gap-1 tabular-nums ${index === 0 ? 'text-neutral-300' : 'text-neutral-600'}`}>
                <Clock className="w-3.5 h-3.5" />
                {formatDays(pred.daysNeeded)}
              </p>
              <p className={`text-xs tabular-nums ${index === 0 ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Est. {pred.estimatedDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: pred.estimatedDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-400 mt-4">
        * Predictions assume consistent growth. Actual results may vary based on content, algorithm changes, and other factors.
      </p>
    </div>
  );
}

function GrowthChart({ data, range, onRangeChange, metric, onMetricChange, platform, maxHistoryDays, subscribers = 0 }) {
  const ranges = [
    { label: '30D', value: 30 },
    { label: '60D', value: 60 },
    { label: '90D', value: 90 },
    { label: 'All', value: 9999 },
  ].map((r) => ({
    ...r,
    locked: isFinite(maxHistoryDays) && r.value > maxHistoryDays,
  }));

  // Build metrics array based on platform
  // For YouTube: Views first (accurate), then Subscribers (rounded), then Videos
  // For Twitch: Followers only (views deprecated)
  const metrics = [];

  if (platform === 'youtube') {
    // Views are accurate for YouTube, show first
    metrics.push({
      value: 'views',
      label: 'View Growth',
      dataKey: 'views',
      color: '#10b981'
    });
    metrics.push({
      value: 'subscribers',
      label: 'Subscriber Growth',
      dataKey: 'subscribers',
      color: '#6366f1',
      ...(subscribers >= 1000 && { note: '(rounded by YouTube)' })
    });
    metrics.push({
      value: 'videos',
      label: 'Video Count',
      dataKey: 'videos',
      color: '#f59e0b'
    });
  } else if (platform === 'tiktok') {
    // TikTok: Follower Growth + Likes Growth
    metrics.push({
      value: 'subscribers',
      label: 'Follower Growth',
      dataKey: 'subscribers',
      color: '#6366f1'
    });
    metrics.push({
      value: 'views',
      label: 'Likes Growth',
      dataKey: 'views',
      color: '#ec4899'
    });
  } else if (platform === 'twitch') {
    // Twitch: follower growth + hours watched (cumulative)
    metrics.push({
      value: 'subscribers',
      label: 'Follower Growth',
      dataKey: 'subscribers',
      color: '#6366f1'
    });
  } else if (platform === 'kick') {
    // Kick: only paid subscriber growth (no views/followers available)
    metrics.push({
      value: 'subscribers',
      label: 'Subscriber Growth',
      dataKey: 'subscribers',
      color: '#6366f1'
    });
  } else if (platform === 'bluesky') {
    // Bluesky: follower growth + posts count
    metrics.push({
      value: 'subscribers',
      label: 'Follower Growth',
      dataKey: 'subscribers',
      color: '#0ea5e9'
    });
    metrics.push({
      value: 'videos',
      label: 'Post Count',
      dataKey: 'videos',
      color: '#38bdf8'
    });
  } else if (platform === 'mastodon') {
    // Mastodon: follower growth + posts count (same shape as Bluesky)
    metrics.push({
      value: 'subscribers',
      label: 'Follower Growth',
      dataKey: 'subscribers',
      color: '#7c3aed'
    });
    metrics.push({
      value: 'videos',
      label: 'Post Count',
      dataKey: 'videos',
      color: '#a78bfa'
    });
  } else if (platform === 'rumble') {
    // Rumble: follower growth + video count
    metrics.push({
      value: 'subscribers',
      label: 'Follower Growth',
      dataKey: 'subscribers',
      color: '#65a30d'
    });
    metrics.push({
      value: 'videos',
      label: 'Video Count',
      dataKey: 'videos',
      color: '#84cc16'
    });
  } else if (platform === 'music') {
    // Music (Last.fm): listener growth + total plays growth
    metrics.push({
      value: 'subscribers',
      label: 'Listener Growth',
      dataKey: 'subscribers',
      color: '#f59e0b'
    });
    metrics.push({
      value: 'views',
      label: 'Play Growth',
      dataKey: 'views',
      color: '#fb923c'
    });
  } else if (platform === 'substack') {
    // Substack: only the subscriber-reach bucket over time (no views/posts).
    metrics.push({
      value: 'subscribers',
      label: 'Subscriber Reach',
      dataKey: 'subscribers',
      color: '#ea580c'
    });
  } else {
    // Other platforms
    metrics.push({
      value: 'subscribers',
      label: 'Subscriber Growth',
      dataKey: 'subscribers',
      color: '#6366f1'
    });
    metrics.push({
      value: 'views',
      label: 'View Growth',
      dataKey: 'views',
      color: '#10b981'
    });
    metrics.push({
      value: 'videos',
      label: 'Video Count',
      dataKey: 'videos',
      color: '#f59e0b'
    });
  }

  const currentMetric = metrics.find(m => m.value === metric) || metrics[0];

  const filteredData = data
    .filter((stat) => {
      if (range === 9999) return true;
      const statDate = new Date(stat.recorded_at);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - range);
      return statDate >= cutoffDate;
    })
    .map((stat) => ({
      date: stat.recorded_at,
      subscribers: stat.subscribers || stat.followers || 0,
      views: stat.total_views || 0,
      videos: stat.total_posts || 0,
      hoursWatched: stat.hours_watched_month || null,
      label: new Date(stat.recorded_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

  if (filteredData.length < 2) {
    return null;
  }

  const values = filteredData.map(d => d[currentMetric.dataKey]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  // Calculate padding - ensure minimum 1% range for zero-variance data
  const valueRange = maxValue - minValue;
  const minPaddingRange = maxValue * 0.01 || 1000; // At least 1% of max value or 1000
  const padding = valueRange > 0
    ? Math.max(valueRange * 0.1, metric === 'views' ? 1000 : 100)
    : minPaddingRange;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-neutral-200 rounded-xl shadow-lg p-3">
          <p className="text-sm font-medium text-neutral-900 mb-1">
            {new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
          <p className="text-sm text-neutral-700">
            <span className="font-semibold" style={{ color: currentMetric.color }}>
              {currentMetric.dataKey === 'hoursWatched'
                ? formatHoursWatched(payload[0].value)
                : formatNumber(payload[0].value)}
            </span>
            {' '}{currentMetric.label.toLowerCase().replace(' growth', '').replace(' count', '')}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-lg">
          {metrics.map((m) => (
            <button
              key={m.value}
              onClick={() => onMetricChange(m.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                metric === m.value
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-700 hover:text-neutral-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => onRangeChange(r.value)}
              className={`relative flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                r.locked
                  ? 'text-neutral-400 cursor-pointer hover:text-neutral-400'
                  : range === r.value
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-700 hover:text-neutral-900'
              }`}
            >
              {r.locked && (
                <svg className="w-2.5 h-2.5 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              )}
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id={`${metric}Gradient`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={currentMetric.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={currentMetric.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#737373', fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[minValue - padding, maxValue + padding]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#737373', fontSize: 12 }}
              tickFormatter={(value) => formatNumber(value)}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={currentMetric.dataKey}
              stroke={currentMetric.color}
              strokeWidth={2}
              fill={`url(#${metric}Gradient)`}
              dot={false}
              activeDot={{ r: 6, fill: currentMetric.color, stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-4 mt-4 text-sm text-neutral-700">
        <span>{filteredData.length} data points</span>
        <span className="w-1 h-1 rounded-full bg-gray-600"></span>
        <span>
          {formatNumber(filteredData[filteredData.length - 1]?.[currentMetric.dataKey] - filteredData[0]?.[currentMetric.dataKey])} net growth
        </span>
      </div>
    </div>
  );
}
