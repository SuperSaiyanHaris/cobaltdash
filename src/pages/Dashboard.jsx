import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Twitch, Star, Users, Loader2,
  Scale, Clock, ChevronRight, ChevronLeft, Check, X, Trash2,
  Download, Lock, Settings,
} from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
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
  twitch: Twitch,
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
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
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

    const csvStr = '﻿' + lines.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shinypull-creator-report-${exportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

        {/* Page header — big bold title, live badge */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 flex items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
                Welcome back{displayName ? `, ${displayName}` : ''}.
              </h1>
              <p className="mt-2 text-sm text-neutral-500">
                Track creators you follow, see who's live, and revisit your saved comparisons.
              </p>
            </div>
            {liveCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 pb-1 flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-red-600 tabular-nums tracking-wide">{liveCount} LIVE</span>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Stat card — one unified card, hairline-divided cells */}
          <div className={`grid grid-cols-3 divide-x divide-neutral-200/80 ${CARD} mb-6`}>
            {[
              { label: 'Following', value: followedCreators.length, live: false },
              { label: 'Live now', value: liveCount, live: true },
              { label: 'Saved compares', value: savedCompares.length, live: false },
            ].map(({ label, value, live }) => (
              <div key={label} className="px-5 py-4 sm:px-6 sm:py-5">
                <p className={MICRO}>{label}</p>
                <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-neutral-900 tabular-nums leading-none flex items-center gap-2.5">
                  {formatNumber(value)}
                  {live && value > 0 && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse mt-0.5" />}
                </p>
              </div>
            ))}
          </div>

          {/* Pill tab nav — one responsive row */}
          <div className="flex items-center gap-1.5 mb-6">
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                      isActive
                        ? 'bg-neutral-900 border-neutral-900 text-white'
                        : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span className={`text-xs tabular-nums ${isActive ? 'text-neutral-400' : 'text-neutral-400'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex-1" />
            <Link
              to="/account"
              className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-full text-sm text-neutral-400 hover:text-neutral-900 transition-colors"
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
                          <span className="text-xs text-neutral-400 tabular-nums">{selectedForCompare.length}/3 selected</span>
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

                  {/* Filter chips */}
                  {!compareMode && followedCreators.length > 0 && (
                    <div className="flex overflow-x-auto gap-1.5 mb-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                            icon={<Icon className={`w-3.5 h-3.5 ${selectedPlatform === p ? 'text-white' : platformTint[p]}`} />}
                          />
                        );
                      })}
                      {liveCount > 0 && (
                        <FilterChip
                          active={selectedPlatform === 'live'}
                          onClick={() => setSelectedPlatform('live')}
                          label="Live"
                          count={liveCount}
                          icon={<span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
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
                        className="text-xs bg-white border border-neutral-200 text-neutral-600 rounded-md px-2 py-1.5 focus:outline-none focus:border-neutral-400 cursor-pointer"
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 text-xs rounded-md transition-colors"
                          >
                            <Scale className="w-3 h-3" />
                            Compare
                          </button>
                        )}

                        <button
                          onClick={handleBulkExport}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 text-xs rounded-md transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span className="hidden sm:inline">Export CSV</span>
                          <span className="sm:hidden">Export</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Creator list */}
                  <div className={`${CARD} overflow-hidden`}>
                    {loadingCreators ? (
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
                      </div>
                    ) : sortedCreators.length === 0 ? (
                      <div className="text-center p-14">
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
                    ) : (
                      <div className="divide-y divide-neutral-100">
                        {sortedCreators.map(creator => {
                          const PlatformIcon = platformIcons[creator.platform] || Users;
                          const tint = platformTint[creator.platform] || 'text-neutral-400';
                          const stats = creatorStats[creator.id];
                          const isLive = (creator.platform === 'twitch' || creator.platform === 'kick') && liveStreamers.has(creator.username.toLowerCase());
                          const growth = getGrowth(creator.id, creator.platform === 'youtube' ? 'subscribers' : 'followers');
                          const isSelected = selectedForCompare.includes(creator.id);
                          const metricLabel = METRIC_LABEL[creator.platform] || 'followers';

                          const rowContent = (
                            <div className="flex items-center gap-3.5 px-4 py-3.5">
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
                                className="!w-10 !h-10 flex-shrink-0"
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
                                  <p className="text-xs text-neutral-400 truncate">@{creator.username}</p>
                                </div>
                                {/* Mobile-only stats inline */}
                                <div className="sm:hidden mt-1.5 flex items-baseline gap-2">
                                  <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                                    {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
                                  </span>
                                  <span className={MICRO}>{metricLabel}</span>
                                  {growth !== null && growth !== 0 && (
                                    <span className={`text-[11px] font-medium tabular-nums ${growth > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {growth > 0 ? '+' : ''}{formatNumber(growth)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Desktop stats column */}
                              <div className="text-right hidden sm:block min-w-[120px]">
                                <div className="flex items-baseline justify-end gap-2">
                                  <p className="text-[15px] font-semibold text-neutral-900 tabular-nums leading-none">
                                    {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
                                  </p>
                                  <p className={MICRO}>{metricLabel}</p>
                                </div>
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
                              className={`w-full text-left transition-colors ${isSelected ? 'bg-neutral-50' : 'hover:bg-neutral-50'} ${selectedForCompare.length >= 3 && !isSelected ? 'opacity-40' : ''}`}
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
                            <span className="text-xs text-neutral-400 tabular-nums">{Math.floor(recentlyViewedIndex / 8) + 1} / {Math.ceil(recentlyViewed.length / 8)}</span>
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
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
                                  <span className="text-xs text-neutral-400 tabular-nums">
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

function FilterChip({ active, onClick, label, count, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium transition-colors border ${
        active
          ? 'bg-neutral-900 border-neutral-900 text-white'
          : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
      }`}
    >
      {icon}
      {label}
      <span className={`text-xs tabular-nums ${active ? 'text-neutral-400' : 'text-neutral-400'}`}>
        {count}
      </span>
    </button>
  );
}
