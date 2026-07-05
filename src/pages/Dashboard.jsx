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

// Dark-theme platform accents: tinted chip bg + readable 400-level text
const platformColors = {
  youtube:  { chip: 'bg-red-500/10 border-red-500/20',       text: 'text-red-400' },
  tiktok:   { chip: 'bg-pink-500/10 border-pink-500/20',     text: 'text-pink-400' },
  twitch:   { chip: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-400' },
  kick:     { chip: 'bg-green-500/10 border-green-500/20',   text: 'text-green-400' },
  bluesky:  { chip: 'bg-sky-500/10 border-sky-500/20',       text: 'text-sky-400' },
  mastodon: { chip: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-400' },
  rumble:   { chip: 'bg-lime-500/10 border-lime-500/20',     text: 'text-lime-400' },
  substack: { chip: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400' },
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
      <div className="min-h-screen bg-[#0a0a0f]">
        <DashboardSkeleton dark />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEO title="Dashboard" description="Track your followed creators and see their latest stats in one place." />
        <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
          <div className="pointer-events-none absolute -top-32 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute top-40 -right-24 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-3xl" />
          <div className="relative max-w-4xl mx-auto px-4 pt-20 pb-32">

            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-sm font-semibold mb-6">
                <Star className="w-3.5 h-3.5" />
                Free with an account
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-100 mb-4">
                Your Dashboard
              </h1>
              <p className="text-lg text-gray-400 max-w-xl mx-auto">
                Follow creators, track their stats, and see everything in one place. Free to sign up.
              </p>
            </div>

            {/* Blurred preview */}
            <div className="relative">
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0f]/60 backdrop-blur-sm rounded-2xl">
                <Lock className="w-10 h-10 text-indigo-400 mb-4" />
                <p className="text-lg font-semibold text-gray-100 mb-2">Sign in to continue</p>
                <p className="text-sm text-gray-400 mb-6 max-w-sm text-center">
                  Create a free account to follow creators and track their stats.
                </p>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to access your dashboard' } }))}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                >
                  Sign Up / Sign In
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Fake preview */}
              <div className="pointer-events-none select-none opacity-40">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="h-4 w-32 bg-gray-800 rounded" />
                      <div className="h-4 w-12 bg-gray-800 rounded-full" />
                    </div>
                    <div className="flex gap-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-3 w-20 bg-gray-800/60 rounded" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="flex border-b border-gray-800 px-4">
                    {['Following', 'Saved Compares', 'Recently Viewed'].map((t, i) => (
                      <div key={t} className={`px-4 py-3 text-sm font-medium ${i === 0 ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-600'}`}>{t}</div>
                    ))}
                  </div>
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40">
                        <div className="w-9 h-9 rounded-full bg-gray-800 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="h-3.5 w-28 bg-gray-800 rounded mb-1.5" />
                          <div className="h-3 w-16 bg-gray-800/60 rounded" />
                        </div>
                        <div className="h-4 w-16 bg-gray-800 rounded" />
                        <div className="h-4 w-14 bg-gray-800 rounded" />
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
                <div key={f} className="flex items-start gap-2.5 text-sm text-gray-400">
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-400" />
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

      <div className="min-h-screen bg-[#0a0a0f]">

        {/* Page header — dark hero strip with glow blobs */}
        <div className="relative overflow-hidden border-b border-gray-800/80">
          <div className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-indigo-600/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/4 w-80 h-80 rounded-full bg-fuchsia-600/10 blur-3xl" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">Dashboard</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-100">
              Welcome back{displayName ? (
                <>, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-400">{displayName}</span></>
              ) : ''}.
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-400">
              Track creators you follow, see who's live, and revisit your saved comparisons.
            </p>
            {liveCount > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-red-400">
                  {liveCount} creator{liveCount !== 1 ? 's' : ''} live right now
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Quick stats grid — 3 KPI cards, dark card pattern with glow blobs */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
            {[
              { label: 'Following', value: followedCreators.length, Icon: Star, accent: 'indigo', ghost: '01', gradient: 'from-indigo-500 to-purple-600' },
              { label: 'Live now',  value: liveCount,                Icon: Radio, accent: 'red',   ghost: '02', gradient: 'from-red-500 to-rose-600' },
              { label: 'Saved',     value: savedCompares.length,     Icon: Scale, accent: 'violet', ghost: '03', gradient: 'from-violet-500 to-fuchsia-600' },
            ].map(({ label, value, Icon, accent, ghost, gradient }) => {
              const accentMap = {
                indigo: { blob: 'bg-indigo-500/10 group-hover:bg-indigo-500/20', border: 'hover:border-indigo-500/60', shadow: 'hover:shadow-indigo-500/10', icon: 'shadow-indigo-500/30' },
                red:    { blob: 'bg-red-500/10 group-hover:bg-red-500/20',       border: 'hover:border-red-500/60',    shadow: 'hover:shadow-red-500/10',    icon: 'shadow-red-500/30' },
                violet: { blob: 'bg-violet-500/10 group-hover:bg-violet-500/20', border: 'hover:border-violet-500/60', shadow: 'hover:shadow-violet-500/10', icon: 'shadow-violet-500/30' },
              };
              const a = accentMap[accent];
              return (
                <div
                  key={label}
                  className={`group relative overflow-hidden bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 transition-all duration-300 ${a.border} hover:-translate-y-1 hover:shadow-2xl ${a.shadow}`}
                >
                  <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl transition-colors duration-500 ${a.blob}`} />
                  <span className="absolute top-4 right-5 text-2xl sm:text-3xl font-black text-gray-800 select-none">{ghost}</span>
                  <div className="relative">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center shadow-lg ${a.icon} group-hover:scale-105 transition-transform duration-300 mb-3`}>
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <p className="text-2xl sm:text-3xl font-extrabold text-gray-100 tabular-nums leading-none">
                      <CountUp value={value} format="comma" />
                    </p>
                    <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500 mt-1.5">{label}</p>
                  </div>
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
                          ? 'bg-gray-800 text-gray-100'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-400' : ''}`} />
                      <span className="flex-1">{tab.label}</span>
                      {tab.count > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                          isActive ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-800 text-gray-500'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-6 pt-5 border-t border-gray-800 space-y-0.5">
                <Link
                  to="/account"
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-all"
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  Account Settings
                </Link>
              </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">

              {/* Mobile tabs — fixed 3-column segmented control */}
              <div className="flex md:hidden mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1">
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
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{tab.shortLabel}</span>
                      {tab.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                          isActive ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-500'
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
                    <div className="mb-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Scale className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          <span className="text-sm font-semibold text-indigo-400">Compare mode</span>
                          <span className="text-xs text-indigo-300/80 font-medium">({selectedForCompare.length}/3)</span>
                        </div>
                        <button
                          onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-indigo-300/60 mb-3">Tap creators from the list to select them</p>
                      <Link
                        to={`/compare?creators=${selectedForCompare.map(id => {
                          const c = followedCreators.find(fc => fc.id === id);
                          return c ? `${c.platform}:${c.username}` : '';
                        }).filter(Boolean).join(',')}`}
                        onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                        className={`flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                          selectedForCompare.length >= 2
                            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                            : 'bg-gray-800 text-gray-500 pointer-events-none'
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
                        className="text-xs bg-gray-900 border border-gray-700 text-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-600 cursor-pointer"
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-gray-100 text-xs font-medium rounded-lg transition-colors"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            Compare
                          </button>
                        )}

                        <button
                          onClick={handleBulkExport}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Export CSV</span>
                          <span className="sm:hidden">Export</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Creator list */}
                  <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                    {loadingCreators ? (
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                      </div>
                    ) : sortedCreators.length === 0 ? (
                      <div className="text-center p-12">
                        {selectedPlatform === 'all' ? (
                          <>
                            <div className="w-14 h-14 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                              <Star className="w-7 h-7 text-gray-600" />
                            </div>
                            <p className="text-gray-100 font-semibold mb-1">No creators followed yet</p>
                            <p className="text-gray-500 text-sm mb-5">Find creators to follow and track their growth.</p>
                            <Link
                              to="/search"
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors text-sm"
                            >
                              Find Creators
                            </Link>
                          </>
                        ) : (
                          <p className="text-gray-500 text-sm">
                            {selectedPlatform === 'live' ? 'No one is live right now.' : `No ${PLATFORM_LABELS[selectedPlatform]} creators followed.`}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-800">
                        {sortedCreators.map(creator => {
                          const PlatformIcon = platformIcons[creator.platform] || Users;
                          const colors = platformColors[creator.platform] || { chip: 'bg-gray-800 border-gray-700', text: 'text-gray-400' };
                          const stats = creatorStats[creator.id];
                          const isLive = (creator.platform === 'twitch' || creator.platform === 'kick') && liveStreamers.has(creator.username.toLowerCase());
                          const growth = getGrowth(creator.id, creator.platform === 'youtube' ? 'subscribers' : 'followers');
                          const isSelected = selectedForCompare.includes(creator.id);
                          const metricLabel = METRIC_LABEL[creator.platform] || 'followers';

                          const rowContent = (
                            <div className="flex items-center gap-4 px-5 py-4">
                              {compareMode && (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 hover:border-indigo-400'
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
                                <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-md border ${colors.chip} ring-2 ring-gray-900 flex items-center justify-center backdrop-blur-sm bg-gray-900`}>
                                  <PlatformIcon className={`w-3 h-3 ${colors.text}`} />
                                </span>
                                {isLive && (
                                  <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-extrabold rounded uppercase tracking-wider ring-2 ring-gray-900 shadow-lg shadow-red-500/40">
                                    Live
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-100 truncate text-sm sm:text-[15px]">{creator.display_name}</p>
                                <p className="text-xs text-gray-500 mt-0.5 truncate">@{creator.username}</p>
                                {/* Mobile-only stats inline */}
                                <div className="sm:hidden mt-1.5 flex items-baseline gap-2">
                                  <span className="text-sm font-bold text-gray-100 tabular-nums">
                                    {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
                                  </span>
                                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">{metricLabel}</span>
                                  {growth !== null && growth !== 0 && (
                                    <span className={`inline-flex items-center text-[11px] font-semibold tabular-nums ${growth > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {growth > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                                      {growth > 0 ? '+' : ''}{formatNumber(growth)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Desktop stats column */}
                              <div className="text-right hidden sm:flex flex-col items-end gap-0.5 min-w-[120px]">
                                <p className="text-base font-bold text-gray-100 tabular-nums leading-none">
                                  {stats?.current ? formatNumber(stats.current.subscribers || stats.current.followers) : '–'}
                                </p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{metricLabel}</p>
                                {growth !== null && growth !== 0 ? (
                                  <span className={`inline-flex items-center text-xs font-semibold tabular-nums mt-1 ${growth > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {growth > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                                    {growth > 0 ? '+' : ''}{formatNumber(growth)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-600 mt-1">{growth === 0 ? 'no change' : '–'}</span>
                                )}
                              </div>
                              {!compareMode && <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />}
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
                              className={`w-full text-left transition-colors ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-gray-800/50'} ${selectedForCompare.length >= 3 && !isSelected ? 'opacity-40' : ''}`}
                            >
                              {rowContent}
                            </button>
                          ) : (
                            <Link
                              key={creator.id}
                              to={`/${creator.platform}/${creator.username}`}
                              className="block hover:bg-gray-800/50 transition-colors"
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
                      <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                    </div>
                  ) : savedCompares.length === 0 ? (
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-12 text-center">
                      <div className="w-14 h-14 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Scale className="w-7 h-7 text-gray-600" />
                      </div>
                      <p className="text-gray-100 font-semibold mb-1">No saved comparisons</p>
                      <p className="text-gray-500 text-sm mb-5">Head to the Compare page, set up a comparison, and hit "Save comparison".</p>
                      <Link
                        to="/compare"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors text-sm"
                      >
                        <Scale className="w-4 h-4" />
                        Go to Compare
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
                      {savedCompares.map(compare => {
                        const entries = compare.creators_param.split(',').map(e => {
                          const [platform, username] = e.split(':');
                          return { platform, username };
                        });
                        return (
                          <div key={compare.id} className="flex items-center gap-3 px-4 py-3.5 group hover:bg-gray-800/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-100 text-sm mb-1.5">{compare.name}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {entries.map((e, i) => {
                                  const Icon = platformIcons[e.platform];
                                  const colors = platformColors[e.platform] || { chip: 'bg-gray-800 border-gray-700', text: 'text-gray-400' };
                                  return (
                                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${colors.chip} ${colors.text}`}>
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
                                className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <Link
                                to={`/compare?creators=${compare.creators_param}`}
                                className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors px-2"
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
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-12 text-center">
                      <div className="w-14 h-14 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Clock className="w-7 h-7 text-gray-600" />
                      </div>
                      <p className="text-gray-100 font-semibold mb-1">Nothing here yet</p>
                      <p className="text-gray-500 text-sm">Creators you visit will show up here.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        {recentlyViewed.length > 8 ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setRecentlyViewedIndex(Math.max(0, recentlyViewedIndex - 8))}
                              disabled={recentlyViewedIndex === 0}
                              className="p-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-gray-500">{Math.floor(recentlyViewedIndex / 8) + 1} / {Math.ceil(recentlyViewed.length / 8)}</span>
                            <button
                              onClick={() => setRecentlyViewedIndex(Math.min(recentlyViewed.length - 8, recentlyViewedIndex + 8))}
                              disabled={recentlyViewedIndex >= recentlyViewed.length - 8}
                              className="p-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        ) : <div />}
                        <button
                          onClick={handleClearHistory}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {recentlyViewed.slice(recentlyViewedIndex, recentlyViewedIndex + 8).map((creator, idx) => {
                          const PlatformIcon = platformIcons[creator.platform] || Users;
                          const colors = platformColors[creator.platform] || { chip: 'bg-gray-800 border-gray-700', text: 'text-gray-400' };
                          return (
                            <Link
                              key={`${creator.platform}-${creator.username}-${idx}`}
                              to={`/${creator.platform}/${creator.username}`}
                              className="group bg-gray-900 rounded-2xl border border-gray-800 p-4 hover:border-indigo-500/60 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300"
                            >
                              <CreatorAvatar
                                src={creator.profileImage}
                                name={creator.displayName}
                                size="xl"
                                rounded="rounded-xl"
                                className="!w-14 !h-14 mx-auto mb-3 group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="text-center">
                                <p className="font-semibold text-gray-100 text-sm truncate">{creator.displayName}</p>
                                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                                  <span className={`p-0.5 rounded border ${colors.chip}`}>
                                    <PlatformIcon className={`w-3 h-3 ${colors.text}`} />
                                  </span>
                                  <span className="text-xs text-gray-500">
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
  youtube: 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-500/20',
  tiktok: 'bg-pink-600 border-pink-600 text-white shadow-lg shadow-pink-500/20',
  twitch: 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/20',
  kick: 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-500/20',
  bluesky: 'bg-sky-500 border-sky-500 text-white shadow-lg shadow-sky-500/20',
  mastodon: 'bg-violet-600 border-violet-600 text-white shadow-lg shadow-violet-500/20',
  rumble: 'bg-lime-600 border-lime-600 text-white shadow-lg shadow-lime-500/20',
  substack: 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-500/20',
};

function FilterChip({ active, onClick, label, count, icon, live, platform }) {
  const activeClass = live
    ? 'bg-red-500/15 border-red-500/40 text-red-400'
    : platform && CHIP_ACTIVE_STYLES[platform]
      ? CHIP_ACTIVE_STYLES[platform]
      : 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20';

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
        active
          ? activeClass
          : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
      }`}
    >
      {icon}
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
        active
          ? live ? 'bg-red-500/20 text-red-400' : 'bg-white/20 text-white'
          : 'bg-gray-800 text-gray-500'
      }`}>
        {count}
      </span>
    </button>
  );
}
