import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, Users, Eye, Video, TrendingUp, TrendingDown, Minus, Info, Bookmark, Check, Loader2, Crown, Radio, ChevronLeft, ChevronRight } from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import SubstackIcon from '../components/SubstackIcon';
import MusicIcon from '../components/MusicIcon';
import FlipCard from '../components/FlipCard';
import { cardImageUrl } from '../lib/cardUrl';
import CreatorAvatar from '../components/CreatorAvatar';
import { searchChannels as searchYouTube, getChannelByUsername as getYouTubeChannel } from '../services/youtubeService';
import { getChannelByUsername as getTwitchChannel } from '../services/twitchService';
import { getChannelByUsername as getKickChannel } from '../services/kickService';
import { getBlueskyProfile } from '../services/blueskyService';
import { getArtistByMbid, getArtistByName } from '../services/musicService';
import { searchCreators, getCreatorByUsername, getCreatorStats, getHoursWatched, getViewershipStats } from '../services/creatorService';
import { saveCompare, findSavedCompare, deleteSavedCompare, getSavedCompares } from '../services/compareService';
import { getFollowedCreators } from '../services/followService';
import { supabase } from '../lib/supabase';
import SEO from '../components/SEO';
import { analytics } from '../lib/analytics';
import { formatNumber } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import logger from '../lib/logger';

// Compare cap. Was 10, but past 4 creators the metric bars get too short to
// read against each other, so 6 is the real usable ceiling for this layout.
const MAX_COMPARE = 6;
const MAX_SAVED_COMPARES = 50;

const POPULAR_MATCHUPS = [
  { aPlatform: 'twitch',  aUsername: 'kaicenat',        bPlatform: 'twitch',  bUsername: 'ishowspeed' },
  { aPlatform: 'twitch',  aUsername: 'xqc',             bPlatform: 'twitch',  bUsername: 'kaicenat' },
  { aPlatform: 'twitch',  aUsername: 'ninja',            bPlatform: 'twitch',  bUsername: 'shroud' },
  { aPlatform: 'twitch',  aUsername: 'pokimane',         bPlatform: 'twitch',  bUsername: 'hasanabi' },
  { aPlatform: 'youtube', aUsername: 'mrbeast',          bPlatform: 'twitch',  bUsername: 'ninja' },
  { aPlatform: 'tiktok',  aUsername: 'charlidamelio',    bPlatform: 'tiktok',  bUsername: 'addisonre' },
  // Third row, added to cover platforms the first two rows leaned entirely
  // on Twitch/YouTube/TikTok for. Kick, Music, and Substack picked deliberately:
  // real, comparably-sized, and (Bluesky/Mastodon's own top ranks skew hard
  // into politics and news orgs, see CLAUDE.md) safely apolitical.
  { aPlatform: 'kick',    aUsername: 'n3on',             bPlatform: 'kick',    bUsername: 'adinross' },
  { aPlatform: 'music',   aUsername: 'coldplay',         bPlatform: 'music',   bUsername: 'rihanna' },
  { aPlatform: 'substack',aUsername: 'lenny',            bPlatform: 'substack',bUsername: 'pragmaticengineer' },
];

// Platform identity is the icon tint alone, precision system
const platformConfig = {
  youtube: { icon: YouTubeIcon, color: '', label: 'YouTube' },
  tiktok: { icon: TikTokIcon, color: 'text-pink-500', label: 'TikTok' },
  twitch: { icon: TwitchIcon, color: '', label: 'Twitch' },
  kick: { icon: KickIcon, color: 'text-green-600', label: 'Kick' },
  bluesky: { icon: BlueskyIcon, color: 'text-sky-500', label: 'Bluesky' },
  music: { icon: MusicIcon, color: 'text-amber-500', label: 'Music' },
  mastodon: { icon: MastodonIcon, color: 'text-violet-500', label: 'Mastodon' },
  substack: { icon: SubstackIcon, color: 'text-orange-500', label: 'Substack' },
};

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

// Per-creator identity color, kept consistent across the hero cards, every
// metric bar, and the growth chart line for that creator. Flat solid hexes
// only, no gradients, no glow. The first slot reuses #4f46e5, the one
// official brand hex this site already has (index.html's theme-color / the
// home hero's gradient), so creator #1 always reads as "the site's color."
const ACCENT_COLORS = ['#4f46e5', '#0d9488', '#c2410c', '#be185d', '#0369a1', '#65a30d'];
function accentFor(i) { return ACCENT_COLORS[i % ACCENT_COLORS.length]; }

/** Followers/subscribers/listeners label per platform, used in cards, table, and search results.
 * Kick gets its own explicit word: its API has no free-follower endpoint at
 * all, the number we have is a paid-subscriber count, a real but much
 * smaller and categorically different figure than a free follow anywhere
 * else. Calling it plain "Subs" would read as the same thing YouTube's
 * free subscriber count means, it isn't. */
function metricLabel(platform) {
  if (platform === 'twitch' || platform === 'tiktok' || platform === 'bluesky' || platform === 'mastodon') return 'Followers';
  if (platform === 'music') return 'Listeners';
  if (platform === 'kick') return 'Paid Subs';
  return 'Subs';
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '-';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
}
function fmtMoney(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** Live-fetch a single creator's current profile by platform+username, same
 * per-platform hydration the URL-param loader already uses. Used to hydrate
 * search picks, popular matchups, and following quick-adds with one shared
 * path instead of three copies of this switch. */
async function hydrateCreator(platform, username) {
  try {
    if (platform === 'youtube') return await getYouTubeChannel(username);
    if (platform === 'twitch') return await getTwitchChannel(username);
    if (platform === 'kick') return await getKickChannel(username);
    if (platform === 'bluesky') return await getBlueskyProfile(username);
    if (platform === 'music') {
      const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const dbCreator = await getCreatorByUsername('music', username);
      if (!dbCreator?.platform_id) return null;
      return MBID_RE.test(dbCreator.platform_id)
        ? await getArtistByMbid(dbCreator.platform_id)
        : await getArtistByName(dbCreator.display_name || username);
    }
    // tiktok / mastodon / substack: DB-first hydration
    const dbCreator = await getCreatorByUsername(platform, username);
    if (!dbCreator) return null;
    const { data: stats } = await supabase
      .from('creator_stats')
      .select('followers, total_views, total_posts, subscribers')
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
      totalViews: platform === 'tiktok' ? (stats?.total_views || 0) : null,
      totalPosts: stats?.total_posts || 0,
    };
  } catch {
    return null;
  }
}

export default function Compare() {
  const [creators, setCreators] = useState([null, null]);
  const [loadingFromUrl, setLoadingFromUrl] = useState(false);
  const [growthData, setGrowthData] = useState({});
  const [loadingGrowth, setLoadingGrowth] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [existingSave, setExistingSave] = useState(null);
  const [removing, setRemoving] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chartMetric, setChartMetric] = useState('subs');
  const [cpm, setCpm] = useState(3.5);

  const [savedCompares, setSavedCompares] = useState([]);
  const [following, setFollowing] = useState([]);
  const [matchupStats, setMatchupStats] = useState({}); // "platform:username" -> hydrated creator

  const location = useLocation();
  const navigate = useNavigate();
  const skipNextUrlLoad = useRef(false);
  const { user, isAuthenticated } = useAuth();

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
    (async () => {
      const loaded = await Promise.all(
        creatorList.slice(0, MAX_COMPARE).map(async (entry) => {
          const [platform, username] = entry.split(':');
          if (!platform || !username) return null;
          return hydrateCreator(platform, username);
        })
      );
      const valid = loaded.filter(Boolean);
      setCreators(valid.length >= 2 ? valid : [valid[0] || null, null]);
      setLoadingFromUrl(false);
      if (valid.length >= 2) {
        analytics.compare(valid[0].platform, valid[0].username, valid[1].platform, valid[1].username);
      }
    })();
  }, [location.search]);

  const addToLineup = (creator) => {
    setCreators((prev) => {
      const already = prev.some(c => c && c.platform === creator.platform && c.username === creator.username);
      if (already) return prev;
      const nullIdx = prev.findIndex(c => !c);
      let next;
      if (nullIdx >= 0) {
        next = [...prev]; next[nullIdx] = creator;
      } else if (prev.length < MAX_COMPARE) {
        next = [...prev, creator];
      } else {
        return prev;
      }
      updateUrl(next);
      return next;
    });
    setQuery('');
    setResults([]);
  };

  const removeFromLineup = (index) => {
    setCreators((prev) => {
      const next = prev.length > 2 ? prev.filter((_, i) => i !== index) : prev.map((c, i) => (i === index ? null : c));
      updateUrl(next);
      return next;
    });
  };

  const clearAll = () => {
    setCreators([null, null]);
    navigate('/compare', { replace: true });
    setSaveDialogOpen(false);
  };

  // Unified cross-platform search, DB-only (search_creators_fuzzy via
  // searchCreators), same debounce/sequence-guard pattern as CommandPalette.
  // Deliberately not fanning out to live platform APIs on every keystroke:
  // this tool can only meaningfully compare creators we already track stats
  // for (charts need history), and hammering YouTube's quota-constrained live
  // search on every keystroke across 9 platforms would be a real cost for a
  // case that wouldn't produce a usable comparison anyway.
  const searchSeq = useRef(0);
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const mySeq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const rows = await searchCreators(query.trim());
        if (searchSeq.current !== mySeq) return;
        const top = rows.slice(0, 6);
        const withStats = await Promise.all(top.map(async (r) => {
          const { data: stats } = await supabase
            .from('creator_stats')
            .select('subscribers, followers, total_views, total_posts')
            .eq('creator_id', r.id)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return {
            platform: r.platform, platformId: r.platform_id, username: r.username,
            displayName: r.display_name || r.username, profileImage: r.profile_image,
            total: stats?.subscribers || stats?.followers || 0,
            // Kept alongside `total` (not folded into it) so the metric-by-metric
            // table can show a real Views/Likes/Plays/library-size number for a
            // search-added creator instead of a dash that only ever meant "we
            // didn't bother fetching this," not "this doesn't apply."
            totalViews: stats?.total_views ?? null,
            totalPosts: stats?.total_posts ?? null,
          };
        }));
        if (searchSeq.current === mySeq) setResults(withStats);
      } catch (err) {
        logger.warn('Compare search failed:', err);
        if (searchSeq.current === mySeq) setResults([]);
      } finally {
        if (searchSeq.current === mySeq) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Popular matchups' real live numbers, fetched once, independent of the
  // current lineup, so the tiles always show a true share bar and gap instead
  // of a guess. Some of these are DB-only lookups (fast) and some are live
  // platform API calls (real network latency), so each tile fills in as its
  // own pair resolves instead of the whole grid waiting on the slowest one.
  useEffect(() => {
    let cancelled = false;
    const ids = [];
    POPULAR_MATCHUPS.forEach(m => { ids.push([m.aPlatform, m.aUsername]); ids.push([m.bPlatform, m.bUsername]); });
    const unique = Array.from(new Map(ids.map(([p, u]) => [`${p}:${u}`, [p, u]])).values());
    unique.forEach(([p, u]) => {
      hydrateCreator(p, u).then((v) => {
        if (cancelled || !v) return;
        setMatchupStats(prev => ({ ...prev, [`${p}:${u}`]: v }));
      });
    });
    return () => { cancelled = true; };
  }, []);

  // "From your following" quick-adds
  useEffect(() => {
    if (!isAuthenticated || !user) { setFollowing([]); return; }
    (async () => {
      try {
        const rows = await getFollowedCreators(user.id);
        const withStats = await Promise.all(rows.slice(0, 20).map(async (row) => {
          const c = row.creators;
          if (!c) return null;
          const { data: stats } = await supabase
            .from('creator_stats')
            .select('subscribers, followers')
            .eq('creator_id', c.id)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return {
            platform: c.platform, platformId: c.platform_id, username: c.username,
            displayName: c.display_name || c.username, profileImage: c.profile_image,
            total: stats?.subscribers || stats?.followers || 0,
          };
        }));
        setFollowing(withStats.filter(Boolean));
      } catch (err) {
        logger.warn('Failed to load followed creators for Compare:', err);
        setFollowing([]);
      }
    })();
  }, [isAuthenticated, user]);

  // Saved comparisons list
  const loadSavedCompares = async () => {
    if (!isAuthenticated || !user) { setSavedCompares([]); return; }
    try {
      const rows = await getSavedCompares(user.id);
      setSavedCompares(rows.slice(0, MAX_SAVED_COMPARES));
    } catch (err) {
      logger.warn('Failed to load saved compares:', err);
      setSavedCompares([]);
    }
  };
  useEffect(() => { loadSavedCompares(); }, [isAuthenticated, user]);

  // Fetch growth data (deltas + the real daily series for the chart)
  useEffect(() => {
    const fetchGrowthData = async () => {
      const filled = creators.filter(Boolean);
      if (filled.length === 0) return;
      setLoadingGrowth(true);
      // Every creator's lookups run in parallel with each other, and within
      // a creator, the stream-specific queries run in parallel too, instead
      // of a sequential await chain. That chain (dbCreator lookup -> stats ->
      // hours watched -> viewership, one creator after another) was the
      // actual source of the table's visible 1-2s load-in: for a 2-creator
      // Twitch/Kick comparison that was 8 round trips in a row.
      const entries = await Promise.all(filled.map(async (creator) => {
        try {
          const dbCreator = await getCreatorByUsername(creator.platform, creator.username);
          if (!dbCreator) return null;

          const isStreamPlatform = creator.platform === 'twitch' || creator.platform === 'kick';
          const [stats, hw, viewership] = await Promise.all([
            getCreatorStats(dbCreator.id, 30),
            isStreamPlatform ? getHoursWatched(dbCreator.id) : Promise.resolve(null),
            // A real 30-day peak/average from actual stream_sessions, not
            // creator_stats' single-day snapshot. That single-day reading
            // looked free to reuse but can be flatly wrong (found 2026-09-05:
            // a real, currently-huge streamer's most recent tracked day
            // carried a ~1-minute monitor-artifact session with 0 viewers,
            // masking a real 270K-peak stream from earlier that month).
            isStreamPlatform ? getViewershipStats(dbCreator.id) : Promise.resolve(null),
          ]);
          if (!stats || stats.length < 2) return null;

          const latest = stats[stats.length - 1];
          const sevenDaysBack = stats[Math.max(0, stats.length - 1 - 7)];
          const thirtyDaysBack = stats[0];

          const calc7Day = sevenDaysBack?.subscribers ? ((latest.subscribers - sevenDaysBack.subscribers) / sevenDaysBack.subscribers * 100) : 0;
          const calc30Day = thirtyDaysBack?.subscribers ? ((latest.subscribers - thirtyDaysBack.subscribers) / thirtyDaysBack.subscribers * 100) : 0;

          let monthlyViews = 0;
          if (creator.platform === 'youtube' && latest?.total_views != null && thirtyDaysBack?.total_views != null) {
            monthlyViews = Math.max(0, latest.total_views - thirtyDaysBack.total_views);
          }

          return [creator.platformId, {
            growth7Day: calc7Day, growth30Day: calc30Day,
            diff7Day: sevenDaysBack?.subscribers != null ? latest.subscribers - sevenDaysBack.subscribers : 0,
            diff30Day: thirtyDaysBack?.subscribers != null ? latest.subscribers - thirtyDaysBack.subscribers : 0,
            monthlyViews,
            hoursWatched: hw?.hours_watched_month || 0,
            peakViewers: viewership?.peak ?? null,
            avgViewers: viewership?.avg ?? null,
            // Real daily series for the indexed growth chart below, same
            // rows already fetched above, just kept instead of discarded.
            series: stats.map(s => ({ date: s.recorded_at, subscribers: s.subscribers, views: s.total_views })),
          }];
        } catch (err) {
          logger.warn(`Failed to fetch growth data for ${creator.username}:`, err);
          return null;
        }
      }));
      setGrowthData(Object.fromEntries(entries.filter(Boolean)));
      setLoadingGrowth(false);
    };
    fetchGrowthData();
  }, [creators]);

  // Check if this comparison is already saved
  useEffect(() => {
    const checkExisting = async () => {
      const filled = creators.filter(Boolean);
      if (!isAuthenticated || !user || filled.length < 2) { setExistingSave(null); return; }
      try {
        const param = filled.map(c => `${c.platform}:${c.username}`).join(',');
        setExistingSave(await findSavedCompare(user.id, param));
      } catch { setExistingSave(null); }
    };
    checkExisting();
  }, [creators, user, isAuthenticated]);

  const buildDefaultName = (creatorsArr) => {
    const names = creatorsArr.filter(Boolean).map(c => c.displayName);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    const last = names.pop();
    return `${names.join(', ')} vs ${last}`;
  };

  const handleOpenSave = () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to save this comparison' } }));
      return;
    }
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
      loadSavedCompares();
      setTimeout(() => setSavedFlash(false), 3000);
    } catch (err) {
      logger.error('Failed to save compare:', err);
      toast.error('Could not save comparison');
    } finally { setSaving(false); }
  };

  const handleRemoveSave = async () => {
    if (!existingSave) return;
    setRemoving(true);
    try {
      await deleteSavedCompare(existingSave.id);
      setExistingSave(null);
      toast.success('Saved comparison removed');
      loadSavedCompares();
    } catch (err) {
      logger.error('Failed to remove saved compare:', err);
      toast.error('Could not remove saved comparison');
    } finally { setRemoving(false); }
  };

  const filledCreators = creators.filter(Boolean);
  const formatGrowth = (pct) => (!pct || isNaN(pct)) ? '-' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  const getGrowthIcon = (pct) => (!pct || isNaN(pct)) ? Minus : (pct > 0 ? TrendingUp : TrendingDown);
  const getGrowthColor = (pct) => (!pct || isNaN(pct)) ? 'text-neutral-700' : (pct > 0 ? 'text-emerald-600' : 'text-red-600');

  return (
    <>
      <SEO
        title="Compare Creators"
        description="Compare social media creators side-by-side. See subscriber counts, follower counts, views, and growth metrics."
      />
      <div className="min-h-screen bg-[#fafaf9]">
        {filledCreators.length < 2 && !loadingFromUrl && (
          <LandingStage
            creators={creators}
            query={query} setQuery={setQuery} results={results} searching={searching}
            onAdd={addToLineup} onRemove={removeFromLineup} onClear={clearAll}
            navigate={navigate}
          />
        )}

        {loadingFromUrl && <FaceOffBand loading />}

        {!loadingFromUrl && filledCreators.length >= 2 && (
          <FaceOffBand
            filledCreators={filledCreators}
            growthData={growthData}
            creators={creators}
            query={query} setQuery={setQuery} results={results} searching={searching}
            onAdd={addToLineup}
            existingSave={existingSave} savedFlash={savedFlash} removing={removing}
            handleOpenSave={handleOpenSave} handleRemoveSave={handleRemoveSave}
            saveDialogOpen={saveDialogOpen} saveName={saveName} setSaveName={setSaveName}
            handleSaveCompare={handleSaveCompare} setSaveDialogOpen={setSaveDialogOpen}
            onClearAll={clearAll} onRemove={removeFromLineup}
            formatGrowth={formatGrowth} getGrowthIcon={getGrowthIcon} getGrowthColor={getGrowthColor}
          />
        )}

        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
          {!loadingFromUrl && filledCreators.length >= 2 && (
            <ResultsView
              filledCreators={filledCreators}
              growthData={growthData}
              loadingGrowth={loadingGrowth}
              chartMetric={chartMetric}
              setChartMetric={setChartMetric}
              cpm={cpm}
              setCpm={setCpm}
              getGrowthColor={getGrowthColor} formatGrowth={formatGrowth}
            />
          )}

          {!loadingFromUrl && filledCreators.length < 2 && (
            <div className="mt-2">
              <MatchupGrid matchupStats={matchupStats} />
              {isAuthenticated && following.length > 0 && (
                <FollowingRow following={following} tray={filledCreators} onAdd={addToLineup} />
              )}
              {isAuthenticated && savedCompares.length > 0 && (
                <SavedComparesRow saved={savedCompares} navigate={navigate} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Search. One field, live cross-platform results, reused as the big hero   */
/* search on the picker and the compact "add another" search once a matchup */
/* is loaded.                                                                */
/* ------------------------------------------------------------------------ */
function CreatorSearchBox({ query, setQuery, results, searching, tray, onAdd, size = 'md', placeholder }) {
  const inTray = (r) => tray.some(c => c && c.platform === r.platform && c.username === r.username);
  const big = size === 'lg';
  return (
    <div className={`relative mx-auto ${big ? 'max-w-2xl mt-8' : 'max-w-md'}`}>
      <div className={`flex items-center gap-2.5 bg-white border border-neutral-200 rounded-xl focus-within:border-neutral-400 transition-colors ${big ? 'px-4 h-14 shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'px-3 h-10'}`}>
        {searching ? <Loader2 className={`${big ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-neutral-400 animate-spin flex-shrink-0`} /> : <Search className={`${big ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-neutral-400 flex-shrink-0`} />}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || (big ? 'Search any creator: MrBeast, xQc, Charli, Zach King…' : 'Add another creator…')}
          className={`flex-1 min-w-0 bg-transparent text-neutral-900 placeholder-neutral-400 focus:outline-none ${big ? 'text-[16px] sm:text-base' : 'text-sm'}`}
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-neutral-900 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden z-30">
          {results.length === 0 && !searching && (
            <p className="px-4 py-4 text-sm text-neutral-400 text-center">No matches yet.</p>
          )}
          {results.map((r) => {
            const config = platformConfig[r.platform] || platformConfig.youtube;
            const Icon = config.icon;
            const already = inTray(r);
            return (
              <button
                key={`${r.platform}:${r.username}`}
                onClick={() => !already && onAdd({ platform: r.platform, platformId: r.platformId, username: r.username, displayName: r.displayName, profileImage: r.profileImage, subscribers: r.total, followers: r.total, totalViews: r.totalViews, totalPosts: r.totalPosts })}
                disabled={already}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 disabled:opacity-50 transition-colors text-left border-b border-neutral-100 last:border-b-0"
              >
                <CreatorAvatar src={r.profileImage} name={r.displayName} size="sm" rounded="rounded-lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{r.displayName}</p>
                  <p className="text-xs text-neutral-400 truncate tabular-nums">{formatNumber(r.total)} {metricLabel(r.platform).toLowerCase()}</p>
                </div>
                <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                <span className="text-xs font-medium text-neutral-400 flex-shrink-0 w-14 text-right">{already ? 'Added' : '+ Add'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Card stages. Dark bands (same base as the home hero) where the creators' */
/* holographic cards go head to head. No glow: flat dark + dot grid only.   */
/* ------------------------------------------------------------------------ */
const DARK_BAND = 'relative isolate bg-[#0a0a0f] text-white';
// Lighter tints of ACCENT_COLORS for text and marks on the dark bands, where
// the base hexes are too dark to read. Same hue order, so creator #1 is still
// indigo, #2 teal and so on everywhere on the page.
const ACCENT_ON_DARK = ['#818cf8', '#2dd4bf', '#fb923c', '#f472b6', '#38bdf8', '#a3e635'];
const accentOnDark = (i) => ACCENT_ON_DARK[i % ACCENT_ON_DARK.length];
const cardOf = (c) => c && { platform: c.platform, username: c.username, name: c.displayName, avatar: c.profileImage };
const growthTone = (pct) => (!pct || isNaN(pct)) ? 'text-white/50' : (pct > 0 ? 'text-emerald-400' : 'text-red-400');

function VsChip({ big = false }) {
  return (
    <span className={`flex items-center justify-center rounded-full bg-white text-neutral-950 font-black tracking-wide flex-shrink-0 ${big ? 'w-12 h-12 sm:w-16 sm:h-16 text-sm sm:text-lg' : 'w-10 h-10 sm:w-12 sm:h-12 text-xs sm:text-sm'}`}>
      VS
    </span>
  );
}

function DotGrid() {
  return <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />;
}

const SLOT_CARD = 'w-[124px] h-[174px] sm:w-[200px] sm:h-[280px]';

/**
 * Landing: two face-down slots with a VS between them. Picking a creator
 * flips their card into the next slot; the second pick opens the face-off.
 * "Deal a random matchup" flips a popular pair in and then opens it.
 */
function LandingStage({ creators, query, setQuery, results, searching, onAdd, onRemove, onClear, navigate }) {
  const reduceMotion = useReducedMotion();
  const filled = creators.filter(Boolean);
  const [dealt, setDealt] = useState(null);
  const lastDeal = useRef(-1);
  const dealTimer = useRef(null);
  useEffect(() => () => clearTimeout(dealTimer.current), []);

  const deal = () => {
    if (dealt) return;
    let i = Math.floor(Math.random() * POPULAR_MATCHUPS.length);
    if (i === lastDeal.current) i = (i + 1) % POPULAR_MATCHUPS.length;
    lastDeal.current = i;
    const m = POPULAR_MATCHUPS[i];
    setDealt([{ platform: m.aPlatform, username: m.aUsername }, { platform: m.bPlatform, username: m.bUsername }]);
    dealTimer.current = setTimeout(
      () => navigate(`/compare?creators=${m.aPlatform}:${m.aUsername},${m.bPlatform}:${m.bUsername}`),
      reduceMotion ? 400 : 2000,
    );
  };

  const slot = (i) => {
    const c = dealt ? dealt[i] : cardOf(filled[i]);
    const picked = !dealt && filled[i];
    return (
      <div className="flex flex-col items-center min-w-0">
        <div className={`transition-opacity duration-300 ${c ? 'opacity-100' : 'opacity-50'}`}>
          <FlipCard creator={c || null} delay={dealt && i === 1 ? 300 : 0} className={SLOT_CARD} />
        </div>
        <div className="mt-4 h-12 flex flex-col items-center justify-start text-center max-w-[180px]">
          {picked ? (
            <>
              <p className="text-sm sm:text-base font-bold truncate max-w-full">{filled[i].displayName}</p>
              <button onClick={() => onRemove(i)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors">
                <X className="w-3 h-3" /> Swap out
              </button>
            </>
          ) : (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{i === 0 ? 'Creator 1' : 'Challenger'}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className={DARK_BAND}>
      <DotGrid />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-12 sm:pb-16">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">{filled.length === 0 ? 'Step 1 of 2' : 'Step 2 of 2'}</p>
          <h1 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-balance">
            {filled.length === 0 ? "Who's actually bigger?" : <>Who&apos;s up against {filled[0].displayName}?</>}
          </h1>
          <p className="mt-3 text-base sm:text-lg text-white/60 max-w-md mx-auto text-pretty">
            {filled.length === 0 ? 'Pick two creators and put their cards head to head.' : 'Pick a challenger and flip their card.'}
          </p>
        </div>

        <div className="mt-8 sm:mt-10 flex items-start justify-center gap-4 sm:gap-10">
          {slot(0)}
          <div className="self-center -mt-12"><VsChip big /></div>
          {slot(1)}
        </div>

        <div className="relative z-30">
          <CreatorSearchBox
            query={query} setQuery={setQuery} results={results} searching={searching}
            tray={filled} onAdd={onAdd} size="lg"
            placeholder={filled.length === 1 ? `Search a challenger for ${filled[0].displayName}…` : undefined}
          />
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          {filled.length === 0 ? (
            <button
              type="button"
              onClick={deal}
              disabled={!!dealt}
              className="hero-pull-btn inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-neutral-900 disabled:opacity-80"
            >
              <span aria-hidden="true">✦</span> {dealt ? 'Dealing…' : 'Deal a random matchup'}
            </button>
          ) : (
            <button type="button" onClick={onClear} className="text-sm font-medium text-white/60 hover:text-white transition-colors">
              Start over
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Results header: the cards on plinths, the leader crowned in gold, the
 * verdict above and (for a pair) the score and round-by-round below.
 * `loading` renders the same band with face-down cards while the lineup
 * from the URL loads, so the page doesn't jump when it arrives.
 */
function FaceOffBand(props) {
  const reduceMotion = useReducedMotion();

  if (props.loading) {
    return (
      <section className={DARK_BAND}>
        <DotGrid />
        <div className="relative max-w-5xl mx-auto px-4 pt-16 sm:pt-20 pb-14 sm:pb-20">
          <div className="flex items-center justify-center gap-5 sm:gap-12">
            <FlipCard creator={null} className={SLOT_CARD} />
            <VsChip big />
            <FlipCard creator={null} className={SLOT_CARD} />
          </div>
          <p className="mt-8 text-center text-sm text-white/50">Shuffling the deck…</p>
        </div>
      </section>
    );
  }

  const {
    filledCreators, growthData, creators, query, setQuery, results, searching, onAdd,
    existingSave, savedFlash, removing, handleOpenSave, handleRemoveSave,
    saveDialogOpen, saveName, setSaveName, handleSaveCompare, setSaveDialogOpen, onClearAll, formatGrowth,
  } = props;

  const metrics = buildMetrics(filledCreators, growthData);
  const rounds = metrics.filter((m) => m.hasLeader);
  const wins = filledCreators.map((_, i) => rounds.reduce((n, m) => n + (m.leaderIndex === i ? 1 : 0), 0));
  const total = rounds.length;
  const maxWins = Math.max(...wins);
  const topIdx = wins.indexOf(maxWins);
  // Crown only an outright leader: topIdx alone can't tell a real lead from
  // a tie at the top (including 0-0 with nothing comparable).
  const hasWinner = maxWins > 0 && wins.filter((w) => w === maxWins).length === 1;
  const winner = filledCreators[topIdx];
  const isPair = filledCreators.length === 2;
  // Two creators can share a display name (a brand's YouTube and TikTok), so
  // name the platform only when that collision is real.
  const winnerNameCollides = hasWinner && filledCreators.filter((c) => c.displayName === winner.displayName).length > 1;
  const winnerLabel = winnerNameCollides ? `${winner.displayName} (${platformConfig[winner.platform]?.label})` : winner?.displayName;

  const verdictTail = (() => {
    if (!isPair || !hasWinner) return '.';
    const other = filledCreators[1 - topIdx];
    // Kick's number is paid subs and everyone else's is free follows, so a
    // size ratio between them would compare two different things.
    if ((winner.platform === 'kick') !== (other.platform === 'kick')) return '.';
    const wTotal = winner.subscribers || winner.followers || 0;
    const oTotal = other.subscribers || other.followers || 0;
    if (!wTotal || !oTotal) return '.';
    return `, with ${formatNumber(Math.abs(wTotal - oTotal))} more ${metricLabel(winner.platform).toLowerCase()} at ${(wTotal / oTotal).toFixed(1)}× the size.`;
  })();

  const cardSize = isPair
    ? 'w-[124px] h-[174px] sm:w-[220px] sm:h-[308px]'
    : filledCreators.length === 3
      ? 'w-[96px] h-[134px] sm:w-[180px] sm:h-[252px]'
      : 'w-[88px] h-[123px] sm:w-[150px] sm:h-[210px]';

  const fighter = (c, i) => {
    const g = growthData[c.platformId];
    const isWinner = hasWinner && i === topIdx;
    return (
      <Link key={`${c.platform}:${c.username}`} to={`/${c.platform}/${c.username}`} className="group flex flex-col items-center min-w-0">
        <div className="relative">
          {isWinner && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-950 whitespace-nowrap">
              <Crown className="w-3 h-3" /> Leader
            </span>
          )}
          <FlipCard creator={cardOf(c)} delay={i * 220} className={cardSize} />
        </div>
        <div className={`mt-4 w-full rounded-t-xl border-t border-x px-2 pt-3 pb-5 text-center ${isWinner ? 'border-amber-400/50 bg-amber-400/[0.08]' : 'border-white/10 bg-white/[0.04]'}`}>
          <p className="text-sm sm:text-base font-bold truncate">{c.displayName}</p>
          <span className="mx-auto mt-1.5 block h-[3px] w-8 rounded-full" style={{ background: accentOnDark(i) }} />
          <p className="mt-2.5 text-2xl sm:text-4xl font-extrabold tabular-nums tracking-tight">{formatNumber(c.subscribers || c.followers || 0)}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{metricLabel(c.platform)}</p>
          {g && g.growth30Day ? (
            <p className={`mt-1.5 text-xs font-semibold tabular-nums ${growthTone(g.growth30Day)}`}>{formatGrowth(g.growth30Day)} <span className="font-normal text-white/40">30d</span></p>
          ) : <p className="mt-1.5 h-4" />}
          {!isPair && total > 0 && (
            <p className={`mt-2 text-[11px] font-bold uppercase tracking-[0.12em] ${isWinner ? 'text-amber-300' : 'text-white/50'}`}>{wins[i]} of {total} rounds</p>
          )}
        </div>
      </Link>
    );
  };

  return (
    <section className={DARK_BAND}>
      <DotGrid />
      <div className="relative max-w-5xl mx-auto px-4 pt-6 sm:pt-8 pb-12 sm:pb-16">
        {/* Add / save / clear */}
        <div className="relative z-30 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <CreatorSearchBox query={query} setQuery={setQuery} results={results} searching={searching} tray={creators} onAdd={onAdd} size="sm" />
          </div>
          <div className="flex items-center justify-center gap-2 flex-shrink-0">
            {savedFlash ? (
              <span className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-300 font-medium bg-emerald-400/10 border border-emerald-400/30 rounded-lg"><Check className="w-3.5 h-3.5" />Saved!</span>
            ) : existingSave ? (
              <button onClick={handleRemoveSave} disabled={removing} className="flex items-center gap-1.5 px-3 py-2 text-sm text-white/80 hover:text-red-300 border border-white/15 hover:border-red-400/40 rounded-lg transition-colors font-medium">
                <Bookmark className="w-3.5 h-3.5 fill-current" />{removing ? 'Removing...' : 'Saved'}
              </button>
            ) : (
              <button onClick={handleOpenSave} className="flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-900 bg-white hover:bg-neutral-100 rounded-lg transition-colors font-semibold">
                <Bookmark className="w-3.5 h-3.5" />Save
              </button>
            )}
            <button onClick={onClearAll} className="flex items-center gap-1.5 px-3 py-2 text-sm text-white/60 hover:text-white rounded-lg transition-colors">
              <X className="w-3.5 h-3.5" />New matchup
            </button>
          </div>
        </div>
        {saveDialogOpen && (
          <div className="relative z-20 flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2 mt-3 max-w-md mx-auto">
            <input
              type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCompare(); if (e.key === 'Escape') setSaveDialogOpen(false); }}
              placeholder="Name this comparison..." maxLength={80} autoFocus
              className="bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none flex-1 min-w-0"
            />
            <button onClick={handleSaveCompare} disabled={!saveName.trim()} className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors shrink-0">Save</button>
            <button onClick={() => setSaveDialogOpen(false)} className="p-1 text-neutral-500 hover:text-neutral-700 shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Verdict */}
        <h1 className="mt-10 sm:mt-12 text-xl sm:text-3xl font-extrabold tracking-tight text-center leading-snug text-balance max-w-3xl mx-auto">
          {hasWinner ? (
            <>
              <Crown className="w-5 h-5 sm:w-7 sm:h-7 inline-block -mt-1 mr-1.5 text-amber-400" />
              <span className="text-amber-300">{winnerLabel}</span> leads on {wins[topIdx]} of {total} round{total === 1 ? '' : 's'}{verdictTail}
            </>
          ) : total > 0 ? (
            'Dead even. Nobody wins more rounds than anyone else.'
          ) : (
            'Not enough comparable numbers between these to call a leader.'
          )}
        </h1>

        {/* Cards */}
        {isPair ? (
          <div className="mt-10 grid grid-cols-[1fr,auto,1fr] items-end gap-3 sm:gap-8 max-w-3xl mx-auto">
            {fighter(filledCreators[0], 0)}
            <div className="self-center flex flex-col items-center pb-16 sm:pb-24">
              <VsChip big />
              {total > 0 && (
                <>
                  <p className="mt-4 text-3xl sm:text-5xl font-black tabular-nums leading-none">
                    <span style={{ color: accentOnDark(0) }}>{wins[0]}</span>
                    <span className="text-white/30 mx-1 sm:mx-2">–</span>
                    <span style={{ color: accentOnDark(1) }}>{wins[1]}</span>
                  </p>
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Rounds</p>
                </>
              )}
            </div>
            {fighter(filledCreators[1], 1)}
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap items-end justify-center gap-3 sm:gap-6">
            {filledCreators.map((c, i) => (
              <div key={`${c.platform}:${c.username}`} className="w-[calc(33%-0.75rem)] sm:w-auto sm:min-w-[170px]">{fighter(c, i)}</div>
            ))}
          </div>
        )}

        {/* Round by round (pairs) */}
        {isPair && total > 0 && (
          <div className="mt-10 max-w-xl mx-auto">
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Round by round</p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/[0.06] overflow-hidden">
              {rounds.map((m, r) => (
                <motion.div
                  key={m.label}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 + r * 0.18, duration: 0.35, ease: 'easeOut' }}
                  className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3"
                >
                  <span className={`flex items-center justify-end gap-1 text-sm sm:text-base tabular-nums ${m.leaderIndex === 0 ? 'font-bold text-white' : 'text-white/40'}`}>
                    {m.leaderIndex === 0 && <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: accentOnDark(0) }} />}
                    {m.bars[0]?.value}
                  </span>
                  <span className="w-24 sm:w-52 text-center text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60 truncate">{m.label}</span>
                  <span className={`flex items-center gap-1 text-sm sm:text-base tabular-nums ${m.leaderIndex === 1 ? 'font-bold text-white' : 'text-white/40'}`}>
                    {m.bars[1]?.value}
                    {m.leaderIndex === 1 && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: accentOnDark(1) }} />}
                  </span>
                </motion.div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-white/40">Size and engagement decide the rounds. Growth, viewers and more are below.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* Popular matchups: two cards fanned against each other over a small dark
   stage. The fanned cards are rotated, so they are the markless render. */
function MatchupGrid({ matchupStats }) {
  return (
    <div className="mb-10">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">Popular matchups</h2>
        <p className="mt-1.5 text-sm text-neutral-500">Pick one and both cards go head to head.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {POPULAR_MATCHUPS.map((m) => {
          const a = matchupStats[`${m.aPlatform}:${m.aUsername}`];
          const b = matchupStats[`${m.bPlatform}:${m.bUsername}`];
          const url = `${m.aPlatform}:${m.aUsername},${m.bPlatform}:${m.bUsername}`;
          const ready = a && b;
          const aTotal = a ? (a.subscribers || a.followers || 0) : 0;
          const bTotal = b ? (b.subscribers || b.followers || 0) : 0;
          const shareA = (aTotal / ((aTotal + bTotal) || 1)) * 100;
          const lead = aTotal >= bTotal ? a : b;
          return (
            <Link key={url} to={`/compare?creators=${url}`} className={`group block ${CARD} overflow-hidden hover:border-neutral-300 transition-colors`}>
              <div className="relative h-[150px] bg-[#0a0a0f] overflow-hidden">
                <DotGrid />
                <img
                  src={cardImageUrl(m.aPlatform, m.aUsername, { mark: false })}
                  alt="" width="250" height="350" loading="lazy" draggable="false"
                  onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                  className="absolute left-1/2 top-4 w-[86px] h-auto -translate-x-[96%] -rotate-[8deg] rounded-[6.4%/4.571%] shadow-[0_16px_30px_-10px_rgba(0,0,0,0.8)] select-none opacity-0 transition-opacity duration-500"
                />
                <img
                  src={cardImageUrl(m.bPlatform, m.bUsername, { mark: false })}
                  alt="" width="250" height="350" loading="lazy" draggable="false"
                  onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                  className="absolute left-1/2 top-4 w-[86px] h-auto -translate-x-[4%] rotate-[8deg] rounded-[6.4%/4.571%] shadow-[0_16px_30px_-10px_rgba(0,0,0,0.8)] select-none opacity-0 transition-opacity duration-500"
                />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><VsChip /></span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {ready ? <p className="text-base font-extrabold text-neutral-900 tabular-nums">{formatNumber(aTotal)}</p> : <div className="h-6 w-14 rounded bg-neutral-100 animate-pulse" />}
                    <p className="text-xs font-medium text-neutral-500 truncate">{a?.displayName || m.aUsername}</p>
                  </div>
                  <div className="min-w-0 text-right">
                    {ready ? <p className="text-base font-extrabold text-neutral-900 tabular-nums">{formatNumber(bTotal)}</p> : <div className="h-6 w-14 ml-auto rounded bg-neutral-100 animate-pulse" />}
                    <p className="text-xs font-medium text-neutral-500 truncate">{b?.displayName || m.bUsername}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 h-1.5 mt-3 rounded-full overflow-hidden bg-neutral-100">
                  {ready && <div className="h-full animate-bar-grow" style={{ width: `${shareA}%`, background: accentFor(0) }} />}
                  {ready && <div className="h-full flex-1" style={{ background: accentFor(1) }} />}
                </div>
                <p className="text-xs text-neutral-500 mt-2 h-4">
                  {ready && <><span className="font-semibold text-neutral-700">{lead.displayName}</span> leads by {formatNumber(Math.abs(aTotal - bTotal))}</>}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FollowingRow({ following, tray, onAdd }) {
  const inTray = (f) => tray.some(c => c && c.platform === f.platform && c.username === f.username);
  return (
    <div className="mb-10">
      <div className="flex items-baseline gap-2 mb-3">
        <p className={MICRO}>From your following</p>
        <p className="text-xs text-neutral-400">{following.length} creators · tap to add</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {following.map((f) => {
          const already = inTray(f);
          return (
            <button
              key={`${f.platform}:${f.username}`}
              onClick={() => !already && onAdd({ platform: f.platform, platformId: f.platformId, username: f.username, displayName: f.displayName, profileImage: f.profileImage, subscribers: f.total, followers: f.total })}
              disabled={already}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${already ? 'bg-neutral-100 border-neutral-200' : 'bg-white border-neutral-200 hover:border-neutral-400'}`}
            >
              <CreatorAvatar src={f.profileImage} name={f.displayName} size="xs" rounded="rounded-full" />
              <span className="text-sm font-medium text-neutral-900">{f.displayName}</span>
              <span className="text-xs text-neutral-400 tabular-nums">{formatNumber(f.total)}</span>
              <Check className={`w-3.5 h-3.5 ${already ? 'text-emerald-600' : 'text-neutral-300'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SavedComparesRow({ saved, navigate }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2 mb-3">
        <p className={MICRO}>Your saved comparisons</p>
        <p className="text-xs text-neutral-400">{saved.length}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {saved.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/compare?creators=${s.creators_param}`)}
            className={`flex items-center gap-3 ${CARD} px-4 py-3 hover:border-neutral-300 transition-colors text-left`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{s.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">Saved {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
            <span className="text-sm text-neutral-400 font-medium flex-shrink-0">Open →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Results. Verdict, bar-by-bar metrics, indexed growth chart, revenue.     */
/* ------------------------------------------------------------------------ */
function ResultsView(props) {
  const {
    filledCreators, growthData, loadingGrowth, chartMetric, setChartMetric, cpm, setCpm,
    getGrowthColor, formatGrowth,
  } = props;

  const metrics = buildMetrics(filledCreators, growthData);
  const youtubeCreators = filledCreators.filter(c => c.platform === 'youtube' && growthData[c.platformId]?.monthlyViews > 0);

  return (
    <div>
      {/* Metric-by-metric bars. Replaces both the old radar chart and the
          winner-dotted table. Bar length is each creator's share of the
          row's largest value; growth rows use a centered zero axis. */}
      <div className={`${CARD} overflow-hidden mb-5`}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-100 flex-wrap">
          <h2 className="text-base font-medium text-neutral-900">Metric by metric</h2>
          <InfoTooltip text="Rows only show up when every creator here can be fairly compared on them. A dash means a creator is missing that specific reading (e.g. growth needs a few days of tracked data), not that the metric doesn't apply to them." />
          <div className="flex-1" />
          <div className="flex items-center gap-3 flex-wrap">
            {filledCreators.map((c, i) => (
              <span key={c.platformId || c.username} className="flex items-center gap-1.5 text-xs text-neutral-600">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: accentFor(i) }} />
                {c.displayName}
              </span>
            ))}
          </div>
          {loadingGrowth && <span className="flex items-center gap-1.5 text-xs text-neutral-400 w-full sm:w-auto"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading growth data...</span>}
        </div>
        <div className="divide-y divide-neutral-100">
          {metrics.map((m) => <MetricBarRow key={m.label} metric={m} loadingGrowth={loadingGrowth} />)}
        </div>
        <p className="px-5 py-3 text-xs text-neutral-400 leading-relaxed">Growth rows use a centered zero axis, bars extend right for gains, left for losses. Rows marked no-leader (library size, growth rate, concurrent viewers) never decide who's crowned, a small account can post a big percentage, a big library, or one busy stream day without being bigger overall. Only Subscribers/Followers and engagement volume do. Rows only appear when every creator here has a real number for them.</p>
      </div>

      {/* Growth, side by side. Real indexed % line chart */}
      <GrowthChart filledCreators={filledCreators} growthData={growthData} chartMetric={chartMetric} setChartMetric={setChartMetric} getGrowthColor={getGrowthColor} formatGrowth={formatGrowth} />

      {/* Revenue + full profiles */}
      <div className="flex flex-col lg:flex-row gap-4 mt-5">
        {youtubeCreators.length > 0 && (
          <div className={`flex-1 ${CARD} p-5 sm:p-6`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-base font-medium text-neutral-900">Estimated monthly revenue</h2>
              <span className="flex-1" />
              <span className="text-xs text-neutral-500">your CPM assumption</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 mt-4">
              {youtubeCreators.map((c) => {
                const idx = filledCreators.indexOf(c);
                const g = growthData[c.platformId];
                const rev = (g.monthlyViews / 1000) * cpm;
                return (
                  <div key={c.platformId} className="pl-3.5" style={{ borderLeft: `3px solid ${accentFor(idx)}` }}>
                    <p className="text-xs text-neutral-500">{c.displayName}</p>
                    <p className="text-2xl font-bold text-neutral-900 tabular-nums tracking-tight mt-1">{fmtMoney(rev)}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{formatNumber(g.monthlyViews)} views in 30d</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-neutral-100">
              <span className="text-sm font-semibold text-neutral-900 tabular-nums w-14">${cpm.toFixed(2)}</span>
              <input type="range" min="1" max="12" step="0.1" value={cpm} onChange={(e) => setCpm(parseFloat(e.target.value))} className="flex-1 accent-neutral-900" />
              <span className="text-xs text-neutral-400 flex-shrink-0">CPM · median $3.40</span>
            </div>
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">One assumption, applied to every creator here. Change the CPM and every number updates. Only YouTube has a revenue model; other platforms don't publish enough to estimate one.</p>
          </div>
        )}
        <div className={`lg:w-72 flex-shrink-0 ${CARD} p-5 sm:p-6`}>
          <h2 className="text-base font-medium text-neutral-900">Full profiles</h2>
          <div className="flex flex-col gap-2 mt-3.5">
            {filledCreators.map((c, i) => (
              <Link key={c.platformId || c.username} to={`/${c.platform}/${c.username}`} className="flex items-center gap-2.5 border border-neutral-200/80 rounded-lg px-3 py-2.5 hover:border-neutral-300 transition-colors">
                <CreatorAvatar src={c.profileImage} name={c.displayName} size="sm" rounded="rounded-lg" style={{ boxShadow: `0 0 0 2px ${accentFor(i)}` }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{c.displayName}</p>
                  <p className="text-xs text-neutral-400">{platformConfig[c.platform]?.label}</p>
                </div>
                <span className="text-sm text-neutral-300">→</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-3.5 leading-relaxed">Rank, milestones, and full daily readings live on each profile. This page stays scoped to the matchup.</p>
        </div>
      </div>
    </div>
  );
}

function MetricBarRow({ metric, loadingGrowth }) {
  // The amber tag text is a "why this doesn't decide the winner" explanation,
  // not something worth permanent real estate under every label. It moves
  // into a hover tooltip instead; the plain gray "higher is better" tag stays
  // inline since it's short and not the thing being explained away.
  const isNote = metric.tagFg === 'text-amber-600';
  return (
    <div className="grid gap-3 sm:gap-6 px-5 py-4 grid-cols-1 sm:grid-cols-[180px_1fr]">
      <div>
        <div className="flex items-center gap-1.5">
          {metric.icon && <metric.icon className="w-3.5 h-3.5 text-neutral-400" />}
          <p className="text-sm font-semibold text-neutral-900">{metric.label}</p>
          {isNote && <InfoTooltip text={metric.tag} />}
        </div>
        {!isNote && <p className={`text-xs mt-0.5 ${metric.tagFg}`}>{metric.tag}</p>}
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        {metric.bars.map((b, i) => {
          const pending = loadingGrowth && b.value === '-';
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 min-w-0 h-5 relative bg-neutral-100 rounded overflow-hidden">
                {pending ? (
                  <div className="absolute inset-0 animate-pulse bg-neutral-200" />
                ) : (
                  <>
                    <div className="absolute top-0 bottom-0 rounded animate-bar-grow" style={{ left: b.left, width: b.width, background: b.color }} />
                    {metric.signed && <div className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-neutral-300" />}
                  </>
                )}
              </div>
              <div className={`w-20 sm:w-24 text-right text-sm font-semibold tabular-nums flex-shrink-0 ${b.isLeader ? 'text-neutral-900' : 'text-neutral-500'}`}>
                {pending ? <span className="inline-block h-3.5 w-10 rounded bg-neutral-200 animate-pulse align-middle" /> : b.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen(o => !o)} className="text-neutral-300 hover:text-neutral-500 transition-colors">
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-2 w-64 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 leading-relaxed z-40 shadow-xl">{text}</span>
      )}
    </span>
  );
}

function GrowthChart({ filledCreators, growthData, chartMetric, setChartMetric, getGrowthColor, formatGrowth }) {
  // "Views" is only a real toggle when every creator here actually has view
  // data, not just one of them - a Twitch-vs-YouTube pairing showing a Views
  // line for only the YouTuber isn't a comparison, it's one line pretending
  // to be one.
  const hasViews = filledCreators.length > 0 && filledCreators.every(c => growthData[c.platformId]?.series?.some(s => s.views != null));
  const key = chartMetric === 'views' && hasViews ? 'views' : 'subscribers';

  // The "views" series is really different units per platform (YouTube's a
  // real view, TikTok's a like, Music's a play, see CLAUDE.md), so the button
  // has to say which one it actually is instead of a blanket "Views" that's
  // flatly wrong for TikTok/Music. Same composed-label approach as the
  // Subscribers/Followers row in the metric table below.
  const platforms = filledCreators.map(c => c.platform);
  const allKick = platforms.length > 0 && platforms.every(p => p === 'kick');
  const mixedKick = platforms.includes('kick') && !allKick;
  const followersLabel = allKick ? 'Paid subscribers' : mixedKick ? 'Followers / Paid subs' : 'Subscribers / Followers';
  const viewsLabel = [...new Set(platforms.map(p => ENGAGEMENT_UNIT[p]).filter(Boolean))].join(' / ') || 'Views';

  // Index each creator's series to % change from the first day it has data,
  // so a 109M and a 515M channel can share one axis.
  const seriesByCreator = filledCreators.map((c, i) => {
    const raw = (growthData[c.platformId]?.series || []).filter(s => s[key] != null);
    if (raw.length < 2) return null;
    const base = raw[0][key] || 1;
    return { creator: c, color: accentFor(i), points: raw.map(s => ({ date: s.date, pct: ((s[key] - base) / base) * 100 })) };
  }).filter(Boolean);

  // Same principle as the metric table below: a side-by-side chart needs
  // every creator represented, not just some of them. Hide the whole section
  // rather than show a chart with one creator's line missing.
  if (seriesByCreator.length < filledCreators.length) return null;

  // Merge into one array of {date, [displayName]: pct, ...} for Recharts
  const dateSet = Array.from(new Set(seriesByCreator.flatMap(s => s.points.map(p => p.date)))).sort();
  const chartData = dateSet.map(date => {
    const row = { date };
    seriesByCreator.forEach(s => {
      const pt = s.points.find(p => p.date === date);
      if (pt) row[s.creator.displayName] = pt.pct;
    });
    return row;
  });

  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-medium text-neutral-900">Growth, side by side</h2>
          <p className="text-xs text-neutral-500 mt-1">Indexed to each creator's own value at the start of the window, so different sizes share one axis.</p>
        </div>
        <div className="flex-1" />
        {hasViews ? (
          <div className="flex bg-neutral-100 border border-neutral-200 rounded-lg p-0.5 text-sm">
            {[['subscribers', followersLabel], ['views', viewsLabel]].map(([val, label]) => (
              <button key={val} onClick={() => setChartMetric(val)} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${key === val ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>{label}</button>
            ))}
          </div>
        ) : (
          // Only one metric is ever available here, but the chart still
          // needs to say which one, same as the toggle does when there's a
          // real choice, instead of leaving the reader to guess.
          <span className="px-3 py-1.5 text-sm font-medium text-neutral-500 bg-neutral-100 border border-neutral-200 rounded-lg">{followersLabel}</span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap mt-4">
        {seriesByCreator.map(s => {
          const last = s.points[s.points.length - 1]?.pct;
          return (
            <span key={s.creator.platformId} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              <span className="text-neutral-600">{s.creator.displayName}</span>
              <span className="font-semibold" style={{ color: s.color }}>{formatGrowth(last)}</span>
            </span>
          );
        })}
      </div>

      <div className="h-64 mt-4 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fill: '#a3a3a3' }} axisLine={{ stroke: '#f0f0eb' }} tickLine={false} minTickGap={40} />
            <YAxis tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#a3a3a3' }} axisLine={false} tickLine={false} width={44} />
            <ReferenceLine y={0} stroke="#e5e5e0" />
            <Tooltip
              formatter={(value) => [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`]}
              labelFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e0', fontSize: 12 }}
            />
            {seriesByCreator.map(s => (
              <Line key={s.creator.platformId} dataKey={s.creator.displayName} stroke={s.color} strokeWidth={2.5} dot={false} connectNulls type="monotone" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Metric definitions. A row only renders when every creator currently in   */
/* the lineup has a platform that genuinely supports that metric, not just  */
/* when at least one does. Showing a real number next to a bare "-" isn't a */
/* comparison, it's one fact dressed up as one, so rows that can't be truly */
/* compared across the whole lineup are left out entirely instead of        */
/* padded with dashes. Where the underlying quantity differs by platform    */
/* but still answers the same question (Views vs Likes vs Watch hours are   */
/* all "how much did people engage with this"), the row's own label is      */
/* composed from whichever of those units are actually present, the same    */
/* way "Subscribers / Followers" already merges YouTube subs with Twitch    */
/* followers into one row.                                                  */
/* ------------------------------------------------------------------------ */

// Engagement volume: the "how much got watched/liked/played" number. Every
// platform here means something different (a view, a like, an hour), which
// is exactly why the row's label is built from whichever are in play rather
// than a single fixed word. Bluesky/Mastodon/Substack have no such
// concept at all (no per-item engagement figure we track), so a lineup that
// includes any of them drops this row entirely rather than showing a real
// number next to a dash.
const ENGAGEMENT_UNIT = {
  youtube: 'Views',
  tiktok: 'Likes',
  music: 'Plays',
  twitch: 'Watch hrs',
  kick: 'Watch hrs',
};

// Concurrent viewers: only Twitch and Kick track a live audience at all.
const VIEWERS_PLATFORM = { twitch: true, kick: true };

// Content library size: a real inventory count, framed as no-leader since
// posting more isn't "winning." Twitch/Kick have no video library (their
// content is live, not archived items), Music and Substack don't expose a
// post count at all.
const CONTENT_UNIT = {
  youtube: 'Videos',
  tiktok: 'Videos',
  mastodon: 'Posts',
  bluesky: 'Posts',
};

// Avg per item only means anything where a platform has both a real engagement
// count AND a real item count, which in practice is just YouTube and TikTok,
// everywhere else lacks one half of the fraction.
const AVG_UNIT = { youtube: 'views', tiktok: 'likes' };

function buildMetrics(filledCreators, growthData) {
  const def = (label, icon, tag, tagFg, getVal, opts = {}) => {
    const vals = filledCreators.map(getVal);
    const numeric = vals.map(v => (typeof v === 'number' ? v : null));
    const hasAny = numeric.some(v => v != null);
    let leaderIndex = -1;
    const hasLeader = !opts.noLeader && hasAny;
    if (hasLeader) {
      let best = -Infinity;
      numeric.forEach((v, i) => { if (v != null && v > best) { best = v; leaderIndex = i; } });
      // No leader if tied or only one has data
      if (numeric.filter(v => v != null).length < 2 || numeric.filter(v => v === best).length > 1) leaderIndex = -1;
    }
    const signed = !!opts.signed;
    const maxAbs = Math.max(1, ...numeric.map(v => Math.abs(v || 0)));
    const bars = filledCreators.map((c, i) => {
      const v = numeric[i];
      // No-leader rows still get each creator's own identity color, "doesn't
      // decide the crown" is already communicated by the row's own amber tag
      // text and by isLeader naturally never being true here (no bold value
      // either side), graying out the bars on top of that just makes a real
      // number look broken/disabled instead of merely non-competitive.
      const color = accentFor(i);
      let left = '0%', width = '2%';
      if (v != null) {
        if (signed) {
          const half = (Math.abs(v) / maxAbs) * 48;
          left = v >= 0 ? '50%' : `${(50 - half).toFixed(2)}%`;
          width = `${Math.max(1.2, half).toFixed(2)}%`;
        } else {
          width = `${Math.max(1.2, (Math.abs(v) / maxAbs) * 100).toFixed(2)}%`;
        }
      }
      return { left, width, color, value: opts.fmt ? opts.fmt(v, c) : (v == null ? '-' : formatNumber(v)), isLeader: leaderIndex === i };
    });
    return { label, icon, tag, tagFg, bars, signed, hasLeader, leaderIndex };
  };

  const platforms = filledCreators.map(c => c.platform);
  // Every creator's platform has to be a participant, one non-participant
  // and the whole row is out, not just dashed out for that one creator.
  const allSupport = (map) => platforms.every(p => map[p]);
  // Unique labels in first-seen order, so a single-platform lineup gets its
  // one real label and a mixed one gets a composed "A / B".
  const unitsUsed = (map) => [...new Set(platforms.map(p => map[p]))];

  // Kick's API has no free-follower endpoint at all, "subscribers" there is
  // real, but it's a paid-subscriber count, a categorically smaller, higher-
  // commitment number than a free follow anywhere else (see CLAUDE.md's Kick
  // notes). Kick vs Kick is a fair fight, same unit both sides. Kick mixed
  // with anything else isn't: a real 2,400 paid subs next to a real 344,000
  // free followers isn't "who has more," it's two different business metrics
  // that happen to live in the same DB column. Show both numbers honestly
  // labeled, but don't let that pairing decide the crown.
  const allKick = platforms.every(p => p === 'kick');
  const mixedKick = platforms.includes('kick') && !allKick;
  const subsLabel = allKick ? 'Paid subscribers' : mixedKick ? 'Followers / Paid subs' : 'Subscribers / Followers';
  const subsTag = mixedKick ? "Kick only exposes paid subs, not a fair size match against a free follow" : 'higher is better';
  const rows = [
    def(subsLabel, Users, subsTag, mixedKick ? 'text-amber-600' : 'text-neutral-400', c => c.subscribers || c.followers || 0, { noLeader: mixedKick }),
  ];

  if (allSupport(ENGAGEMENT_UNIT)) {
    rows.push(def(unitsUsed(ENGAGEMENT_UNIT).join(' / '), Eye, 'higher is better', 'text-neutral-400', c => {
      if (c.platform === 'twitch' || c.platform === 'kick') return growthData[c.platformId]?.hoursWatched ?? null;
      return c.totalViews ?? null;
    }, { fmt: (v, c) => v == null ? '-' : (c.platform === 'twitch' || c.platform === 'kick') ? `${formatNumber(v)} hrs` : formatNumber(v) }));
  }

  // Concurrent viewers: a genuinely different axis than followers or watch
  // hours, a creator can have a huge follower count and a quiet stream, or
  // the reverse. Only Twitch/Kick track this. Real 30-day peak/average
  // computed from actual stream_sessions (see getViewershipStats), not
  // creator_stats' single-day snapshot, which can read 0 for an otherwise
  // huge streamer if their single most recent tracked day happened to carry
  // a monitor-artifact session. Still real, worth seeing, but it's how big
  // a stream gets, not the same thing as overall audience size, so like
  // growth it never decides the crown, two viewer rows shouldn't get to
  // outvote Followers just because they're two rows instead of one.
  if (allSupport(VIEWERS_PLATFORM)) {
    rows.push(def('Peak viewers', Radio, "biggest stream in 30 days, not their overall scale", 'text-amber-600', c => growthData[c.platformId]?.peakViewers ?? null, { noLeader: true }));
    rows.push(def('Avg viewers', Radio, "typical stream in 30 days, not their overall scale", 'text-amber-600', c => growthData[c.platformId]?.avgViewers ?? null, { noLeader: true }));
  }

  if (allSupport(CONTENT_UNIT)) {
    rows.push(def(unitsUsed(CONTENT_UNIT).join(' / '), Video, 'no leader: library size, not performance', 'text-amber-600', c => c.totalPosts ?? null, { noLeader: true }));
  }

  if (allSupport(AVG_UNIT)) {
    rows.push(def(`Avg ${unitsUsed(AVG_UNIT).join('/')} per video`, TrendingUp, 'higher is better', 'text-neutral-400',
      c => (c.totalPosts > 0 ? Math.round((c.totalViews || 0) / c.totalPosts) : null)));
  }

  // Growth is a rate, not a size, a tiny account can post a huge percentage
  // gain without being remotely bigger. This page's whole question is "who's
  // actually bigger," so growth stays visible as real, useful context but,
  // like library size above, never decides the crown or counts toward the
  // "leads on N of M" tally. Counting it as an equal-weight win alongside
  // Subscribers/Followers is exactly how a small, fast-growing account could
  // outscore a much bigger one on a tie, which answers a different question
  // than the one this page is asking.
  rows.push(
    def('7-day growth', TrendingUp, 'a rate, not a size · never decides the leader', 'text-amber-600', c => growthData[c.platformId]?.growth7Day ?? null, { signed: true, noLeader: true, fmt: v => v == null ? '-' : fmtPct(v) }),
    def('30-day growth', TrendingUp, 'a rate, not a size · never decides the leader', 'text-amber-600', c => growthData[c.platformId]?.growth30Day ?? null, { signed: true, noLeader: true, fmt: v => v == null ? '-' : fmtPct(v) }),
  );

  return rows;
}
