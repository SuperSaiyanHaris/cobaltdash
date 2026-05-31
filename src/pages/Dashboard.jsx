import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Youtube, Twitch, Star, Users, Loader2, TrendingUp, TrendingDown,
  Scale, Clock, ChevronRight, ChevronLeft, Check, X, Trash2,
  ExternalLink, Download, Lock, Settings, Zap, Radio,
} from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import CreatorAvatar from '../components/CreatorAvatar';
import CountUp from '../components/CountUp';
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
  youtube: Youtube,
  tiktok: TikTokIcon,
  twitch: Twitch,
  kick: KickIcon,
  bluesky: BlueskyIcon,
  mastodon: MastodonIcon,
  rumble: RumbleIcon,
  substack: SubstackIcon,
};

const platformColors = {
  youtube:  { bg: 'bg-red-600', light: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  tiktok:   { bg: 'bg-pink-600', light: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
  twitch:   { bg: 'bg-purple-600', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  kick:     { bg: 'bg-green-600', light: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  bluesky:  { bg: 'bg-sky-500', light: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  mastodon: { bg: 'bg-violet-600', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  rumble:   { bg: 'bg-lime-600', light: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
  substack: { bg: 'bg-orange-600', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
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
      <div className="min-h-screen bg-[#fafafa]">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEO title="Dashboard" description="Track your followed creators and see their latest stats in one place." />
        <div className="min-h-screen bg-[#fafafa]">
          <div className="max-w-4xl mx-auto px-4 pt-20 pb-32">

            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-500/20 rounded-full text-indigo-600 text-sm font-semibold mb-6">
                <Star className="w-3.5 h-3.5" />
                Free with an account
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 mb-4">
                Your Dashboard
              </h1>
              <p className="text-lg text-neutral-500 max-w-xl mx-auto">
                Follow creators, track their stats, and see everything in one place. Free to sign up.
              </p>
            </div>

            {/* Blurred preview */}
            <div className="relative">
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#fafafa]/60 backdrop-blur-sm rounded-2xl">
                <Lock className="w-10 h-10 text-indigo-600 mb-4" />
                <p className="text-lg font-semibold text-neutral-900 mb-2">Sign in to continue</p>
                <p className="text-sm text-neutral-500 mb-6 max-w-sm text-center">
                  Create a free account to follow creators and track their stats.
                </p>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to access your dashboard' } }))}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Sign Up / Sign In
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Fake preview */}
              <div className="pointer-events-none select-none opacity-40">
                <div className="bg-white border border-neutral-200 rounded-2xl p-5 mb-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="h-4 w-32 bg-neutral-200 rounded" />
                      <div className="h-4 w-12 bg-neutral-200 rounded-full" />
                    </div>
                    <div className="flex gap-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-3 w-20 bg-neutral-100 rounded" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="flex border-b border-neutral-200 px-4">
                    {['Following', 'Saved Compares', 'Recently Viewed'].map((t, i) => (
                      <div key={t} className={`px-4 py-3 text-sm font-medium ${i === 0 ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-neutral-400'}`}>{t}</div>
                    ))}
                  </div>
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50">
                        <div className="w-9 h-9 rounded-full bg-neutral-200 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="h-3.5 w-28 bg-neutral-200 rounded mb-1.5" />
                          <div className="h-3 w-16 bg-neutral-100 rounded" />
                        </div>
                        <div className="h-4 w-16 bg-neutral-200 rounded" />
                        <div className="h-4 w-14 bg-neutral-200 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature list */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {[
                'Follow creators across all platforms',
                'See follower counts and daily changes',
                'Save compare setups for quick access',
                'Track recently viewed profiles',
                'Compare creators side by side',
                'Free forever, no credit card needed',
              ].map(f => (
                <div key={f} className="flex items-start gap-2.5 text-sm text-neutral-500">
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-600" />
                  {f}
                </div>
              ))}
            </div>

          </div>
        </div>
      </>
    );
  }

  const handleBulkExport = () => {
    if (!followedCreators.length) return;

    const exportDate = new Date().toISOString().split('T')[0];
    const fmtDelta = (n) => n == null ? '' : (n >= 0 ? `+${n}` : `${n}`);
    const esc = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      ['ShinyPull Creator Report'],
      ['Exported', exportDate],
      ['Total Creators', followedCreators.length],
      [],
    ];

    const PLATFORM_ORDER = ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'mastodon', 'rumble', 'substack'];
    const PLATFORM_LABELS_LOCAL = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', mastodon: 'Mastodon', rumble: 'Rumble', substack: 'Substack' };

    for (const platform of PLATFORM_ORDER) {
      const creators = followedCreators.filter(c => c.platform === platform);
      if (!creators.length) continue;

      lines.push([`--- ${PLATFORM_LABELS_LOCAL[platform]} (${creators.length}) ---`]);

      if (platform === 'youtube') {
        lines.push(['Name', 'Username', 'Subscribers', '1-Day Sub Change', '7-Day Sub Change', 'Total Views', '1-Day Views', 'Videos', 'Est Monthly Revenue Low ($)', 'Est Monthly Revenue High ($)', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const oneDaySubs = curr && prev ? fmtDelta((curr.subscribers || 0) - (prev.subscribers || 0)) : '';
          const sevenDaySubs = curr && weekAgo && weekAgo !== curr ? fmtDelta((curr.subscribers || 0) - (weekAgo.subscribers || 0)) : '';
          const dailyViews = curr && prev ? (curr.total_views || 0) - (prev.total_views || 0) : null;
          const moLow = dailyViews != null && dailyViews > 0 ? (dailyViews * 30 * 2 / 1000).toFixed(0) : '';
          const moHigh = dailyViews != null && dailyViews > 0 ? (dailyViews * 30 * 7 / 1000).toFixed(0) : '';
          lines.push([
            c.display_name || c.username, c.username,
            curr?.subscribers ?? '',
            oneDaySubs, sevenDaySubs,
            curr?.total_views ?? '',
            dailyViews !== null ? fmtDelta(dailyViews) : '',
            curr?.total_posts ?? '',
            moLow, moHigh,
            `https://shinypull.com/youtube/${c.username}`,
          ]);
        }
      } else if (platform === 'tiktok') {
        lines.push(['Name', 'Username', 'Followers', '1-Day Change', '7-Day Change', 'Total Likes', '1-Day Likes', 'Videos', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const fol = (s) => s?.followers ?? s?.subscribers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            fol(curr) || '',
            curr && prev ? fmtDelta(fol(curr) - fol(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(fol(curr) - fol(weekAgo)) : '',
            curr?.total_views ?? '',
            curr && prev ? fmtDelta((curr.total_views || 0) - (prev.total_views || 0)) : '',
            curr?.total_posts ?? '',
            `https://shinypull.com/tiktok/${c.username}`,
          ]);
        }
      } else if (platform === 'twitch') {
        lines.push(['Name', 'Username', 'Followers', '1-Day Change', '7-Day Change', 'Hours Watched (Daily)', 'Peak Viewers', 'Avg Viewers', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const fol = (s) => s?.followers ?? s?.subscribers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            fol(curr) || '',
            curr && prev ? fmtDelta(fol(curr) - fol(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(fol(curr) - fol(weekAgo)) : '',
            curr?.hours_watched_day ?? '',
            curr?.peak_viewers_day ?? '',
            curr?.avg_viewers_day ?? '',
            `https://shinypull.com/twitch/${c.username}`,
          ]);
        }
      } else if (platform === 'kick') {
        lines.push(['Name', 'Username', 'Paid Subscribers', '1-Day Change', '7-Day Change', 'Hours Watched (Daily)', 'Peak Viewers', 'Avg Viewers', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const subs = (s) => s?.subscribers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            subs(curr) || '',
            curr && prev ? fmtDelta(subs(curr) - subs(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(subs(curr) - subs(weekAgo)) : '',
            curr?.hours_watched_day ?? '',
            curr?.peak_viewers_day ?? '',
            curr?.avg_viewers_day ?? '',
            `https://shinypull.com/kick/${c.username}`,
          ]);
        }
      } else if (platform === 'bluesky') {
        lines.push(['Name', 'Username', 'Followers', '1-Day Change', '7-Day Change', 'Posts', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const fol = (s) => s?.followers ?? s?.subscribers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            fol(curr) || '',
            curr && prev ? fmtDelta(fol(curr) - fol(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(fol(curr) - fol(weekAgo)) : '',
            curr?.total_posts ?? '',
            `https://shinypull.com/bluesky/${c.username}`,
          ]);
        }
      } else if (platform === 'mastodon') {
        lines.push(['Name', 'Handle', 'Followers', '1-Day Change', '7-Day Change', 'Posts', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const fol = (s) => s?.followers ?? s?.subscribers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            fol(curr) || '',
            curr && prev ? fmtDelta(fol(curr) - fol(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(fol(curr) - fol(weekAgo)) : '',
            curr?.total_posts ?? '',
            `https://shinypull.com/mastodon/${c.username}`,
          ]);
        }
      } else if (platform === 'rumble') {
        lines.push(['Name', 'Channel', 'Followers', '1-Day Change', '7-Day Change', 'Videos', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const fol = (s) => s?.followers ?? s?.subscribers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            fol(curr) || '',
            curr && prev ? fmtDelta(fol(curr) - fol(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(fol(curr) - fol(weekAgo)) : '',
            curr?.total_posts ?? '',
            `https://shinypull.com/rumble/${c.username}`,
          ]);
        }
      } else if (platform === 'substack') {
        lines.push(['Name', 'Publication', 'Subscribers', '1-Day Change', '7-Day Change', 'Profile URL']);
        for (const c of creators) {
          const { current: curr, previous: prev, weekAgo } = creatorStats[c.id] || {};
          const fol = (s) => s?.subscribers ?? s?.followers ?? 0;
          lines.push([
            c.display_name || c.username, c.username,
            fol(curr) || '',
            curr && prev ? fmtDelta(fol(curr) - fol(prev)) : '',
            curr && weekAgo && weekAgo !== curr ? fmtDelta(fol(curr) - fol(weekAgo)) : '',
            `https://shinypull.com/substack/${c.username}`,
          ]);
        }
      }

      lines.push([]);
    }

    const csvStr = '\uFEFF' + lines.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shinypull-creator-report-${exportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

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

      <div className="min-h-screen bg-[#fafafa]">

        {/* Page header */}
        <div className="relative overflow-hidden border-b border-neutral-200 bg-white">
          <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-indigo-100/40 blur-3xl pointer-events-none" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-2">Dashboard</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">
              Welcome back{displayName ? `, ${displayName}` : ''}.
            </h1>
            <p className="mt-2 text-sm sm:text-base text-neutral-600">
              Track creators you follow, see who's live, and revisit your saved comparisons.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Quick stats grid — 3 KPI cards */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
            {[
              { label: 'Following', value: followedCreators.length, Icon: Star, accent: 'indigo' },
              { label: 'Live now',  value: liveCount,                Icon: Radio, accent: 'red' },
              { label: 'Saved',     value: savedCompares.length,     Icon: Scale, accent: 'violet' },
            ].map(({ label, value, Icon, accent }) => {
              const colorMap = {
                indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600' },
                red:    { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600' },
                violet: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-600' },
              };
              const c = colorMap[accent];
              return (
                <div key={label} className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 hover:border-neutral-300 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-lg border ${c.bg} ${c.border} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${c.text}`} />
                    </div>
                    <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tabular-nums">
                    <CountUp value={value} format="comma" />
                  </p>
                </div>
              );
            })}
          </div>

          {/* Sidebar + content */}
          <div className="flex gap-8 items-start">

            {/* Sidebar nav (desktop) */}
            <aside className="hidden md:flex flex-col w-56 flex-shrink-0">
              <nav className="space-y-0.5">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                        isActive
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-600' : ''}`} />
                      <span className="flex-1">{tab.label}</span>
                      {tab.count > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                          isActive ? 'bg-indigo-500/30 text-indigo-600' : 'bg-neutral-200 text-neutral-500'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-6 pt-5 border-t border-neutral-200 space-y-0.5">
                <Link
                  to="/account"
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition-all"
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  Account Settings
                </Link>
              </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">

              {/* Mobile tabs — fixed 3-column segmented control */}
              <div className="flex md:hidden mb-6 bg-white border border-neutral-200 rounded-xl p-1 gap-1">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{tab.shortLabel}</span>
                      {tab.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                          isActive ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-500'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── FOLLOWING TAB ── */}
              {activeTab === 'following' && (
                <div>
                  {/* Compare mode banner — full card, mobile-first */}
                  {compareMode && (
                    <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Scale className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                          <span className="text-sm font-semibold text-indigo-600">Compare mode</span>
                          <span className="text-xs text-indigo-500 font-medium">({selectedForCompare.length}/3)</span>
                        </div>
                        <button
                          onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-indigo-600/70 mb-3">Tap creators from the list to select them</p>
                      <Link
                        to={`/compare?creators=${selectedForCompare.map(id => {
                          const c = followedCreators.find(fc => fc.id === id);
                          return c ? `${c.platform}:${c.username}` : '';
                        }).filter(Boolean).join(',')}`}
                        onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                        className={`flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                          selectedForCompare.length >= 2
                            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                            : 'bg-neutral-100 text-neutral-400 pointer-events-none'
                        }`}
                      >
                        <Scale className="w-4 h-4" />
                        {selectedForCompare.length >= 2
                          ? `Compare ${selectedForCompare.length} creators`
                          : 'Select at least 2 creators'}
                      </Link>
                    </div>
                  )}

                  {/* Filter chips — horizontally scrollable, no wrap */}
                  {!compareMode && followedCreators.length > 0 && (
                    <div className="flex overflow-x-auto gap-2 mb-2 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <FilterChip
                        active={selectedPlatform === 'all'}
                        onClick={() => setSelectedPlatform('all')}
                        label="All"
                        count={followedCreators.length}
                      />
                      {(['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'mastodon', 'rumble', 'substack']).map(p => {
                        if (!platformCounts[p]) return null;
                        const Icon = platformIcons[p];
                        return (
                          <FilterChip
                            key={p}
                            active={selectedPlatform === p}
                            onClick={() => setSelectedPlatform(p)}
                            label={PLATFORM_LABELS[p]}
                            count={platformCounts[p]}
                            platform={p}
                            icon={<Icon className={`w-3.5 h-3.5 ${selectedPlatform === p ? 'text-white' : platformColors[p].text}`} />}
                          />
                        );
                      })}
                      {liveCount > 0 && (
                        <FilterChip
                          active={selectedPlatform === 'live'}
                          onClick={() => setSelectedPlatform('live')}
                          label="Live Now"
                          count={liveCount}
                          icon={<span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                          live
                        />
                      )}
                    </div>
                  )}

                  {/* Toolbar row: sort + compare + export */}
                  {!compareMode && !loadingCreators && followedCreators.length > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="text-xs bg-neutral-100 border border-neutral-300 text-neutral-500 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-neutral-300 cursor-pointer"
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-700 hover:text-neutral-900 text-xs font-medium rounded-lg transition-colors"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            Compare
                          </button>
                        )}

                        <button
                          onClick={handleBulkExport}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Export CSV</span>
                          <span className="sm:hidden">Export</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Creator list */}
                  <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                    {loadingCreators ? (
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                      </div>
                    ) : sortedCreators.length === 0 ? (
                      <div className="text-center p-12">
                        {selectedPlatform === 'all' ? (
                          <>
                            <div className="w-14 h-14 bg-neutral-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                              <Star className="w-7 h-7 text-neutral-400" />
                            </div>
                            <p className="text-neutral-900 font-semibold mb-1">No creators followed yet</p>
                            <p className="text-neutral-500 text-sm mb-5">Find creators to follow and track their growth.</p>
                            <Link
                              to="/search"
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors text-sm"
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
                    ) : (
                      <div className="divide-y divide-neutral-200">
                        {sortedCreators.map(creator => {
                          const PlatformIcon = platformIcons[creator.platform] || Users;
                          const colors = platformColors[creator.platform] || { light: 'bg-neutral-50', text: 'text-neutral-500' };
                          const stats = creatorStats[creator.id];
                          const isLive = (creator.platform === 'twitch' || creator.platform === 'kick') && liveStreamers.has(creator.username.toLowerCase());
                          const growth = getGrowth(creator.id, creator.platform === 'youtube' ? 'subscribers' : 'followers');
                          const isSelected = selectedForCompare.includes(creator.id);
                          const metricLabel = METRIC_LABEL[creator.platform] || 'followers';

                          const rowContent = (
                            <div className="flex items-center gap-4 px-5 py-4">
                              {compareMode && (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-neutral-300 hover:border-indigo-400'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                              )}
                              <div className="relative flex-shrink-0">
                                <CreatorAvatar
                                  src={creator.profile_image}
                                  name={creator.display_name}
                                  size="lg"
                                  rounded="rounded-xl"
                                  className="!w-12 !h-12"
                                />
                                {/* Platform corner badge */}
                                <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-md ${colors.light} border-2 border-white flex items-center justify-center`}>
                                  <PlatformIcon className={`w-3 h-3 ${colors.text}`} />
                                </span>
                                {isLive && (
                                  <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-extrabold rounded uppercase tracking-wider ring-2 ring-white">
                                    Live
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-neutral-900 truncate text-sm sm:text-[15px]">{creator.display_name}</p>
                                <p className="text-xs text-neutral-500 mt-0.5 truncate">@{creator.username}</p>
                                {/* Mobile-only stats inline */}
                                <div className="sm:hidden mt-1.5 flex items-baseline gap-2">
                                  <span className="text-sm font-bold text-neutral-900 tabular-nums">
                                    {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
                                  </span>
                                  <span className="text-[10px] text-neutral-400 uppercase tracking-wide">{metricLabel}</span>
                                  {growth !== null && growth !== 0 && (
                                    <span className={`inline-flex items-center text-[11px] font-semibold tabular-nums ${growth > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {growth > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                                      {growth > 0 ? '+' : ''}{formatNumber(growth)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Desktop stats column */}
                              <div className="text-right hidden sm:flex flex-col items-end gap-0.5 min-w-[120px]">
                                <p className="text-base font-bold text-neutral-900 tabular-nums leading-none">
                                  {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
                                </p>
                                <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">{metricLabel}</p>
                                {growth !== null && growth !== 0 ? (
                                  <span className={`inline-flex items-center text-xs font-semibold tabular-nums mt-1 ${growth > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {growth > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                                    {growth > 0 ? '+' : ''}{formatNumber(growth)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-neutral-400 mt-1">{growth === 0 ? 'no change' : '–'}</span>
                                )}
                              </div>
                              {!compareMode && <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />}
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
                              className={`w-full text-left transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-neutral-50'} ${selectedForCompare.length >= 3 && !isSelected ? 'opacity-40' : ''}`}
                            >
                              {rowContent}
                            </button>
                          ) : (
                            <Link
                              key={creator.id}
                              to={`/${creator.platform}/${creator.username}`}
                              className="block hover:bg-neutral-50 transition-colors"
                            >
                              {rowContent}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SAVED COMPARES TAB ── */}
              {activeTab === 'compares' && (
                <div>
                  {loadingCompares ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                    </div>
                  ) : savedCompares.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
                      <div className="w-14 h-14 bg-neutral-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Scale className="w-7 h-7 text-neutral-400" />
                      </div>
                      <p className="text-neutral-900 font-semibold mb-1">No saved comparisons</p>
                      <p className="text-neutral-500 text-sm mb-5">Head to the Compare page, set up a comparison, and hit "Save comparison".</p>
                      <Link
                        to="/compare"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors text-sm"
                      >
                        <Scale className="w-4 h-4" />
                        Go to Compare
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-200 overflow-hidden">
                      {savedCompares.map(compare => {
                        const entries = compare.creators_param.split(',').map(e => {
                          const [platform, username] = e.split(':');
                          return { platform, username };
                        });
                        return (
                          <div key={compare.id} className="flex items-center gap-3 px-4 py-3.5 group hover:bg-neutral-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-neutral-900 text-sm mb-1.5">{compare.name}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {entries.map((e, i) => {
                                  const Icon = platformIcons[e.platform];
                                  const colors = platformColors[e.platform] || { light: 'bg-neutral-100', text: 'text-neutral-500' };
                                  return (
                                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors.light} ${colors.text}`}>
                                      {Icon && <Icon className="w-2.5 h-2.5" />}
                                      {e.username}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleDeleteCompare(compare.id)}
                                className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <Link
                                to={`/compare?creators=${compare.creators_param}`}
                                className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-600 transition-colors px-2"
                              >
                                Open <ChevronRight className="w-4 h-4" />
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
                    <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
                      <div className="w-14 h-14 bg-neutral-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Clock className="w-7 h-7 text-neutral-400" />
                      </div>
                      <p className="text-neutral-900 font-semibold mb-1">Nothing here yet</p>
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
                              className="p-2 rounded-lg bg-white border border-neutral-300 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-neutral-400">{Math.floor(recentlyViewedIndex / 8) + 1} / {Math.ceil(recentlyViewed.length / 8)}</span>
                            <button
                              onClick={() => setRecentlyViewedIndex(Math.min(recentlyViewed.length - 8, recentlyViewedIndex + 8))}
                              disabled={recentlyViewedIndex >= recentlyViewed.length - 8}
                              className="p-2 rounded-lg bg-white border border-neutral-300 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                              <ChevronRight className="w-4 h-4" />
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {recentlyViewed.slice(recentlyViewedIndex, recentlyViewedIndex + 8).map((creator, idx) => {
                          const PlatformIcon = platformIcons[creator.platform] || Users;
                          const colors = platformColors[creator.platform] || { light: 'bg-neutral-50', text: 'text-neutral-500' };
                          return (
                            <Link
                              key={`${creator.platform}-${creator.username}-${idx}`}
                              to={`/${creator.platform}/${creator.username}`}
                              className="bg-white rounded-2xl border border-neutral-200 p-4 hover:border-indigo-700/50 hover:bg-neutral-50 transition-all group"
                            >
                              <CreatorAvatar
                                src={creator.profileImage}
                                name={creator.displayName}
                                size="xl"
                                rounded="rounded-xl"
                                className="!w-14 !h-14 mx-auto mb-3"
                              />
                              <div className="text-center">
                                <p className="font-semibold text-neutral-900 text-sm truncate">{creator.displayName}</p>
                                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                                  <span className={`p-0.5 rounded ${colors.light}`}>
                                    <PlatformIcon className={`w-3 h-3 ${colors.text}`} />
                                  </span>
                                  <span className="text-xs text-neutral-500">
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
      </div>
    </>
  );
}

const CHIP_ACTIVE_STYLES = {
  youtube: 'bg-red-600 border-red-600 text-white shadow-lg',
  tiktok: 'bg-pink-600 border-pink-600 text-white shadow-lg',
  twitch: 'bg-purple-600 border-purple-600 text-white shadow-lg',
  kick: 'bg-green-600 border-green-600 text-white shadow-lg',
  bluesky: 'bg-sky-500 border-sky-500 text-white shadow-lg',
  mastodon: 'bg-violet-600 border-violet-600 text-white shadow-lg',
  rumble: 'bg-lime-600 border-lime-600 text-white shadow-lg',
  substack: 'bg-orange-600 border-orange-600 text-white shadow-lg',
};

function FilterChip({ active, onClick, label, count, icon, live, platform }) {
  const activeClass = live
    ? 'bg-red-50 border-red-700 text-red-600'
    : platform && CHIP_ACTIVE_STYLES[platform]
      ? CHIP_ACTIVE_STYLES[platform]
      : 'bg-indigo-600 border-indigo-600 text-white shadow-lg';

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
        active
          ? activeClass
          : 'bg-neutral-50 border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-300'
      }`}
    >
      {icon}
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
        active
          ? live ? 'bg-red-100 text-red-700' : 'bg-white/20 text-white'
          : 'bg-neutral-200 text-neutral-500'
      }`}>
        {count}
      </span>
    </button>
  );
}
