import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Star, Users, Loader2,
  Scale, Clock, ChevronRight, ChevronLeft, Check, X, Trash2,
  Lock, Settings, TrendingUp,
} from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import CreatorAvatar from '../components/CreatorAvatar';
import { DashboardSkeleton } from '../components/Skeleton';
import { getFollowedCreators } from '../services/followService';
import { getSavedCompares, deleteSavedCompare } from '../services/compareService';
import { getCreatorStats } from '../services/creatorService';
import { getLiveStreams as getTwitchLiveStreams } from '../services/twitchService';
import { getLiveStreams as getKickLiveStreams } from '../services/kickService';
import { getRecentlyViewed, clearRecentlyViewed } from '../lib/recentlyViewed';
import { formatNumber } from '../lib/utils';
import logger from '../lib/logger';

const platformIcons = {
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  twitch: TwitchIcon,
  kick: KickIcon,
  bluesky: BlueskyIcon,
  mastodon: MastodonIcon,
  rumble: RumbleIcon,
  substack: SubstackIcon,
};

// Platform identity lives in the icon tint alone — no colored chips or paint.
const platformTint = {
  youtube: 'text-red-500',
  tiktok: 'text-pink-500',
  twitch: 'text-purple-500',
  kick: 'text-green-600',
  bluesky: 'text-sky-500',
  mastodon: 'text-violet-500',
  rumble: 'text-lime-600',
  substack: 'text-orange-500',
};

const PLATFORM_LABELS = {
  youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', mastodon: 'Mastodon', rumble: 'Rumble', substack: 'Substack',
};

const METRIC_LABEL = {
  youtube: 'subs',
  tiktok: 'followers',
  twitch: 'followers',
  kick: 'paid subs',
  bluesky: 'followers',
  mastodon: 'followers',
  rumble: 'followers',
  substack: 'subscribers',
};

// Typographic backbone: hairline cards on paper, micro-labels, tabular numerals
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();

  // Data
  const [followedCreators, setFollowedCreators] = useState([]);
  const [creatorStats, setCreatorStats] = useState({});
  const [liveStreamers, setLiveStreamers] = useState(new Set());
  const [savedCompares, setSavedCompares] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  // Loading states
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [loadingCompares, setLoadingCompares] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState('following');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [sortBy, setSortBy] = useState('live');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [recentlyViewedIndex, setRecentlyViewedIndex] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to access your dashboard' },
      }));
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      loadFollowedCreators();
      loadSavedCompares();
    }
    setRecentlyViewed(getRecentlyViewed());
  }, [user]);

  async function loadFollowedCreators() {
    setLoadingCreators(true);
    try {
      const creators = await getFollowedCreators(user.id);
      setFollowedCreators(creators);
      setLoadingCreators(false);

      if (creators.length === 0) return;

      const twitchCreators = creators.filter(c => c.platform === 'twitch');
      const kickCreators = creators.filter(c => c.platform === 'kick');

      const [statsResults, twitchLive, kickLive] = await Promise.all([
        Promise.all(
          creators.map(creator =>
            getCreatorStats(creator.id, 7)
              .then(data => ({ id: creator.id, data: data || [] }))
              .catch(() => ({ id: creator.id, data: [] }))
          )
        ),
        twitchCreators.length > 0
          ? getTwitchLiveStreams(twitchCreators.map(c => c.username)).catch(() => [])
          : Promise.resolve([]),
        kickCreators.length > 0
          ? getKickLiveStreams(kickCreators.map(c => c.username)).catch(() => [])
          : Promise.resolve([]),
      ]);

      const stats = {};
      for (const { id, data } of statsResults) {
        if (data.length > 0) stats[id] = {
          current: data[data.length - 1],          // most recent (today)
          previous: data[data.length - 2] || null, // yesterday
          weekAgo: data[0] || null,                // oldest in window
        };
      }
      setCreatorStats(stats);

      const allLive = new Set();
      twitchLive.forEach(s => allLive.add(s.username.toLowerCase()));
      kickLive.forEach(s => allLive.add(s.username.toLowerCase()));
      setLiveStreamers(allLive);
    } catch (error) {
      logger.error('Failed to load followed creators:', error);
      setLoadingCreators(false);
    }
  }

  async function loadSavedCompares() {
    setLoadingCompares(true);
    try {
      const data = await getSavedCompares(user.id);
      setSavedCompares(data);
    } catch (err) {
      logger.error('Failed to load saved compares:', err);
    } finally {
      setLoadingCompares(false);
    }
  }

  async function handleDeleteCompare(id) {
    try {
      await deleteSavedCompare(id);
      setSavedCompares(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      logger.error('Failed to delete compare:', err);
    }
  }

  function handleClearHistory() {
    clearRecentlyViewed();
    setRecentlyViewed([]);
    setRecentlyViewedIndex(0);
  }

  const getGrowth = (creatorId, field) => {
    const stat = creatorStats[creatorId];
    if (!stat?.current || !stat?.previous) return null;
    return (stat.current[field] || 0) - (stat.previous[field] || 0);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9]">
        <SEO title="Loading..." />
        <DashboardSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEO title="Dashboard" description="Track your followed creators and see their latest stats in one place." />
        <div className="min-h-screen bg-[#fafaf9]">
          <div className="max-w-4xl mx-auto px-4 pt-20 pb-32">

            <div className="text-center mb-12">
              <p className={`${MICRO} mb-4`}>Free with an account</p>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 mb-4">
                Your Dashboard
              </h1>
              <p className="text-base text-neutral-500 max-w-xl mx-auto">
                Follow creators, track their stats, and see everything in one place. Free to sign up.
              </p>
            </div>

            {/* Blurred preview */}
            <div className="relative">
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#fafaf9]/70 backdrop-blur-sm rounded-xl">
                <Lock className="w-6 h-6 text-neutral-400 mb-4" />
                <p className="text-base font-medium text-neutral-900 mb-1">Sign in to continue</p>
                <p className="text-sm text-neutral-500 mb-6 max-w-sm text-center">
                  Create a free account to follow creators and track their stats.
                </p>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to access your dashboard' } }))}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Sign Up / Sign In
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Fake preview */}
              <div className="pointer-events-none select-none opacity-50">
                <div className={`${CARD} p-5 mb-4 flex items-center gap-4`}>
                  <div className="w-11 h-11 rounded-lg bg-neutral-100 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-neutral-100 rounded mb-2" />
                    <div className="flex gap-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-3 w-20 bg-neutral-100 rounded" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`${CARD} overflow-hidden`}>
                  <div className="flex border-b border-neutral-100 px-4">
                    {['Following', 'Saved Compares', 'Recently Viewed'].map((t, i) => (
                      <div key={t} className={`px-4 py-3 text-sm ${i === 0 ? 'text-neutral-900' : 'text-neutral-400'}`}>{t}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-9 h-9 rounded-lg bg-neutral-100 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="h-3.5 w-28 bg-neutral-100 rounded mb-1.5" />
                          <div className="h-3 w-16 bg-neutral-100 rounded" />
                        </div>
                        <div className="h-4 w-16 bg-neutral-100 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature list */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 max-w-2xl mx-auto">
              {[
                'Follow creators across all platforms',
                'See follower counts and daily changes',
                'Save compare setups for quick access',
                'Track recently viewed profiles',
                'Compare creators side by side',
                'Free forever, no credit card needed',
              ].map(f => (
                <div key={f} className="flex items-start gap-2.5 text-sm text-neutral-500">
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-neutral-400" />
                  {f}
                </div>
              ))}
            </div>

          </div>
        </div>
      </>
    );
  }

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';

  const liveCount = followedCreators.filter(c =>
    (c.platform === 'twitch' || c.platform === 'kick') && liveStreamers.has(c.username.toLowerCase())
  ).length;

  const platformCounts = {
    youtube:  followedCreators.filter(c => c.platform === 'youtube').length,
    tiktok:   followedCreators.filter(c => c.platform === 'tiktok').length,
    twitch:   followedCreators.filter(c => c.platform === 'twitch').length,
    kick:     followedCreators.filter(c => c.platform === 'kick').length,
    bluesky:  followedCreators.filter(c => c.platform === 'bluesky').length,
    mastodon: followedCreators.filter(c => c.platform === 'mastodon').length,
    rumble:   followedCreators.filter(c => c.platform === 'rumble').length,
    substack: followedCreators.filter(c => c.platform === 'substack').length,
  };

  const filteredCreators = selectedPlatform === 'all'
    ? followedCreators
    : selectedPlatform === 'live'
    ? followedCreators.filter(c => (c.platform === 'twitch' || c.platform === 'kick') && liveStreamers.has(c.username.toLowerCase()))
    : followedCreators.filter(c => c.platform === selectedPlatform);

  const sortedCreators = [...filteredCreators].sort((a, b) => {
    if (sortBy === 'live') {
      const aLive = (a.platform === 'twitch' || a.platform === 'kick') && liveStreamers.has(a.username.toLowerCase()) ? 1 : 0;
      const bLive = (b.platform === 'twitch' || b.platform === 'kick') && liveStreamers.has(b.username.toLowerCase()) ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      const aCount = creatorStats[a.id]?.current?.subscribers || creatorStats[a.id]?.current?.followers || 0;
      const bCount = creatorStats[b.id]?.current?.subscribers || creatorStats[b.id]?.current?.followers || 0;
      return bCount - aCount;
    }
    if (sortBy === 'growth') {
      const aGrowth = getGrowth(a.id, a.platform === 'youtube' ? 'subscribers' : 'followers') ?? -Infinity;
      const bGrowth = getGrowth(b.id, b.platform === 'youtube' ? 'subscribers' : 'followers') ?? -Infinity;
      return bGrowth - aGrowth;
    }
    if (sortBy === 'followers') {
      const aCount = creatorStats[a.id]?.current?.subscribers || creatorStats[a.id]?.current?.followers || 0;
      const bCount = creatorStats[b.id]?.current?.subscribers || creatorStats[b.id]?.current?.followers || 0;
      return bCount - aCount;
    }
    if (sortBy === 'name') {
      return (a.display_name || a.username).localeCompare(b.display_name || b.username);
    }
    return 0;
  });

  const byCount = (a, b) => {
    const av = creatorStats[a.id]?.current?.subscribers || creatorStats[a.id]?.current?.followers || 0;
    const bv = creatorStats[b.id]?.current?.subscribers || creatorStats[b.id]?.current?.followers || 0;
    return bv - av;
  };

  const liveCreatorsList = followedCreators.filter(c =>
    (c.platform === 'twitch' || c.platform === 'kick') && liveStreamers.has(c.username.toLowerCase())
  );
  const topGrowthList = followedCreators
    .map(c => ({ c, g: getGrowth(c.id, c.platform === 'youtube' ? 'subscribers' : 'followers') }))
    .filter(x => x.g !== null && x.g > 0)
    .sort((a, b) => b.g - a.g);

  const spotlightCreator = liveCreatorsList.length > 0
    ? [...liveCreatorsList].sort(byCount)[0]
    : topGrowthList.length > 0
    ? topGrowthList[0].c
    : followedCreators.length > 0
    ? [...followedCreators].sort(byCount)[0]
    : null;

  const spotlightStats = spotlightCreator ? creatorStats[spotlightCreator.id] : null;
  const spotlightIsLive = spotlightCreator && (spotlightCreator.platform === 'twitch' || spotlightCreator.platform === 'kick') && liveStreamers.has(spotlightCreator.username.toLowerCase());
  const spotlightGrowth = spotlightCreator ? getGrowth(spotlightCreator.id, spotlightCreator.platform === 'youtube' ? 'subscribers' : 'followers') : null;

  const renderCreatorCard = (creator) => {
    const PlatformIcon = platformIcons[creator.platform] || Users;
    const tint = platformTint[creator.platform] || 'text-neutral-400';
    const stats = creatorStats[creator.id];
    const isLive = (creator.platform === 'twitch' || creator.platform === 'kick') && liveStreamers.has(creator.username.toLowerCase());
    const growth = getGrowth(creator.id, creator.platform === 'youtube' ? 'subscribers' : 'followers');
    const isSelected = selectedForCompare.includes(creator.id);
    const metricLabel = METRIC_LABEL[creator.platform] || 'followers';

    const cardContent = (
      <div className="flex items-center gap-3.5">
        {compareMode && (
          <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
            isSelected ? 'bg-neutral-900 border-neutral-900' : 'border-neutral-300'
          }`}>
            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
          </div>
        )}
        <CreatorAvatar
          src={creator.profile_image}
          name={creator.display_name}
          size="lg"
          rounded="rounded-lg"
          className="!w-11 !h-11 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-900 truncate text-sm">{creator.display_name}</p>
            {isLive && (
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-semibold tracking-[0.1em] text-red-600">LIVE</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <PlatformIcon className={`w-3 h-3 flex-shrink-0 ${tint}`} />
            <p className="text-xs text-neutral-600 truncate">@{creator.username}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 min-w-[84px]">
          <div className="flex items-baseline justify-end gap-1.5">
            <p className="text-[15px] font-semibold text-neutral-900 tabular-nums leading-none">
              {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
            </p>
          </div>
          <p className={`${MICRO} mt-0.5`}>{metricLabel}</p>
          <p className={`mt-1 text-xs tabular-nums ${
            growth !== null && growth !== 0
              ? growth > 0 ? 'text-emerald-600' : 'text-red-600'
              : 'text-neutral-300'
          }`}>
            {growth !== null && growth !== 0
              ? `${growth > 0 ? '+' : ''}${formatNumber(growth)} today`
              : growth === 0 ? 'no change' : '–'}
          </p>
        </div>
      </div>
    );

    return compareMode ? (
      <button
        key={creator.id}
        onClick={() => {
          if (isSelected) {
            setSelectedForCompare(prev => prev.filter(id => id !== creator.id));
          } else if (selectedForCompare.length < 3) {
            setSelectedForCompare(prev => [...prev, creator.id]);
          }
        }}
        className={`w-full text-left ${CARD} p-4 transition-colors ${isSelected ? 'bg-neutral-50 border-neutral-300' : 'hover:border-neutral-300'} ${selectedForCompare.length >= 3 && !isSelected ? 'opacity-40' : ''}`}
      >
        {cardContent}
      </button>
    ) : (
      <Link
        key={creator.id}
        to={`/${creator.platform}/${creator.username}`}
        className={`block ${CARD} p-4 hover:border-neutral-300 transition-colors`}
      >
        {cardContent}
      </Link>
    );
  };

  const tabs = [
    { id: 'following', label: 'Following', shortLabel: 'Following', icon: Star, count: followedCreators.length },
    { id: 'compares', label: 'Saved Compares', shortLabel: 'Compares', icon: Scale, count: savedCompares.length },
    { id: 'recent', label: 'Recently Viewed', shortLabel: 'Recent', icon: Clock, count: recentlyViewed.length },
  ];

  return (
    <>
      <SEO
        title="My Dashboard"
        description="Track your favorite creators and see their latest statistics."
      />

      <div className="min-h-screen bg-[#fafaf9]">

        {/* Page header */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
              Welcome back{displayName ? `, ${displayName}` : ''}.
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Track creators you follow, see who's live, and revisit your saved comparisons.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Identity card */}
          <div className={`${CARD} p-5 sm:p-6 mb-6 flex items-center gap-4`}>
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-neutral-900 text-white flex items-center justify-center text-lg sm:text-xl font-semibold flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-neutral-900 truncate">{displayName}</p>
              <p className="text-sm text-neutral-600 truncate">{user.email}</p>
              <p className="sm:hidden mt-1 text-xs text-neutral-500 tabular-nums">
                {followedCreators.length} following · {savedCompares.length} saved compares
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
              <div className="text-right">
                <p className={MICRO}>Following</p>
                <p className="text-xl font-semibold text-neutral-900 tabular-nums leading-none mt-1">{followedCreators.length}</p>
              </div>
              <div className="w-px h-8 bg-neutral-200/80" />
              <div className="text-right">
                <p className={MICRO}>Saved compares</p>
                <p className="text-xl font-semibold text-neutral-900 tabular-nums leading-none mt-1">{savedCompares.length}</p>
              </div>
            </div>
          </div>

          {/* Spotlight — the single most relevant followed creator right now */}
          {activeTab === 'following' && !compareMode && !loadingCreators && spotlightCreator && (
            <Link
              to={`/${spotlightCreator.platform}/${spotlightCreator.username}`}
              className={`${CARD} block p-5 sm:p-6 mb-6 hover:border-neutral-300 transition-colors ${
                spotlightIsLive ? 'border-t-2 border-t-red-500' : spotlightGrowth > 0 ? 'border-t-2 border-t-emerald-500' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 mb-3">
                {spotlightIsLive ? (
                  <>
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold tracking-[0.12em] text-red-600">LIVE NOW</span>
                  </>
                ) : spotlightGrowth > 0 ? (
                  <>
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    <span className="text-[10px] font-bold tracking-[0.12em] text-emerald-600">TOP GROWTH TODAY</span>
                  </>
                ) : (
                  <span className={MICRO}>Most followed</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <CreatorAvatar
                  src={spotlightCreator.profile_image}
                  name={spotlightCreator.display_name}
                  size="xl"
                  rounded="rounded-xl"
                  className="!w-14 !h-14 sm:!w-16 sm:!h-16 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-lg sm:text-xl font-semibold text-neutral-900 truncate">{spotlightCreator.display_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {(() => {
                      const SIcon = platformIcons[spotlightCreator.platform] || Users;
                      return <SIcon className={`w-3.5 h-3.5 flex-shrink-0 ${platformTint[spotlightCreator.platform] || 'text-neutral-400'}`} />;
                    })()}
                    <p className="text-sm text-neutral-600 truncate">{PLATFORM_LABELS[spotlightCreator.platform]} · @{spotlightCreator.username}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl sm:text-2xl font-bold text-neutral-900 tabular-nums leading-none">
                    {formatNumber(spotlightStats?.current?.subscribers || spotlightStats?.current?.followers || 0)}
                  </p>
                  {spotlightGrowth > 0 && (
                    <p className="mt-1 text-xs font-medium text-emerald-600 tabular-nums">+{formatNumber(spotlightGrowth)} today</p>
                  )}
                </div>
              </div>
            </Link>
          )}

          {/* Underline tab nav */}
          <div className="flex items-center gap-6 border-b border-neutral-200/80 mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-2 pb-3 -mb-px border-b-2 text-sm font-medium transition-colors ${
                    isActive ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  {tab.count > 0 && <span className="text-xs text-neutral-600 tabular-nums">{tab.count}</span>}
                </button>
              );
            })}
            <div className="flex-1" />
            <Link
              to="/account"
              className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 pb-3 text-sm text-neutral-400 hover:text-neutral-900 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Account Settings
            </Link>
          </div>

          {/* Content */}
          <div>

              {/* ── FOLLOWING TAB ── */}
              {activeTab === 'following' && (
                <div>
                  {/* Compare mode banner */}
                  {compareMode && (
                    <div className={`mb-4 ${CARD} p-4`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-neutral-900">Compare mode</span>
                          <span className="text-xs text-neutral-600 tabular-nums">{selectedForCompare.length}/3 selected</span>
                        </div>
                        <button
                          onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500 mb-3">Tap creators from the list to select them</p>
                      <Link
                        to={`/compare?creators=${selectedForCompare.map(id => {
                          const c = followedCreators.find(fc => fc.id === id);
                          return c ? `${c.platform}:${c.username}` : '';
                        }).filter(Boolean).join(',')}`}
                        onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                        className={`flex items-center justify-center gap-2 w-full py-2 text-sm font-medium rounded-lg transition-colors ${
                          selectedForCompare.length >= 2
                            ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                            : 'bg-neutral-100 text-neutral-400 pointer-events-none'
                        }`}
                      >
                        {selectedForCompare.length >= 2
                          ? `Compare ${selectedForCompare.length} creators`
                          : 'Select at least 2 creators'}
                      </Link>
                    </div>
                  )}

                  {/* Toolbar: platform filter + sort + compare + export */}
                  {!compareMode && !loadingCreators && followedCreators.length > 0 && (
                    <div className="flex items-center gap-2 mb-6 flex-wrap">
                      <select
                        value={selectedPlatform}
                        onChange={e => setSelectedPlatform(e.target.value)}
                        className="text-sm bg-white border border-neutral-200 text-neutral-700 rounded-lg px-3 py-2 focus:outline-none focus:border-neutral-400 cursor-pointer"
                      >
                        <option value="all">All platforms ({followedCreators.length})</option>
                        {liveCount > 0 && <option value="live">Live now ({liveCount})</option>}
                        {(['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'mastodon', 'rumble', 'substack']).map(p => (
                          platformCounts[p] ? (
                            <option key={p} value={p}>{PLATFORM_LABELS[p]} ({platformCounts[p]})</option>
                          ) : null
                        ))}
                      </select>

                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="text-sm bg-white border border-neutral-200 text-neutral-700 rounded-lg px-3 py-2 focus:outline-none focus:border-neutral-400 cursor-pointer"
                      >
                        <option value="live">Live first</option>
                        <option value="growth">Top growth</option>
                        <option value="followers">Most followed</option>
                        <option value="name">Name A-Z</option>
                      </select>

                      <div className="ml-auto flex items-center gap-2">
                        {followedCreators.length >= 2 && (
                          <button
                            onClick={() => setCompareMode(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 text-xs rounded-lg transition-colors"
                          >
                            <Scale className="w-3 h-3" />
                            Compare
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Creator list */}
                  {loadingCreators ? (
                    <div className={`${CARD} flex items-center justify-center p-12`}>
                      <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
                    </div>
                  ) : sortedCreators.length === 0 ? (
                    <div className={`${CARD} text-center p-14`}>
                      {selectedPlatform === 'all' ? (
                        <>
                          <Star className="w-6 h-6 text-neutral-300 mx-auto mb-4" />
                          <p className="text-neutral-900 font-medium mb-1">No creators followed yet</p>
                          <p className="text-neutral-500 text-sm mb-6">Find creators to follow and track their growth.</p>
                          <Link
                            to="/search"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors text-sm"
                          >
                            Find Creators
                          </Link>
                        </>
                      ) : (
                        <p className="text-neutral-500 text-sm">
                          {selectedPlatform === 'live' ? 'No one is live right now.' : `No ${PLATFORM_LABELS[selectedPlatform]} creators followed.`}
                        </p>
                      )}
                    </div>
                  ) : selectedPlatform === 'all' ? (
                    <div className="space-y-8">
                      {(['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'mastodon', 'rumble', 'substack']).map(p => {
                        const group = sortedCreators.filter(c => c.platform === p);
                        if (group.length === 0) return null;
                        const Icon = platformIcons[p];
                        return (
                          <div key={p}>
                            <div className="flex items-center gap-2 mb-3">
                              <Icon className={`w-3.5 h-3.5 ${platformTint[p]}`} />
                              <p className={MICRO}>{PLATFORM_LABELS[p]} · {group.length}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {group.map(creator => renderCreatorCard(creator))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {sortedCreators.map(creator => renderCreatorCard(creator))}
                    </div>
                  )}
                </div>
              )}

              {/* ── SAVED COMPARES TAB ── */}
              {activeTab === 'compares' && (
                <div>
                  {loadingCompares ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
                    </div>
                  ) : savedCompares.length === 0 ? (
                    <div className={`${CARD} p-14 text-center`}>
                      <Scale className="w-6 h-6 text-neutral-300 mx-auto mb-4" />
                      <p className="text-neutral-900 font-medium mb-1">No saved comparisons</p>
                      <p className="text-neutral-500 text-sm mb-6">Head to the Compare page, set up a comparison, and hit "Save comparison".</p>
                      <Link
                        to="/compare"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors text-sm"
                      >
                        Go to Compare
                      </Link>
                    </div>
                  ) : (
                    <div className={`${CARD} divide-y divide-neutral-100 overflow-hidden`}>
                      {savedCompares.map(compare => {
                        const entries = compare.creators_param.split(',').map(e => {
                          const [platform, username] = e.split(':');
                          return { platform, username };
                        });
                        return (
                          <div key={compare.id} className="flex items-center gap-3 px-4 py-3.5 group hover:bg-neutral-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-neutral-900 text-sm mb-1">{compare.name}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                {entries.map((e, i) => {
                                  const Icon = platformIcons[e.platform];
                                  const tint = platformTint[e.platform] || 'text-neutral-400';
                                  return (
                                    <span key={i} className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                                      {Icon && <Icon className={`w-3 h-3 ${tint}`} />}
                                      {e.username}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleDeleteCompare(compare.id)}
                                className="p-2 rounded-md text-neutral-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <Link
                                to={`/compare?creators=${compare.creators_param}`}
                                className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 transition-colors px-2"
                              >
                                Open <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── RECENTLY VIEWED TAB ── */}
              {activeTab === 'recent' && (
                <div>
                  {recentlyViewed.length === 0 ? (
                    <div className={`${CARD} p-14 text-center`}>
                      <Clock className="w-6 h-6 text-neutral-300 mx-auto mb-4" />
                      <p className="text-neutral-900 font-medium mb-1">Nothing here yet</p>
                      <p className="text-neutral-500 text-sm">Creators you visit will show up here.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        {recentlyViewed.length > 8 ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setRecentlyViewedIndex(Math.max(0, recentlyViewedIndex - 8))}
                              disabled={recentlyViewedIndex === 0}
                              className="p-1.5 rounded-md bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-neutral-600 tabular-nums">{Math.floor(recentlyViewedIndex / 8) + 1} / {Math.ceil(recentlyViewed.length / 8)}</span>
                            <button
                              onClick={() => setRecentlyViewedIndex(Math.min(recentlyViewed.length - 8, recentlyViewedIndex + 8))}
                              disabled={recentlyViewedIndex >= recentlyViewed.length - 8}
                              className="p-1.5 rounded-md bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : <div />}
                        <button
                          onClick={handleClearHistory}
                          className="text-xs text-neutral-400 hover:text-red-600 transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                        {recentlyViewed.slice(recentlyViewedIndex, recentlyViewedIndex + 8).map((creator, idx) => {
                          const PlatformIcon = platformIcons[creator.platform] || Users;
                          const tint = platformTint[creator.platform] || 'text-neutral-400';
                          return (
                            <Link
                              key={`${creator.platform}-${creator.username}-${idx}`}
                              to={`/${creator.platform}/${creator.username}`}
                              className={`${CARD} p-4 hover:border-neutral-300 transition-colors`}
                            >
                              <CreatorAvatar
                                src={creator.profileImage}
                                name={creator.displayName}
                                size="xl"
                                rounded="rounded-lg"
                                className="!w-12 !h-12 mx-auto mb-3"
                              />
                              <div className="text-center">
                                <p className="font-medium text-neutral-900 text-[13px] truncate">{creator.displayName}</p>
                                <div className="flex items-center justify-center gap-1.5 mt-1">
                                  <PlatformIcon className={`w-3 h-3 ${tint}`} />
                                  <span className="text-xs text-neutral-600 tabular-nums">
                                    {formatNumber(creator.subscribers || creator.followers || 0)}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

          </div>
        </div>
      </div>
    </>
  );
}
