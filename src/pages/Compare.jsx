import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, Plus, Youtube, Twitch, Users, Eye, Video, TrendingUp, ArrowRight, Scale, Loader2, DollarSign, TrendingDown, Minus, Info, Bookmark, Check, Sparkles, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import { Music } from 'lucide-react';
import { CompareCardSkeleton } from '../components/Skeleton';
import { searchChannels as searchYouTube, getChannelByUsername as getYouTubeChannel } from '../services/youtubeService';
import { searchChannels as searchTwitch, getChannelByUsername as getTwitchChannel } from '../services/twitchService';
import { searchChannels as searchKick, getChannelByUsername as getKickChannel } from '../services/kickService';
import { searchBluesky, getBlueskyProfile } from '../services/blueskyService';
import { searchArtists as searchMusic, getArtistByMbid, getArtistByName } from '../services/musicService';
import { searchCreators, getCreatorByUsername, getCreatorStats, getHoursWatched } from '../services/creatorService';
import { saveCompare, findSavedCompare, deleteSavedCompare } from '../services/compareService';
import { supabase } from '../lib/supabase';
import SEO from '../components/SEO';
import { analytics } from '../lib/analytics';
import { formatNumber } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import logger from '../lib/logger';

// Compare cap — keep a sensible UI limit so the chart stays readable.
// No tier system anymore; everyone can compare up to MAX_COMPARE creators.
const MAX_COMPARE = 10;
const MAX_SAVED_COMPARES = 50;

const POPULAR_MATCHUPS = [
  { url: 'youtube:pewdiepie,youtube:mrbeast',   aName: 'PewDiePie',      bName: 'MrBeast',   aPlatform: 'youtube', bPlatform: 'youtube' },
  { url: 'twitch:xqc,twitch:kaicenat',          aName: 'xQc',            bName: 'Kai Cenat', aPlatform: 'twitch',  bPlatform: 'twitch'  },
  { url: 'twitch:ninja,twitch:shroud',          aName: 'Ninja',          bName: 'Shroud',    aPlatform: 'twitch',  bPlatform: 'twitch'  },
  { url: 'twitch:pokimane,twitch:hasanabi',     aName: 'Pokimane',       bName: 'HasanAbi',  aPlatform: 'twitch',  bPlatform: 'twitch'  },
  { url: 'youtube:mrbeast,twitch:ninja',        aName: 'MrBeast',        bName: 'Ninja',     aPlatform: 'youtube', bPlatform: 'twitch'  },
  { url: 'tiktok:charlidamelio,tiktok:addisonre', aName: "Charli D'Amelio", bName: 'Addison Rae', aPlatform: 'tiktok', bPlatform: 'tiktok' },
];

const platformConfig = {
  youtube: { icon: Youtube, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  tiktok: { icon: TikTokIcon, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
  twitch: { icon: Twitch, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  kick: { icon: KickIcon, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  bluesky: { icon: BlueskyIcon, color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  music: { icon: Music, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  mastodon: { icon: MastodonIcon, color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  rumble: { icon: RumbleIcon, color: 'text-lime-700', bg: 'bg-lime-50', border: 'border-lime-200' },
  substack: { icon: SubstackIcon, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
};

export default function Compare() {
  const [creators, setCreators] = useState([null, null]);
  const [loadingFromUrl, setLoadingFromUrl] = useState(false);
  const [growthData, setGrowthData] = useState({});
  const [loadingGrowth, setLoadingGrowth] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [existingSave, setExistingSave] = useState(null); // { id, name } if already saved
  const [removing, setRemoving] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const skipNextUrlLoad = useRef(false);
  const { user, isAuthenticated } = useAuth();
  const maxCompare = MAX_COMPARE;
  const maxSavedCompares = MAX_SAVED_COMPARES;

  const updateUrl = (newCreators) => {
    skipNextUrlLoad.current = true;
    const filled = newCreators.filter(Boolean);
    if (filled.length === 0) {
      navigate('/compare', { replace: true });
    } else {
      const param = filled.map(c => `${c.platform}:${c.username}`).join(',');
      navigate(`/compare?creators=${param}`, { replace: true });
    }
  };

  // Parse ?creators=platform:username,platform:username from URL
  useEffect(() => {
    // Skip if we just set the URL ourselves (no need to re-fetch)
    if (skipNextUrlLoad.current) {
      skipNextUrlLoad.current = false;
      return;
    }

    const params = new URLSearchParams(location.search);
    const creatorsParam = params.get('creators');

    if (!creatorsParam) return;

    const creatorList = creatorsParam.split(',').filter(Boolean);
    if (creatorList.length === 0) return;

    setLoadingFromUrl(true);

    const loadCreators = async () => {
      const loadedCreators = await Promise.all(
        creatorList.slice(0, maxCompare).map(async (entry) => {
          const [platform, username] = entry.split(':');
          if (!platform || !username) return null;

          try {
            if (platform === 'youtube') {
              return await getYouTubeChannel(username);
            } else if (platform === 'tiktok') {
              const result = await getCreatorByUsername('tiktok', username);
              if (!result) return null;
              const { data: stats } = await supabase
                .from('creator_stats')
                .select('followers, total_views, total_posts')
                .eq('creator_id', result.id)
                .order('recorded_at', { ascending: false })
                .limit(1)
                .single();
              return {
                platform: 'tiktok',
                platformId: result.platform_id,
                username: result.username,
                displayName: result.display_name || result.username,
                profileImage: result.profile_image,
                description: result.description,
                subscribers: stats?.followers || 0,
                totalViews: stats?.total_views || 0,
                totalPosts: stats?.total_posts || 0,
              };
            } else if (platform === 'twitch') {
              return await getTwitchChannel(username);
            } else if (platform === 'kick') {
              return await getKickChannel(username);
            } else if (platform === 'bluesky') {
              return await getBlueskyProfile(username);
            } else if (platform === 'music') {
              const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              const dbCreator = await getCreatorByUsername('music', username);
              if (dbCreator?.platform_id) {
                return MBID_RE.test(dbCreator.platform_id)
                  ? await getArtistByMbid(dbCreator.platform_id)
                  : await getArtistByName(dbCreator.display_name || username);
              }
            } else if (platform === 'mastodon' || platform === 'rumble' || platform === 'substack') {
              // DB-first hydration (same approach as TikTok). Live API for
              // Mastodon needs an authed Edge call and Rumble is Cloudflare-
              // blocked from Vercel IPs — the seeded DB is the source of truth.
              const dbCreator = await getCreatorByUsername(platform, username);
              if (!dbCreator) return null;
              const { data: stats } = await supabase
                .from('creator_stats')
                .select('followers, total_posts, subscribers')
                .eq('creator_id', dbCreator.id)
                .order('recorded_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              const followers = stats?.followers || stats?.subscribers || 0;
              return {
                platform,
                platformId: dbCreator.platform_id,
                username: dbCreator.username,
                displayName: dbCreator.display_name || dbCreator.username,
                profileImage: dbCreator.profile_image,
                description: dbCreator.description,
                subscribers: followers,
                followers,
                totalViews: null, // neither platform exposes per-profile total views
                totalPosts: stats?.total_posts || 0,
              };
            }
          } catch (err) {
            // Skip creators that fail to load
            return null;
          }
          return null;
        })
      );

      const validCreators = loadedCreators.filter(Boolean);

      // Ensure we always have at least 2 slots
      while (validCreators.length < 2) {
        validCreators.push(null);
      }

      setCreators(validCreators);
      setLoadingFromUrl(false);

      // Track comparison if we have multiple creators
      if (validCreators.filter(Boolean).length >= 2) {
        const first = validCreators[0];
        const second = validCreators[1];
        if (first && second) {
          analytics.compare(first.platform, first.username, second.platform, second.username);
        }
      }
    };

    loadCreators();
  }, [location.search]);

  const selectCreator = (index, creator) => {
    const newCreators = [...creators];
    newCreators[index] = creator;
    setCreators(newCreators);
    updateUrl(newCreators);

    // Track comparison when both slots are filled
    if (newCreators[0] && newCreators[1]) {
      analytics.compare(
        newCreators[0].platform,
        newCreators[0].username,
        newCreators[1].platform,
        newCreators[1].username
      );
    }
  };

  const removeCreator = (index) => {
    const newCreators = [...creators];
    newCreators[index] = null;
    setCreators(newCreators);
    updateUrl(newCreators);
  };

  const addSlot = () => {
    if (creators.length < maxCompare) {
      setCreators([...creators, null]);
    }
  };

  const removeSlot = (index) => {
    if (creators.length > 2) {
      const newCreators = [...creators];
      newCreators.splice(index, 1);
      setCreators(newCreators);
      updateUrl(newCreators);
    }
  };

  // Fetch growth data for creators
  useEffect(() => {
    const fetchGrowthData = async () => {
      const filled = creators.filter(Boolean);
      if (filled.length === 0) return;

      setLoadingGrowth(true);
      const growth = {};

      for (const creator of filled) {
        try {
          // Get creator from database to get UUID
          const dbCreator = await getCreatorByUsername(creator.platform, creator.username);
          if (!dbCreator) continue;

          // Fetch last 30 days of stats
          const stats = await getCreatorStats(dbCreator.id, 30);
          if (!stats || stats.length < 2) continue;

          // getCreatorStats returns ascending order (oldest first), so:
          // stats[0] = oldest (~30 days ago), stats[last] = newest (today)
          const latest = stats[stats.length - 1];
          const sevenDaysBack = stats[Math.max(0, stats.length - 1 - 7)];
          const thirtyDaysBack = stats[0];

          // Calculate growth percentages
          const calc7Day = sevenDaysBack?.subscribers
            ? ((latest.subscribers - sevenDaysBack.subscribers) / sevenDaysBack.subscribers * 100) : 0;
          const calc30Day = thirtyDaysBack?.subscribers
            ? ((latest.subscribers - thirtyDaysBack.subscribers) / thirtyDaysBack.subscribers * 100) : 0;

          // Calculate actual 30-day view growth for YouTube earnings estimate
          let monthlyViews = 0;
          if (creator.platform === 'youtube') {
            if (latest?.total_views != null && thirtyDaysBack?.total_views != null) {
              monthlyViews = Math.max(0, latest.total_views - thirtyDaysBack.total_views);
            }
          }

          // For Twitch/Kick, fetch hours watched separately — getHoursWatched has
          // no date limit and always returns the most recent non-zero value.
          let hoursWatched = 0;
          if (creator.platform === 'twitch' || creator.platform === 'kick') {
            const hw = await getHoursWatched(dbCreator.id);
            hoursWatched = hw?.hours_watched_month || 0;
          }

          growth[creator.platformId] = {
            growth7Day: calc7Day,
            growth30Day: calc30Day,
            diff7Day: sevenDaysBack?.subscribers != null ? latest.subscribers - sevenDaysBack.subscribers : 0,
            diff30Day: thirtyDaysBack?.subscribers != null ? latest.subscribers - thirtyDaysBack.subscribers : 0,
            monthlyViews: monthlyViews,
            hoursWatched,
          };
        } catch (err) {
          logger.warn(`Failed to fetch growth data for ${creator.username}:`, err);
        }
      }

      setGrowthData(growth);
      setLoadingGrowth(false);
    };

    fetchGrowthData();
  }, [creators]);

  // Check if this comparison is already saved
  useEffect(() => {
    const checkExisting = async () => {
      const filled = creators.filter(Boolean);
      if (!isAuthenticated || !user || filled.length < 2) {
        setExistingSave(null);
        return;
      }
      try {
        const param = filled.map(c => `${c.platform}:${c.username}`).join(',');
        const existing = await findSavedCompare(user.id, param);
        setExistingSave(existing);
      } catch (err) {
        setExistingSave(null);
      }
    };
    checkExisting();
  }, [creators, user, isAuthenticated]);

  // Auto-generate compare name from creator display names
  const buildDefaultName = (creatorsArr) => {
    const names = creatorsArr.filter(Boolean).map(c => c.displayName);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    const last = names.pop();
    return `${names.join(', ')} vs ${last}`;
  };

  const handleOpenSave = () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to save this comparison' },
      }));
      return;
    }
    // Check saved comparisons limit
    // We don't know the count here without a fetch, so we gate after save attempt
    // The save dialog itself handles this via maxSavedCompares check
    setSaveName(buildDefaultName(creators));
    setSaveDialogOpen(true);
  };

  const handleSaveCompare = async () => {
    if (!saveName.trim() || !user) return;
    setSaving(true);
    try {
      const param = creators.filter(Boolean).map(c => `${c.platform}:${c.username}`).join(',');
      const saved = await saveCompare(user.id, saveName, param);
      setSaveDialogOpen(false);
      setExistingSave(saved);
      setSavedFlash(true);
      toast.success('Comparison saved', { description: 'Find it on your Dashboard.' });
      setTimeout(() => setSavedFlash(false), 3000);
    } catch (err) {
      logger.error('Failed to save compare:', err);
      toast.error('Could not save comparison');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSave = async () => {
    if (!existingSave) return;
    setRemoving(true);
    try {
      await deleteSavedCompare(existingSave.id);
      setExistingSave(null);
      toast.success('Saved comparison removed');
    } catch (err) {
      logger.error('Failed to remove saved compare:', err);
      toast.error('Could not remove saved comparison');
    } finally {
      setRemoving(false);
    }
  };

  const filledCreators = creators.filter(Boolean);

  // Helper: Format growth percentage
  const formatGrowth = (percentage) => {
    if (!percentage || isNaN(percentage)) return '—';
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  };

  // Helper: Get growth icon
  const getGrowthIcon = (percentage) => {
    if (!percentage || isNaN(percentage)) return Minus;
    return percentage > 0 ? TrendingUp : TrendingDown;
  };

  // Helper: Get growth color
  const getGrowthColor = (percentage) => {
    if (!percentage || isNaN(percentage)) return 'text-neutral-700';
    return percentage > 0 ? 'text-emerald-600' : 'text-red-500';
  };

  // Helper: Format earnings estimate (YouTube only, based on actual 30-day views)
  const formatEarnings = (monthlyViews) => {
    if (!monthlyViews || monthlyViews === 0) return '—';
    const monthlyLow = (monthlyViews / 1000) * 2;
    const monthlyHigh = (monthlyViews / 1000) * 7;

    const formatCurrency = (amount) => {
      if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
      return `$${amount.toFixed(0)}`;
    };

    return `${formatCurrency(monthlyLow)} - ${formatCurrency(monthlyHigh)}`;
  };

  return (
    <>
      <SEO
        title="Compare Creators"
        description="Compare social media creators side-by-side. See subscriber counts, follower counts, views, and growth metrics."
      />

      <div className="min-h-screen bg-[#fafafa]">
        {/* ============== HERO ==============
            Cinematic head-to-head treatment: animated VS sigil with rotating
            ring, soft violet glow, eyebrow label. When creators are loaded the
            hero condenses (smaller padding) so the actual matchup takes focus. */}
        <section className="relative overflow-hidden border-b border-neutral-200 bg-gradient-to-b from-white via-violet-50/40 to-[#fafafa]">
          {/* Decorative glow blobs */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-80 bg-violet-400/15 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-[15%] w-72 h-72 bg-fuchsia-300/20 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-[15%] w-72 h-72 bg-indigo-300/20 rounded-full blur-3xl" />

          <div className={`w-full px-4 sm:px-6 lg:px-8 relative ${filledCreators.length >= 2 ? 'py-7 sm:py-9' : 'py-12 sm:py-16'}`}>
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex items-center gap-1.5 px-3 py-1 mb-5 bg-white/80 backdrop-blur-md border border-violet-200/70 rounded-full shadow-sm shadow-violet-500/5"
              >
                <Sparkles className="w-3 h-3 text-violet-600" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Head to head</span>
              </motion.div>

              {/* Animated VS sigil — only on the empty hero state so it doesn't
                  compete with the actual matchup widget below. */}
              {filledCreators.length < 2 && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                  className="relative inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 mb-5"
                >
                  <span
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-600 opacity-30 blur-2xl animate-pulse"
                  />
                  <motion.span
                    aria-hidden="true"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border border-dashed border-violet-400/60"
                  />
                  <span className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-600 shadow-2xl shadow-violet-500/40 flex items-center justify-center">
                    <Swords className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  </span>
                </motion.div>
              )}

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900"
              >
                Compare any{' '}
                <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-indigo-600 bg-clip-text text-transparent">
                  two creators
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-3 text-base sm:text-lg text-neutral-600 max-w-xl mx-auto"
              >
                Side-by-side stats across every platform we track. Stack up to 10 creators.
              </motion.p>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Loading State */}
          {loadingFromUrl && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <CompareCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Clear All / Save row */}
          {!loadingFromUrl && filledCreators.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {filledCreators.length >= 2 && (
                    savedFlash ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg">
                        <Check className="w-3.5 h-3.5" />
                        Saved!
                      </span>
                    ) : existingSave ? (
                      <button
                        onClick={handleRemoveSave}
                        disabled={removing}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-700 bg-neutral-100 hover:bg-red-50 hover:text-red-600 border border-neutral-300 hover:border-red-200 rounded-lg transition-colors font-medium"
                      >
                        <Bookmark className="w-3.5 h-3.5 fill-current" />
                        {removing ? 'Removing...' : 'Saved'}
                      </button>
                    ) : (
                      <button
                        onClick={handleOpenSave}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors font-medium"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        Save Comparison
                      </button>
                    )
                  )}
                </div>
                <button
                  onClick={() => {
                    setCreators([null, null]);
                    navigate('/compare', { replace: true });
                    setSaveDialogOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-700 hover:text-red-600 hover:bg-red-950/20 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all
                </button>
              </div>
              {/* Save Dialog - own row */}
              {saveDialogOpen && (
                <div className="flex items-center gap-2 bg-white border border-neutral-300 rounded-xl px-3 py-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCompare(); if (e.key === 'Escape') setSaveDialogOpen(false); }}
                    placeholder="Name this comparison..."
                    maxLength={80}
                    autoFocus
                    className="bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none flex-1 min-w-0"
                  />
                  <button
                    onClick={handleSaveCompare}
                    disabled={saving || !saveName.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setSaveDialogOpen(false)}
                    className="p-1 text-neutral-500 hover:text-neutral-700 transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Empty state — popular matchups, with platform-tinted gradient
              backgrounds so each card reads as its own matchup. */}
          {!loadingFromUrl && filledCreators.length < 2 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mb-10"
            >
              <div className="text-center mb-5">
                <p className="text-[10px] sm:text-xs font-bold text-neutral-500 uppercase tracking-[0.18em]">Popular matchups</p>
                <p className="mt-1.5 text-sm text-neutral-500">Or pick from these classics. One click loads them both.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {POPULAR_MATCHUPS.map(({ url, aName, bName, aPlatform, bPlatform }, idx) => {
                  const AIcon = platformConfig[aPlatform]?.icon;
                  const BIcon = platformConfig[bPlatform]?.icon;
                  const aBg = platformConfig[aPlatform]?.bg || 'bg-neutral-50';
                  const bBg = platformConfig[bPlatform]?.bg || 'bg-neutral-50';
                  return (
                    <motion.div
                      key={url}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.5 + idx * 0.04 }}
                    >
                      <Link
                        to={`/compare?creators=${url}`}
                        className="group relative block overflow-hidden bg-white border border-neutral-200 hover:border-violet-300 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/10"
                      >
                        {/* Split background — left tinted by platform A, right by platform B */}
                        <div className="absolute inset-0 flex pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity">
                          <div className={`flex-1 ${aBg}`} />
                          <div className={`flex-1 ${bBg}`} />
                        </div>
                        <div className="relative flex items-center px-4 py-3.5">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {AIcon && (
                              <span className={`flex-shrink-0 w-6 h-6 rounded-md bg-white/90 flex items-center justify-center ${platformConfig[aPlatform]?.color} shadow-sm`}>
                                <AIcon className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <span className="text-sm font-bold text-neutral-900 truncate">{aName}</span>
                          </div>
                          <span className="mx-2 text-[10px] font-black text-white bg-gradient-to-br from-violet-600 to-fuchsia-500 px-2 py-0.5 rounded-full flex-shrink-0 tracking-widest shadow shadow-violet-500/30">
                            VS
                          </span>
                          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                            <span className="text-sm font-bold text-neutral-900 truncate text-right">{bName}</span>
                            {BIcon && (
                              <span className={`flex-shrink-0 w-6 h-6 rounded-md bg-white/90 flex items-center justify-center ${platformConfig[bPlatform]?.color} shadow-sm`}>
                                <BIcon className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Creator Slots */}
          {!loadingFromUrl && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <AnimatePresence mode="popLayout">
            {creators.map((creator, index) => (
              <motion.div
                key={creator ? `${creator.platform}:${creator.username}` : `slot-${index}`}
                layout
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                {creator ? (
                  <CreatorCard
                    creator={creator}
                    onRemove={() => removeCreator(index)}
                    growthData={growthData}
                  />
                ) : (
                  <SearchableSlot
                    onSelect={(creator) => selectCreator(index, creator)}
                    onRemove={creators.length > 2 ? () => removeSlot(index) : null}
                  />
                )}
              </motion.div>
            ))}
            {/* Add slot button */}
            {creators.length < maxCompare && (
              <motion.button
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                onClick={addSlot}
                className="group min-h-[280px] border-2 border-dashed border-neutral-300 hover:border-violet-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-neutral-400 hover:text-violet-600 hover:bg-violet-50/40 transition-all duration-200"
              >
                <span className="w-12 h-12 rounded-full bg-neutral-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors">
                  <Plus className="w-6 h-6" />
                </span>
                <span className="text-sm font-semibold">Add creator</span>
                <span className="text-[11px] text-neutral-400 group-hover:text-violet-500/70 transition-colors">Slot {creators.length + 1} of {maxCompare}</span>
              </motion.button>
            )}
            </AnimatePresence>
          </div>
          )}

          {/* VS centerpiece — bigger, cinematic when 2+ loaded. Avatars flank
              an animated VS badge that pulses, with platform pills below each. */}
          {!loadingFromUrl && filledCreators.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative mb-8 overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/60 to-fuchsia-50/40 p-5 sm:p-7"
            >
              {/* Soft glow behind the VS badge */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-32 bg-gradient-to-r from-violet-400/20 via-fuchsia-400/20 to-indigo-400/20 blur-3xl rounded-full" />
              <div className="relative flex items-center justify-center gap-3 sm:gap-6">
                {/* Left creator */}
                <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                  <div className="text-right min-w-0">
                    <p className="text-sm sm:text-base font-extrabold text-neutral-900 truncate">{filledCreators[0].displayName}</p>
                    {(() => {
                      const P = platformConfig[filledCreators[0].platform]?.icon;
                      return P ? (
                        <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${platformConfig[filledCreators[0].platform]?.bg} ${platformConfig[filledCreators[0].platform]?.color}`}>
                          <P className="w-2.5 h-2.5" />
                          {filledCreators[0].platform}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <img
                    src={filledCreators[0].profileImage}
                    alt=""
                    loading="lazy"
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover ring-2 ring-violet-200/80 shadow-md flex-shrink-0"
                  />
                </div>

                {/* Animated VS badge */}
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative flex-shrink-0"
                >
                  <span className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 blur-md opacity-50" />
                  <span className="relative inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-600 shadow-xl shadow-violet-500/40">
                    <span className="text-white font-black text-xs sm:text-sm tracking-widest">VS</span>
                  </span>
                </motion.div>

                {/* Right creator */}
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <img
                    src={filledCreators[1].profileImage}
                    alt=""
                    loading="lazy"
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover ring-2 ring-violet-200/80 shadow-md flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-extrabold text-neutral-900 truncate">{filledCreators[1].displayName}</p>
                    {(() => {
                      const P = platformConfig[filledCreators[1].platform]?.icon;
                      return P ? (
                        <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${platformConfig[filledCreators[1].platform]?.bg} ${platformConfig[filledCreators[1].platform]?.color}`}>
                          <P className="w-2.5 h-2.5" />
                          {filledCreators[1].platform}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>

              {filledCreators.length > 2 && (
                <div className="relative mt-4 flex items-center justify-center gap-2 text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/80 border border-neutral-200 rounded-full font-semibold">
                    +{filledCreators.length - 2} more in the comparison
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* Comparison Section */}
          {!loadingFromUrl && filledCreators.length >= 2 && (
            <>
              {/* Radar Chart */}
              <div className="mb-6">
                <ComparisonRadarChart creators={filledCreators} growthData={growthData} loadingGrowth={loadingGrowth} />
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-neutral-900">Comparison</h3>
                  <InfoTooltip text="Some fields show dashes for newer creators. Growth and earnings need a few days of tracked data before they populate." />
                  {loadingGrowth && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading growth data...
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 sticky top-0 z-10 backdrop-blur-md">
                        <th className="px-6 py-4 text-left font-semibold text-neutral-500 text-xs uppercase tracking-wider">Metric</th>
                        {filledCreators.map((creator, i) => (
                          <th key={creator.platformId} className="px-6 py-4 text-center font-semibold text-neutral-900">
                            <div className="flex items-center justify-center gap-2 relative">
                              {i > 0 && (
                                <span className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full text-[10px] font-black text-neutral-400 select-none uppercase tracking-widest">vs</span>
                              )}
                              <img src={creator.profileImage} alt="" loading="lazy" className="w-7 h-7 rounded-lg ring-2 ring-gray-700" />
                              <span className="truncate max-w-[120px]">{creator.displayName}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <ComparisonRow
                        label="Platform"
                        values={filledCreators.map(c => {
                          const PlatformIcon = platformConfig[c.platform]?.icon;
                          return (
                            <span key={c.platformId || c.platform} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm ${platformConfig[c.platform]?.bg} ${platformConfig[c.platform]?.color}`}>
                              {PlatformIcon && <PlatformIcon className="w-4 h-4" />}
                              {c.platform}
                            </span>
                          );
                        })}
                      />
                      <ComparisonRow
                        label="Subscribers / Followers"
                        icon={Users}
                        tooltip="YouTube and Kick track subscribers. Twitch, TikTok, and Bluesky track followers. Music tracks monthly listeners. Kick shows paid subscribers only, not total followers."
                        values={filledCreators.map(c => formatNumber(c.subscribers || c.followers))}
                        highlight={getWinner(filledCreators.map(c => c.subscribers || c.followers))}
                      />
                      <ComparisonRow
                        label="Views / Watch Hrs"
                        icon={Eye}
                        tooltip="Twitch and Kick show monthly watch hours (we don't track total views for streaming platforms). For TikTok, this shows total likes. Bluesky has no views metric. Music shows total plays."
                        values={filledCreators.map(c => {
                          if (c.platform === 'bluesky') return '—';
                          if (c.platform === 'twitch' || c.platform === 'kick') {
                            const hrs = growthData[c.platformId]?.hoursWatched;
                            return hrs ? `${formatNumber(hrs)} hrs` : '—';
                          }
                          return formatNumber(c.totalViews);
                        })}
                        highlight={getWinner(filledCreators.map(c => {
                          if (c.platform === 'bluesky') return null;
                          if (c.platform === 'twitch' || c.platform === 'kick') return growthData[c.platformId]?.hoursWatched || null;
                          return c.totalViews || null;
                        }))}
                      />
                      <ComparisonRow
                        label="Videos / Content"
                        icon={Video}
                        tooltip="For Twitch, video counts are not tracked. For Kick and Music, content counts are not available. For Bluesky, this shows total posts."
                        values={filledCreators.map(c =>
                          (c.platform === 'twitch' || c.platform === 'kick' || c.platform === 'music') ? '—' : formatNumber(c.totalPosts)
                        )}
                        highlight={filledCreators.every(c => c.platform !== 'twitch' && c.platform !== 'kick' && c.platform !== 'music') ? getWinner(filledCreators.map(c => c.totalPosts)) : null}
                      />
                      <ComparisonRow
                        label="Avg Views per Video"
                        icon={TrendingUp}
                        tooltip="Not available for Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, or Music. For TikTok, calculated as total likes divided by videos."
                        values={filledCreators.map(c =>
                          (c.platform === 'twitch' || c.platform === 'kick' || c.platform === 'bluesky' || c.platform === 'mastodon' || c.platform === 'rumble' || c.platform === 'substack' || c.platform === 'music') ? '—' :
                          c.totalPosts > 0 ? formatNumber(Math.round(c.totalViews / c.totalPosts)) : '—'
                        )}
                        highlight={filledCreators.every(c => c.platform !== 'twitch' && c.platform !== 'kick' && c.platform !== 'bluesky' && c.platform !== 'mastodon' && c.platform !== 'rumble' && c.platform !== 'substack' && c.platform !== 'music') ?
                          getWinner(filledCreators.map(c => c.totalPosts > 0 ? c.totalViews / c.totalPosts : 0)) : null}
                      />
                      {/* Growth Rates */}
                      <ComparisonRow
                        label="7-Day Growth"
                        tooltip="YouTube and Kick track subscriber growth. Twitch, TikTok, and Bluesky track follower growth."
                        values={filledCreators.map(c => {
                          const data = growthData[c.platformId];
                          const percentage = data?.growth7Day || 0;
                          const diff = data?.diff7Day || 0;
                          const GrowthIcon = getGrowthIcon(percentage);
                          return (
                            <span key={c.platformId || c.platform} className={`inline-flex flex-col items-center gap-0.5 ${getGrowthColor(percentage)}`}>
                              <span className="inline-flex items-center gap-1">
                                <GrowthIcon className="w-3.5 h-3.5" />
                                {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatNumber(Math.abs(diff))}` : formatGrowth(percentage)}
                              </span>
                              {diff !== 0 && <span className="text-xs opacity-60">{formatGrowth(percentage)}</span>}
                            </span>
                          );
                        })}
                        highlight={getWinner(filledCreators.map(c => growthData[c.platformId]?.growth7Day || 0))}
                      />
                      <ComparisonRow
                        label="30-Day Growth"
                        tooltip="YouTube and Kick track subscriber growth. Twitch, TikTok, and Bluesky track follower growth."
                        values={filledCreators.map(c => {
                          const data = growthData[c.platformId];
                          const percentage = data?.growth30Day || 0;
                          const diff = data?.diff30Day || 0;
                          const GrowthIcon = getGrowthIcon(percentage);
                          return (
                            <span key={c.platformId || c.platform} className={`inline-flex flex-col items-center gap-0.5 ${getGrowthColor(percentage)}`}>
                              <span className="inline-flex items-center gap-1">
                                <GrowthIcon className="w-3.5 h-3.5" />
                                {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatNumber(Math.abs(diff))}` : formatGrowth(percentage)}
                              </span>
                              {diff !== 0 && <span className="text-xs opacity-60">{formatGrowth(percentage)}</span>}
                            </span>
                          );
                        })}
                        highlight={getWinner(filledCreators.map(c => growthData[c.platformId]?.growth30Day || 0))}
                      />
                      {/* Earnings Estimate (YouTube only) */}
                      {filledCreators.some(c => c.platform === 'youtube') && (
                        <ComparisonRow
                          label="Est. Monthly Earnings"
                          icon={DollarSign}
                          tooltip="YouTube only. Estimated from 30-day view growth at $2-$7 CPM. Actual earnings vary."
                          values={filledCreators.map(c => {
                            if (c.platform !== 'youtube') return '—';
                            const data = growthData[c.platformId];
                            return formatEarnings(data?.monthlyViews || 0);
                          })}
                        />
                      )}
                    </tbody>
                  </table>
                </div>

                {/* View Full Profiles - Desktop */}
                <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest text-center mb-3">View full profiles</p>
                  <div className={`grid gap-2 ${filledCreators.length <= 2 ? 'grid-cols-2' : filledCreators.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                    {filledCreators.map((creator) => {
                      const PlatIcon = platformConfig[creator.platform]?.icon;
                      return (
                        <Link
                          key={creator.platformId}
                          to={`/${creator.platform}/${creator.username}`}
                          className="flex items-center gap-2 px-3 py-2.5 bg-white border border-neutral-300 rounded-xl hover:border-violet-600/60 hover:bg-violet-950/10 transition-all group"
                        >
                          <img src={creator.profileImage} alt="" loading="lazy" className="w-7 h-7 rounded-lg flex-shrink-0" />
                          <span className="flex-1 min-w-0 text-sm font-medium text-neutral-800 truncate group-hover:text-white transition-colors">{creator.displayName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-violet-700 flex-shrink-0 transition-colors" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Mobile Compact Table View */}
              <div className="md:hidden space-y-4">
                <MobileComparisonTable
                  creators={filledCreators}
                  growthData={growthData}
                  getGrowthColor={getGrowthColor}
                  formatEarnings={formatEarnings}
                />

                {/* View Full Profiles - Mobile */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">View full profiles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {filledCreators.map((creator) => (
                      <Link
                        key={creator.platformId}
                        to={`/${creator.platform}/${creator.username}`}
                        className="flex items-center gap-2 p-2.5 bg-neutral-50 hover:bg-violet-950/20 hover:border-violet-600/40 border border-transparent rounded-xl transition-all group"
                      >
                        <img src={creator.profileImage} alt="" loading="lazy" className="w-7 h-7 rounded-lg flex-shrink-0" />
                        <span className="flex-1 min-w-0 text-sm font-medium text-neutral-800 truncate group-hover:text-white transition-colors">{creator.displayName}</span>
                        <ArrowRight className="w-3 h-3 text-neutral-400 group-hover:text-violet-700 flex-shrink-0 transition-colors" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}

function CreatorCard({ creator, onRemove, growthData }) {
  const config = platformConfig[creator.platform] || platformConfig.youtube;
  const Icon = config.icon;

  return (
    <div className="relative group/card">
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-all"
        title="Remove"
      >
        <X className="w-4 h-4" />
      </button>
      <Link
        to={`/${creator.platform}/${creator.username}`}
        className="block bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 hover:border-violet-500/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-200"
      >
        <div className="flex items-center gap-4 mb-4">
          <img
            src={creator.profileImage}
            alt={creator.displayName}
            className="w-16 h-16 rounded-xl object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-neutral-900 truncate">{creator.displayName}</p>
            <p className="text-sm text-neutral-700 truncate">@{creator.username}</p>
            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-xs ${config.bg} ${config.color}`}>
              <Icon className="w-3 h-3" />
              {creator.platform}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-neutral-50 rounded-xl p-3">
            <p className="text-xs text-neutral-700 mb-1">{creator.platform === 'twitch' || creator.platform === 'tiktok' || creator.platform === 'bluesky' || creator.platform === 'mastodon' || creator.platform === 'rumble' ? 'Followers' : creator.platform === 'music' ? 'Listeners' : 'Subs'}</p>
            <p className="font-bold text-neutral-900">{formatNumber(creator.subscribers || creator.followers)}</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3">
            {(creator.platform === 'twitch' || creator.platform === 'kick') ? (
              <>
                <p className="text-xs text-neutral-700 mb-1">Watch Hrs</p>
                <p className="font-bold text-neutral-900">
                  {growthData?.[creator.platformId]?.hoursWatched
                    ? formatNumber(growthData[creator.platformId].hoursWatched)
                    : '—'}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-neutral-700 mb-1">{creator.platform === 'tiktok' ? 'Likes' : creator.platform === 'bluesky' ? 'Posts' : creator.platform === 'music' ? 'Total Plays' : 'Views'}</p>
                <p className="font-bold text-neutral-900">{creator.platform === 'bluesky' ? formatNumber(creator.totalPosts) : formatNumber(creator.totalViews)}</p>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-violet-700/60 text-center mt-3 group-hover/card:text-violet-700/90 transition-colors">View profile →</p>
      </Link>
    </div>
  );
}

function SearchableSlot({ onSelect, onRemove }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPlatform, setSearchPlatform] = useState('youtube');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      let results = [];
      if (searchPlatform === 'youtube') {
        results = await searchYouTube(searchQuery, 5);
      } else if (searchPlatform === 'tiktok') {
        // Search TikTok from database
        const dbResults = await searchCreators(searchQuery, 'tiktok');
        const withStats = await Promise.all(
          dbResults.map(async (creator) => {
            const { data: stats } = await supabase
              .from('creator_stats')
              .select('followers, total_views, total_posts')
              .eq('creator_id', creator.id)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            return {
              platform: 'tiktok',
              platformId: creator.platform_id,
              username: creator.username,
              displayName: creator.display_name || creator.username,
              profileImage: creator.profile_image,
              description: creator.description,
              subscribers: stats?.followers || 0,
              totalViews: stats?.total_views || 0,
              totalPosts: stats?.total_posts || 0,
            };
          })
        );
        results = withStats.slice(0, 5);
      } else if (searchPlatform === 'twitch') {
        results = await searchTwitch(searchQuery, 5);
      } else if (searchPlatform === 'kick') {
        results = await searchKick(searchQuery, 5);
      } else if (searchPlatform === 'bluesky') {
        results = await searchBluesky(searchQuery, 5);
      } else if (searchPlatform === 'music') {
        results = await searchMusic(searchQuery, 5);
      } else if (searchPlatform === 'mastodon' || searchPlatform === 'rumble' || searchPlatform === 'substack') {
        // Same DB-hydration pattern as TikTok above
        const dbResults = await searchCreators(searchQuery, searchPlatform);
        const withStats = await Promise.all(
          dbResults.map(async (c) => {
            const { data: stats } = await supabase
              .from('creator_stats')
              .select('followers, total_posts, subscribers')
              .eq('creator_id', c.id)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            const followers = stats?.followers || stats?.subscribers || 0;
            return {
              platform: searchPlatform,
              platformId: c.platform_id,
              username: c.username,
              displayName: c.display_name || c.username,
              profileImage: c.profile_image,
              description: c.description,
              subscribers: followers,
              followers,
              totalViews: null,
              totalPosts: stats?.total_posts || 0,
            };
          })
        );
        results = withStats.slice(0, 5);
      }
      setSearchResults(results);
    } catch (err) {
      logger.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (creator) => {
    onSelect(creator);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-300 shadow-sm p-4 min-h-[280px] flex flex-col relative">
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 bg-neutral-100 hover:bg-red-50 rounded-lg text-neutral-700 hover:text-red-500 transition-all z-10"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Platform chips — replaces the select dropdown */}
      <div className="flex gap-1.5 mb-3">
        {[
          { id: 'youtube',  Icon: Youtube,     color: 'text-red-600',    bg: 'bg-red-50',    ring: 'ring-red-700',    label: 'YouTube' },
          { id: 'tiktok',   Icon: TikTokIcon,  color: 'text-pink-600',   bg: 'bg-pink-50',   ring: 'ring-pink-700',   label: 'TikTok' },
          { id: 'twitch',   Icon: Twitch,      color: 'text-purple-700', bg: 'bg-purple-50', ring: 'ring-purple-700', label: 'Twitch' },
          { id: 'kick',     Icon: KickIcon,    color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-700',  label: 'Kick' },
          { id: 'bluesky',  Icon: BlueskyIcon, color: 'text-sky-700',    bg: 'bg-sky-50',    ring: 'ring-sky-700',    label: 'Bluesky' },
          { id: 'music',    Icon: Music,        color: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-700',  label: 'Music' },
          { id: 'mastodon', Icon: MastodonIcon, color: 'text-violet-700', bg: 'bg-violet-50', ring: 'ring-violet-700', label: 'Mastodon' },
          { id: 'rumble',   Icon: RumbleIcon,   color: 'text-lime-700',   bg: 'bg-lime-50',   ring: 'ring-lime-700',   label: 'Rumble' },
          { id: 'substack', Icon: SubstackIcon, color: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-700', label: 'Substack' },
        ].map(({ id, Icon, color, bg, ring, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setSearchPlatform(id); setSearchResults([]); }}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all ${
              searchPlatform === id
                ? `${bg} ${color} ring-1 ${ring}`
                : 'bg-neutral-50 text-neutral-400 hover:text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[9px] font-medium leading-none">{label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creator..."
            className="w-full pl-9 pr-9 py-2 bg-neutral-100 border border-neutral-300 rounded-lg text-[16px] sm:text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {searching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </>
          ) : (
            'Search'
          )}
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="flex-1 mt-3 overflow-y-auto">
          <div className="space-y-2">
            {searchResults.map((result) => (
              <button
                key={result.platformId}
                onClick={() => handleSelect(result)}
                className="w-full flex items-center gap-3 p-2 bg-neutral-50 hover:bg-neutral-100 rounded-lg transition-colors text-left"
              >
                <img
                  src={result.profileImage}
                  alt={result.displayName}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-neutral-900 truncate">{result.displayName}</p>
                  <p className="text-xs text-neutral-700 truncate">
                    {formatNumber(result.subscribers || result.followers)} {result.platform === 'twitch' || result.platform === 'tiktok' || result.platform === 'bluesky' || result.platform === 'mastodon' || result.platform === 'rumble' ? 'followers' : result.platform === 'music' ? 'listeners' : 'subs'}
                  </p>
                </div>
                <div className={`p-1 rounded ${platformConfig[result.platform]?.bg}`}>
                  {(() => {
                    const PlatformIcon = platformConfig[result.platform]?.icon;
                    return PlatformIcon ? <PlatformIcon className={`w-4 h-4 ${platformConfig[result.platform]?.color}`} /> : null;
                  })()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({});
  const btnRef = useRef(null);

  const calcStyle = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tipWidth = 224;
    const left = (rect.left + tipWidth > window.innerWidth - 8)
      ? Math.max(8, window.innerWidth - tipWidth - 8)
      : rect.left;
    setStyle({ top: rect.bottom + 6, left });
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />}
      <button
        ref={btnRef}
        type="button"
        className="focus:outline-none -m-1 p-1 flex-shrink-0"
        onMouseEnter={() => { calcStyle(); setOpen(true); }}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); calcStyle(); setOpen(o => !o); }}
      >
        <Info className="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-700 transition-colors" />
      </button>
      {open && createPortal(
        <div
          className="fixed w-56 px-3 py-2 bg-neutral-100 border border-neutral-300 rounded-lg text-xs text-neutral-700 z-[999] whitespace-normal shadow-xl pointer-events-none"
          style={style}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

function ComparisonRow({ label, icon: Icon, values, highlight, tooltip }) {
  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50 transition-colors">
      <td className="px-6 py-4 text-neutral-700 font-medium">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-neutral-700" />}
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
      </td>
      {values.map((value, index) => {
        const isWinner = highlight === index;
        return (
          <td
            key={index}
            className={`relative px-6 py-4 text-center font-semibold tabular-nums transition-all ${
              isWinner
                ? 'text-emerald-300 bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 ring-1 ring-inset ring-emerald-500/30'
                : 'text-neutral-700'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {isWinner && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]" title="Leading">
                  ▲
                </span>
              )}
              {value}
            </span>
          </td>
        );
      })}
    </tr>
  );
}

function MobileComparisonTable({ creators, growthData, getGrowthColor, formatEarnings }) {
  const gridStyle = { gridTemplateColumns: `minmax(68px, 0.85fr) repeat(${creators.length}, 1fr)` };

  const winnerOf = (nums) => {
    const valid = nums.filter(n => n != null && !isNaN(n) && n > 0);
    if (valid.length < 2) return null;
    const max = Math.max(...valid);
    const idx = nums.findIndex(n => n === max);
    return nums.filter(n => n === max).length === 1 ? idx : null;
  };

  const rows = [
    {
      label: 'Followers',
      tooltip: 'YouTube and Kick track subscribers. Twitch, TikTok, and Bluesky track followers. Kick shows paid subscribers only, not total followers.',
      nums: creators.map(c => c.subscribers || c.followers || 0),
      display: creators.map(c => [formatNumber(c.subscribers || c.followers || 0), null]),
    },
    {
      label: 'Views / Hrs',
      tooltip: 'Twitch and Kick show monthly watch hours. For TikTok, this shows total likes. Bluesky has no views metric. Music shows total plays.',
      nums: creators.map(c => {
        if (c.platform === 'bluesky') return null;
        if (c.platform === 'twitch' || c.platform === 'kick') return null; // different unit, skip winner calc
        return c.totalViews || 0;
      }),
      display: creators.map(c => {
        if (c.platform === 'bluesky') return ['—', null];
        if (c.platform === 'twitch' || c.platform === 'kick') {
          const hrs = growthData[c.platformId]?.hoursWatched;
          return [hrs ? `${formatNumber(hrs)} hrs` : '—', null];
        }
        return [formatNumber(c.totalViews || 0), null];
      }),
    },
    {
      label: 'Videos',
      tooltip: 'For Twitch, Kick, and Music, video counts are not tracked. For Bluesky, this shows total posts.',
      nums: creators.map(c => (c.platform !== 'twitch' && c.platform !== 'kick' && c.platform !== 'music') ? (c.totalPosts || 0) : null),
      display: creators.map(c => [(c.platform !== 'twitch' && c.platform !== 'kick' && c.platform !== 'music') ? formatNumber(c.totalPosts || 0) : '—', null]),
    },
    {
      label: 'Avg/Video',
      tooltip: 'Not available for Twitch, Kick, Bluesky, Mastodon, or Rumble. For TikTok, calculated as total likes divided by videos.',
      nums: creators.map(c => (c.platform !== 'twitch' && c.platform !== 'kick' && c.platform !== 'bluesky' && c.platform !== 'mastodon' && c.platform !== 'rumble' && c.platform !== 'substack' && c.totalPosts > 0) ? Math.round(c.totalViews / c.totalPosts) : null),
      display: creators.map(c => [(c.platform !== 'twitch' && c.platform !== 'kick' && c.platform !== 'bluesky' && c.platform !== 'mastodon' && c.platform !== 'rumble' && c.platform !== 'substack' && c.totalPosts > 0) ? formatNumber(Math.round(c.totalViews / c.totalPosts)) : '—', null]),
    },
    {
      label: '7-Day',
      tooltip: 'YouTube and Kick track subscriber growth. Twitch, TikTok, and Bluesky track follower growth.',
      isGrowth: true,
      nums: creators.map(c => growthData[c.platformId]?.growth7Day || 0),
      display: creators.map(c => {
        const data = growthData[c.platformId];
        const pct = data?.growth7Day;
        const diff = data?.diff7Day;
        if (!pct || isNaN(pct)) return ['—', null];
        const pctStr = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
        if (diff && diff !== 0) {
          return [`${diff > 0 ? '+' : ''}${formatNumber(Math.abs(diff))}`, pctStr];
        }
        return [pctStr, null];
      }),
      colors: creators.map(c => getGrowthColor(growthData[c.platformId]?.growth7Day)),
    },
    {
      label: '30-Day',
      tooltip: 'YouTube and Kick track subscriber growth. Twitch, TikTok, and Bluesky track follower growth.',
      isGrowth: true,
      nums: creators.map(c => growthData[c.platformId]?.growth30Day || 0),
      display: creators.map(c => {
        const data = growthData[c.platformId];
        const pct = data?.growth30Day;
        const diff = data?.diff30Day;
        if (!pct || isNaN(pct)) return ['—', null];
        const pctStr = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
        if (diff && diff !== 0) {
          return [`${diff > 0 ? '+' : ''}${formatNumber(Math.abs(diff))}`, pctStr];
        }
        return [pctStr, null];
      }),
      colors: creators.map(c => getGrowthColor(growthData[c.platformId]?.growth30Day)),
    },
  ];

  if (creators.some(c => c.platform === 'youtube')) {
    rows.push({
      label: 'Mo. Est.',
      tooltip: 'YouTube only. Estimated from 30-day view growth at $2-$7 CPM. Actual earnings vary.',
      isEarnings: true,
      nums: creators.map(c => growthData[c.platformId]?.monthlyViews || 0),
      display: creators.map(c => [c.platform === 'youtube' ? formatEarnings(growthData[c.platformId]?.monthlyViews || 0) : '—', null]),
      colors: creators.map(() => 'text-neutral-900'),
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      {/* Creator header row */}
      <div className="grid bg-neutral-50 border-b border-neutral-200" style={gridStyle}>
        <div className="px-3 py-2 text-xs text-neutral-700 flex items-end pb-3">Metric</div>
        {creators.map(c => {
          const config = platformConfig[c.platform] || platformConfig.youtube;
          const PlatformIcon = config.icon;
          return (
            <div key={c.platformId} className="px-2 py-2 flex flex-col items-center gap-1.5 border-l border-neutral-200">
              <img src={c.profileImage} alt="" loading="lazy" className="w-10 h-10 rounded-xl object-cover" />
              <p className="text-[11px] font-semibold text-neutral-900 text-center leading-tight truncate w-full px-1">{c.displayName}</p>
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${config.bg} ${config.color}`}>
                <PlatformIcon className="w-2.5 h-2.5" />
                {c.platform}
              </span>
            </div>
          );
        })}
      </div>

      {/* Metric rows */}
      {rows.map((row, i) => {
        const winnerIdx = !row.isGrowth && !row.isEarnings ? winnerOf(row.nums.map(n => n ?? 0)) : null;
        return (
          <div
            key={row.label}
            className={`grid border-b border-neutral-200 last:border-0 ${i % 2 !== 0 ? 'bg-neutral-100/20' : ''}`}
            style={gridStyle}
          >
            <div className="px-3 py-3 text-xs font-medium text-neutral-700 flex items-center gap-1">
              <span>{row.label}</span>
              {row.tooltip && <InfoTooltip text={row.tooltip} />}
            </div>
            {creators.map((c, idx) => {
              const isWinner = winnerIdx === idx;
              const [primary, secondary] = row.display[idx];
              const color = (row.isGrowth || row.isEarnings) ? row.colors[idx] : (isWinner ? 'text-emerald-600' : 'text-neutral-900');
              return (
                <div
                  key={c.platformId}
                  className={`px-2 py-3 flex flex-col items-center justify-center border-l border-neutral-200 ${isWinner ? 'bg-emerald-50' : ''}`}
                >
                  <span className={`text-xs font-bold text-center leading-tight ${color}`}>{primary}</span>
                  {secondary && (
                    <span className={`text-[10px] text-center leading-tight mt-0.5 opacity-70 ${color}`}>{secondary}</span>
                  )}
                  {isWinner && <span className="text-[10px] text-emerald-600 mt-0.5">✓</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonRadarChart({ creators, growthData, loadingGrowth }) {
  const CREATOR_COLORS = ['#818cf8', '#34d399', '#f59e0b'];

  // When two creators share a display name (e.g. same person on YouTube + Bluesky),
  // append the platform so chart keys and legend labels stay unique.
  const nameCounts = {};
  creators.forEach(c => { nameCounts[c.displayName] = (nameCounts[c.displayName] || 0) + 1; });
  const creatorLabel = (c) =>
    nameCounts[c.displayName] > 1
      ? `${c.displayName} (${c.platform.charAt(0).toUpperCase() + c.platform.slice(1)})`
      : c.displayName;

  const metrics = [
    { label: 'Followers',    getValue: (c) => c.subscribers || c.followers || 0 },
    { label: 'Views',        getValue: (c) => (c.platform === 'bluesky') ? 0 : (c.totalViews || 0) },
    { label: 'Avg/Video',    getValue: (c) => (c.platform !== 'twitch' && c.platform !== 'bluesky' && c.platform !== 'mastodon' && c.platform !== 'rumble' && c.platform !== 'substack' && c.platform !== 'music' && c.totalPosts > 0) ? c.totalViews / c.totalPosts : 0 },
    { label: '7-Day Growth', getValue: (c) => Math.max(0, growthData[c.platformId]?.growth7Day || 0) },
    { label: '30-Day Growth',getValue: (c) => Math.max(0, growthData[c.platformId]?.growth30Day || 0) },
  ];

  // Skip chart if any creator has all-zero values (new creator or no data) — lopsided radar is misleading
  const anyCreatorHasNoData = !loadingGrowth && creators.some(c => metrics.every(m => m.getValue(c) === 0));
  if (anyCreatorHasNoData) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 flex items-center justify-center">
        <p className="text-neutral-400 text-sm">Not enough data yet to show a comparison chart. Check back once the creators have a few days of tracked history.</p>
      </div>
    );
  }

  const radarData = metrics.map(({ label, getValue }) => {
    const values = creators.map(getValue);
    const max = Math.max(...values, 0.001);
    const entry = { metric: label };
    creators.forEach((c, i) => {
      entry[creatorLabel(c)] = Math.round((values[i] / max) * 100);
    });
    return entry;
  });

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-neutral-900">Performance Overview</h3>
        <span className="text-xs text-neutral-700">100 = top among compared</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {creators.map((c, i) => (
            <Radar
              key={c.platformId}
              name={creatorLabel(c)}
              dataKey={creatorLabel(c)}
              stroke={CREATOR_COLORS[i % CREATOR_COLORS.length]}
              fill={CREATOR_COLORS[i % CREATOR_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          ))}
          <Legend
            formatter={(value) => <span style={{ color: '#d1d5db', fontSize: '12px' }}>{value}</span>}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '8px 12px' }}
            formatter={(value, name) => [`${value}/100`, name]}
            labelStyle={{ color: '#9ca3af', fontSize: '11px', marginBottom: '4px' }}
            itemStyle={{ color: '#d1d5db', fontSize: '12px' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function getWinner(values) {
  const max = Math.max(...values.filter(v => v != null && !isNaN(v)));
  const winnerIndex = values.findIndex(v => v === max);
  // Only highlight if there's a clear winner (not a tie)
  const winners = values.filter(v => v === max);
  return winners.length === 1 ? winnerIndex : null;
}

