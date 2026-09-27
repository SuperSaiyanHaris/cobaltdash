import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Loader2, Scale, ChevronRight, Check, X, Trash2,
  Settings, TrendingUp, Search, LayoutGrid, List, Flame, Gift, SlidersHorizontal,
} from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import SubstackIcon from '../components/SubstackIcon';
import MusicIcon from '../components/MusicIcon';
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
import { PLATFORM_IDS, PLATFORM_DISPLAY_NAMES, isActivePlatform } from '../lib/constants';
import { cardImageUrl } from '../lib/cardUrl';
import { formatNumber } from '../lib/utils';
import logger from '../lib/logger';
import { useProgress, loadProgress } from '../services/progressService';
import { UserCardSvg } from '../components/pass/PassArt';

/**
 * Dashboard, redesigned 2026-09-25 as "your collection": a dark band with a
 * fanned hand of the cards you follow and who's live, then light content
 * with high-contrast pill tabs. Following is a binder of holographic cards
 * (or a list), saved compares and recently viewed are shown as cards too.
 * No faint gray text or buttons: labels are neutral-600 at the lightest.
 */

const platformIcons = {
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  twitch: TwitchIcon,
  kick: KickIcon,
  bluesky: BlueskyIcon,
  music: MusicIcon,
  mastodon: MastodonIcon,
  substack: SubstackIcon,
};

const platformTint = {
  youtube: 'text-red-500',
  tiktok: 'text-neutral-900',
  twitch: 'text-purple-500',
  kick: 'text-green-600',
  bluesky: 'text-sky-500',
  music: 'text-amber-500',
  mastodon: 'text-violet-500',
  substack: 'text-orange-500',
};

const METRIC_LABEL = {
  youtube: 'subs',
  tiktok: 'followers',
  twitch: 'followers',
  kick: 'paid subs',
  bluesky: 'followers',
  music: 'listeners',
  mastodon: 'followers',
  substack: 'subscribers',
};

const VIEW_KEY = 'sp-dashboard-view';
const SORTS = [
  { id: 'live', label: 'Live first' },
  { id: 'growth', label: 'Top growth today' },
  { id: 'followers', label: 'Most followed' },
  { id: 'name', label: 'Name A-Z' },
];
const CARD_RADIUS = 'rounded-[6.4%/4.571%]';
const PANEL = 'bg-white border border-neutral-200 rounded-2xl';
const SAMPLE_HAND = [
  { platform: 'twitch', username: 'kaicenat' },
  { platform: 'tiktok', username: 'charlidamelio' },
  { platform: 'youtube', username: 'mrbeast' },
  { platform: 'music', username: 'coldplay' },
  { platform: 'kick', username: 'adinross' },
];

const isStreamer = (c) => c.platform === 'twitch' || c.platform === 'kick';
const primaryField = (c) => (c.platform === 'youtube' ? 'subscribers' : 'followers');

function DotGrid() {
  return <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />;
}

/**
 * A fanned hand of up to five cards. Rotated cards are the markless render
 * (platform logos may not be shown rotated).
 */
function CardHand({ cards }) {
  const hand = cards.slice(0, 5);
  const n = hand.length;
  if (!n) return null;
  const mid = (n - 1) / 2;
  return (
    <div aria-hidden="true" className="relative h-[210px] sm:h-[260px] w-full max-w-[420px] mx-auto">
      {hand.map((c, i) => {
        const off = i - mid;
        return (
          <img
            key={`${c.platform}/${c.username}`}
            src={cardImageUrl(c.platform, c.username, { mark: false })}
            alt=""
            width="250"
            height="350"
            draggable="false"
            onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className={`absolute left-1/2 bottom-0 w-[120px] sm:w-[150px] h-auto ${CARD_RADIUS} select-none opacity-0 transition-opacity duration-500 shadow-[0_24px_40px_-14px_rgba(0,0,0,0.85)]`}
            style={{
              transform: `translateX(calc(-50% + ${off * 46}px)) translateY(${Math.abs(off) * 10}px) rotate(${off * 8}deg)`,
              transformOrigin: '50% 120%',
              zIndex: 10 - Math.abs(Math.round(off)),
            }}
          />
        );
      })}
    </div>
  );
}

function FilterRow({ active, onClick, children, count }) {
  return (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 px-3 h-11 rounded-xl text-left text-[15px] font-semibold transition-colors ${active ? 'bg-neutral-900 text-white' : 'text-neutral-900 hover:bg-neutral-100'}`}>
      <span className="flex-1 flex items-center gap-2 min-w-0">{children}</span>
      {count !== undefined && <span className={`tabular-nums text-sm ${active ? 'text-white/80' : 'text-neutral-600'}`}>{count}</span>}
      {active && <Check className="w-4 h-4" />}
    </button>
  );
}

/**
 * Platform + sort in one place: a bottom sheet on phones, a popover under
 * the Filter button on larger screens.
 */
function FilterPanel({ onClose, selectedPlatform, setSelectedPlatform, sortBy, setSortBy, platformCounts, total, liveCount }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (window.innerWidth >= 640 && ref.current && !ref.current.contains(e.target) && !e.target.closest('[aria-label="Filter and sort"]')) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);


  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 sm:hidden" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-label="Filter and sort"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.35)]
          sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-12 sm:w-80 sm:rounded-2xl sm:border sm:border-neutral-200 sm:p-3 sm:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.3)]"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" />
        <p className="px-3 pt-1 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-neutral-600">Show</p>
        <FilterRow active={selectedPlatform === 'all'} onClick={() => setSelectedPlatform('all')} count={total}>All creators</FilterRow>
        {liveCount > 0 && (
          <FilterRow active={selectedPlatform === 'live'} onClick={() => setSelectedPlatform('live')} count={liveCount}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live now
          </FilterRow>
        )}
        {PLATFORM_IDS.filter((p) => platformCounts[p]).map((p) => {
          const Icon = platformIcons[p];
          const active = selectedPlatform === p;
          return (
            <FilterRow key={p} active={active} onClick={() => setSelectedPlatform(p)} count={platformCounts[p]}>
              {Icon && <Icon className={`w-4 h-4 ${active ? 'text-white' : platformTint[p]}`} />}{PLATFORM_DISPLAY_NAMES[p]}
            </FilterRow>
          );
        })}
        <p className="px-3 pt-4 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-neutral-600">Sort</p>
        {SORTS.map((o) => <FilterRow key={o.id} active={sortBy === o.id} onClick={() => setSortBy(o.id)}>{o.label}</FilterRow>)}
        <div className="mt-4 flex gap-2 sm:hidden">
          <button onClick={() => { setSelectedPlatform('all'); setSortBy('live'); }} className="flex-1 h-12 rounded-xl border border-neutral-300 text-[15px] font-bold text-neutral-900">Reset</button>
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-neutral-900 text-white text-[15px] font-bold">Done</button>
        </div>
      </div>
    </>
  );
}

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
  const [filterOpen, setFilterOpen] = useState(false);
  const passState = useProgress();
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'; } catch { return 'cards'; }
  });
  const changeView = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to access your dashboard' },
      }));
    }
  }, [user, authLoading]);

  async function loadFollowedCreators() {
    setLoadingCreators(true);
    try {
      const all = await getFollowedCreators(user.id);
      const creators = all.filter((c) => isActivePlatform(c.platform));
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

  useEffect(() => {
    if (user) {
      loadFollowedCreators();
      loadSavedCompares();
      loadProgress().catch(() => {});
    }
    setRecentlyViewed(getRecentlyViewed().filter((c) => isActivePlatform(c.platform)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
  }

  const getGrowth = (creatorId, field) => {
    const stat = creatorStats[creatorId];
    if (!stat?.current || !stat?.previous) return null;
    return (stat.current[field] || 0) - (stat.previous[field] || 0);
  };
  const countOf = (c) => creatorStats[c.id]?.current?.subscribers || creatorStats[c.id]?.current?.followers || 0;
  const isLive = (c) => isStreamer(c) && liveStreamers.has(c.username.toLowerCase());

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9]">
        <SEO title="Loading..." />
        <DashboardSkeleton />
      </div>
    );
  }

  if (!user) {
    const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to access your dashboard' } }));
    return (
      <>
        <SEO title="Dashboard" description="Follow creators, track their numbers every day, and keep your matchups in one place." />
        <div className="min-h-screen bg-[#fafaf9]">
          <section className="relative isolate overflow-hidden bg-[#0a0a0f] text-white">
            <DotGrid />
            <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
              <div className="text-center lg:text-left">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Free with an account</p>
                <h1 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-balance">Build your creator collection.</h1>
                <p className="mt-5 text-base sm:text-lg text-white/70 max-w-lg mx-auto lg:mx-0 text-pretty">
                  Follow any creator and their card lands in your collection, with their numbers, daily moves and live status in one place.
                </p>
                <button
                  onClick={openAuth}
                  className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors"
                >
                  Start your collection <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <CardHand cards={SAMPLE_HAND} />
            </div>
          </section>
          <div className="max-w-4xl mx-auto px-4 py-14 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
            {[
              'Follow creators on every platform',
              'See who gained or lost followers today',
              'Know the moment a streamer goes live',
              'Save matchups and reopen them anytime',
              'Pick creators straight into Compare',
              'Free, no credit card',
            ].map(f => (
              <div key={f} className="flex items-start gap-3 text-[15px] font-medium text-neutral-800">
                <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-neutral-900 flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';

  const liveCreatorsList = followedCreators.filter(isLive).sort((a, b) => countOf(b) - countOf(a));
  const liveCount = liveCreatorsList.length;

  const platformCounts = Object.fromEntries(PLATFORM_IDS.map((p) => [p, followedCreators.filter(c => c.platform === p).length]));

  const filteredCreators = selectedPlatform === 'all'
    ? followedCreators
    : selectedPlatform === 'live'
    ? liveCreatorsList
    : followedCreators.filter(c => c.platform === selectedPlatform);

  const sortedCreators = [...filteredCreators].sort((a, b) => {
    if (sortBy === 'live') {
      const d = (isLive(b) ? 1 : 0) - (isLive(a) ? 1 : 0);
      return d || countOf(b) - countOf(a);
    }
    if (sortBy === 'growth') {
      return (getGrowth(b.id, primaryField(b)) ?? -Infinity) - (getGrowth(a.id, primaryField(a)) ?? -Infinity);
    }
    if (sortBy === 'followers') return countOf(b) - countOf(a);
    if (sortBy === 'name') return (a.display_name || a.username).localeCompare(b.display_name || b.username);
    return 0;
  });

  const topMover = followedCreators
    .map(c => ({ c, g: getGrowth(c.id, primaryField(c)) }))
    .filter(x => x.g !== null && x.g > 0)
    .sort((a, b) => b.g - a.g)[0] || null;


  const toggleSelect = (id) => {
    setSelectedForCompare(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length < 3 ? [...prev, id] : prev);
  };
  const compareHref = `/compare?creators=${selectedForCompare.map(id => {
    const c = followedCreators.find(fc => fc.id === id);
    return c ? `${c.platform}:${c.username}` : '';
  }).filter(Boolean).join(',')}`;

  const growthLine = (c, dark = false) => {
    const g = getGrowth(c.id, primaryField(c));
    if (g === null) return <span className={dark ? 'text-white/50' : 'text-neutral-600'}>No change yet</span>;
    if (g === 0) return <span className={dark ? 'text-white/60' : 'text-neutral-600'}>No change today</span>;
    return (
      <span className={g > 0 ? (dark ? 'text-emerald-400' : 'text-emerald-700') : (dark ? 'text-red-400' : 'text-red-600')}>
        {g > 0 ? '+' : ''}{formatNumber(g)} today
      </span>
    );
  };

  /* One creator in the binder: their upright card (with logo), live badge,
     today's move. In compare mode the card becomes a toggle. */
  const renderCardTile = (creator) => {
    const selected = selectedForCompare.includes(creator.id);
    const full = selectedForCompare.length >= 3 && !selected;
    const live = isLive(creator);
    const inner = (
      <>
        <div className="relative">
          <img
            src={cardImageUrl(creator.platform, creator.username)}
            alt={`${creator.display_name} card`}
            width="250"
            height="350"
            loading="lazy"
            draggable="false"
            onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
            className={`w-full h-auto ${CARD_RADIUS} select-none bg-[#15151c] opacity-0 transition-opacity duration-500 shadow-[0_14px_28px_-14px_rgba(0,0,0,0.55)] ${selected ? 'ring-4 ring-neutral-900 ring-offset-2 ring-offset-[#fafaf9]' : ''}`}
          />
          {live && (
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
            </span>
          )}
          {compareMode && (
            <span className={`absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full border-2 ${selected ? 'bg-neutral-900 border-white' : 'bg-white/90 border-neutral-300'}`}>
              {selected && <Check className="w-4 h-4 text-white" />}
            </span>
          )}
        </div>
        <p className="mt-2.5 text-center text-xs font-semibold tabular-nums">{growthLine(creator)}</p>
      </>
    );
    return compareMode ? (
      <button key={creator.id} type="button" onClick={() => toggleSelect(creator.id)} disabled={full} className={`block text-left ${full ? 'opacity-40' : ''}`}>
        {inner}
      </button>
    ) : (
      <Link key={creator.id} to={`/${creator.platform}/${creator.username}`} className="block">
        {inner}
      </Link>
    );
  };

  const renderRow = (creator) => {
    const PlatformIcon = platformIcons[creator.platform] || Users;
    const selected = selectedForCompare.includes(creator.id);
    const full = selectedForCompare.length >= 3 && !selected;
    const live = isLive(creator);
    const inner = (
      <div className="flex items-center gap-3.5">
        {compareMode && (
          <span className={`flex items-center justify-center w-5 h-5 rounded-full border-2 flex-shrink-0 ${selected ? 'bg-neutral-900 border-neutral-900' : 'border-neutral-400'}`}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </span>
        )}
        <CreatorAvatar src={creator.profile_image} name={creator.display_name} size="lg" rounded="rounded-xl" className="!w-10 !h-10 sm:!w-12 sm:!h-12 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-neutral-900 truncate text-[15px]">{creator.display_name}</p>
            {live && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 mt-0.5 text-sm text-neutral-600 min-w-0">
            <PlatformIcon className={`w-3.5 h-3.5 flex-shrink-0 ${platformTint[creator.platform]}`} />
            <span className="truncate">@{creator.username}</span>
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base sm:text-lg font-extrabold text-neutral-900 tabular-nums leading-none">{creatorStats[creator.id]?.current ? formatNumber(countOf(creator)) : '-'}</p>
          <p className="hidden sm:block mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-600">{METRIC_LABEL[creator.platform] || 'followers'}</p>
          <p className="mt-1 text-xs font-semibold tabular-nums">{growthLine(creator)}</p>
        </div>
      </div>
    );
    const cls = `block w-full text-left ${PANEL} px-3.5 py-3 sm:p-4 transition-colors ${selected ? 'border-neutral-900 ring-1 ring-neutral-900' : 'hover:border-neutral-400'} ${full ? 'opacity-40' : ''}`;
    return compareMode ? (
      <button key={creator.id} type="button" onClick={() => toggleSelect(creator.id)} disabled={full} className={cls}>{inner}</button>
    ) : (
      <Link key={creator.id} to={`/${creator.platform}/${creator.username}`} className={cls}>{inner}</Link>
    );
  };

  const renderCollection = (list) => view === 'cards' ? (
    <div className="grid grid-cols-2 min-[520px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 sm:gap-x-4 gap-y-6 sm:gap-y-7">
      {list.map(renderCardTile)}
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
      {list.map(renderRow)}
    </div>
  );

  const tabs = [
    { id: 'following', label: 'Following', count: followedCreators.length },
    { id: 'compares', label: 'Matchups', count: savedCompares.length },
    { id: 'recent', label: 'Recent', count: recentlyViewed.length },
  ];

  const activeFilters = [
    selectedPlatform !== 'all' && { key: 'platform', label: selectedPlatform === 'live' ? 'Live now' : PLATFORM_DISPLAY_NAMES[selectedPlatform], clear: () => setSelectedPlatform('all') },
    sortBy !== 'live' && { key: 'sort', label: SORTS.find((x) => x.id === sortBy)?.label, clear: () => setSortBy('live') },
  ].filter(Boolean);
  const iconBtn = (active = false) => `inline-flex items-center justify-center gap-2 h-10 min-w-10 px-3 rounded-xl text-sm font-bold transition-colors ${
    active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900 border border-neutral-300 hover:border-neutral-900'
  }`;

  const pass = passState?.progress;
  const passMe = passState && { handle: passState.handle || 'you', avatar: passState.avatar || user.user_metadata?.avatar_url || null, ...pass, seasonNumber: passState.season?.number };
  const packReady = passState?.packs?.available?.[0];

  return (
    <>
      <SEO title="My Dashboard" description="Track your favorite creators and see their latest statistics." />

      <div className="min-h-screen bg-[#fafaf9]">

        {/* ── Dark band: you, your card, today ── */}
        <section className="relative isolate z-20 bg-[#0a0a0f] text-white">
          <DotGrid />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-7 sm:pt-12 pb-8 sm:pb-12 flex items-center gap-5 sm:gap-10">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Your collection</p>
              <h1 className="mt-2 text-[26px] leading-[1.1] sm:text-5xl font-extrabold tracking-tight text-balance break-words">
                Welcome back, {passState?.handle ? `@${passState.handle}` : displayName}.
              </h1>

              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-[15px] font-semibold text-white/80 tabular-nums">
                <span>{followedCreators.length} following</span>
                <span aria-hidden="true" className="text-white/35">·</span>
                <span className="inline-flex items-center gap-1.5">
                  {liveCount > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}{liveCount} live now
                </span>
                <span aria-hidden="true" className="text-white/35">·</span>
                <span>{savedCompares.length} saved matchups</span>
              </p>

              {/* ShinyPass strip */}
              {pass && (
                <Link to="/pass" className="group mt-5 sm:mt-6 flex items-center gap-3 sm:gap-4 max-w-md rounded-2xl border border-white/10 bg-white/[0.05] hover:border-white/35 px-3.5 sm:px-4 py-3 transition-colors">
                  {passMe && <span className="min-[400px]:hidden w-11 flex-shrink-0 -my-1 rotate-[-4deg]"><UserCardSvg me={passMe} /></span>}
                  <span className="flex-shrink-0 text-center">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/65">{passState?.season ? `S${passState.season.number} · Lv` : "Level"}</span>
                    <span className="block text-2xl font-black tabular-nums leading-none">{pass.level}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2 text-xs font-semibold text-white/75 tabular-nums">
                      <span className="truncate">{pass.level >= 99 ? 'Max level' : `${formatNumber(pass.into)} / ${formatNumber(pass.need)} XP`}</span>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap"><Flame className="w-3.5 h-3.5 text-orange-300" />{pass.streak || 0}-day streak</span>
                    </span>
                    <span className="mt-1.5 block h-2 rounded-full bg-white/10 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pass.pct * 100)}%`, background: 'linear-gradient(90deg, #5EC8FF, #C084FC 60%, #FFD76A)' }} />
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/60 group-hover:text-white flex-shrink-0" />
                </Link>
              )}

              {/* Live now + today's biggest mover */}
              {!loadingCreators && (liveCount > 0 || topMover) && (
                <div className="mt-4 flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {liveCreatorsList.slice(0, 4).map((c) => (
                    <Link key={c.id} to={`/${c.platform}/${c.username}`} className="flex-shrink-0 inline-flex items-center gap-2 rounded-full bg-white/[0.08] border border-white/15 hover:border-white/40 pl-1 pr-3 py-1 transition-colors">
                      <CreatorAvatar src={c.profile_image} name={c.display_name} size="xs" rounded="rounded-full" />
                      <span className="text-sm font-semibold">{c.display_name}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
                      </span>
                    </Link>
                  ))}
                  {topMover && (
                    <Link to={`/${topMover.c.platform}/${topMover.c.username}`} className="flex-shrink-0 inline-flex items-center gap-2 rounded-full bg-white/[0.08] border border-white/15 hover:border-white/40 pl-1 pr-3 py-1 transition-colors">
                      <CreatorAvatar src={topMover.c.profile_image} name={topMover.c.display_name} size="xs" rounded="rounded-full" />
                      <span className="text-sm font-semibold">{topMover.c.display_name}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 tabular-nums">
                        <TrendingUp className="w-3.5 h-3.5" /> +{formatNumber(topMover.g)} today
                      </span>
                    </Link>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">
                {packReady && followedCreators.length > 0 ? (
                  <Link to="/pass" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold transition-colors">
                    <Gift className="w-4 h-4" /> Open your pack
                  </Link>
                ) : (
                  <Link to="/search" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors">
                    <Search className="w-4 h-4" /> Find creators
                  </Link>
                )}
                <Link to="/compare" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/25 hover:border-white/60 text-white text-sm font-bold transition-colors">
                  <Scale className="w-4 h-4" /> Compare
                </Link>
                <Link to="/account" className="inline-flex items-center gap-1.5 px-2 py-2.5 text-sm font-semibold text-white/80 hover:text-white transition-colors">
                  <Settings className="w-4 h-4" /> Account
                </Link>
              </div>
            </div>

            {/* Your card */}
            <Link to="/pass" aria-label="Your ShinyPass card" className="hidden min-[400px]:block flex-shrink-0 w-[112px] sm:w-[200px] lg:w-[250px] self-start sm:self-center rotate-[3deg] shadow-[0_30px_50px_-20px_rgba(0,0,0,0.95)]">
              {passMe
                ? <UserCardSvg me={passMe} />
                : <div className="aspect-[5/7] rounded-[6.4%/4.571%] bg-white/[0.06] border border-white/10 animate-pulse" />}
            </Link>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-10">

          {/* Tabs: plain underline */}
          <div className="flex gap-6 sm:gap-8 overflow-x-auto border-b border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`-mb-px pb-3 pt-1 inline-flex items-center gap-1.5 text-[15px] sm:text-base font-bold whitespace-nowrap border-b-2 transition-colors ${active ? 'text-neutral-950 border-neutral-950' : 'text-neutral-600 border-transparent hover:text-neutral-900'}`}
                >
                  {tab.label}
                  <span className={`tabular-nums text-sm ${active ? 'text-neutral-700' : 'text-neutral-600'}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>

          {/* ── FOLLOWING ── */}
          {activeTab === 'following' && (
            <div className="mt-5">
              {!loadingCreators && followedCreators.length > 0 && (
                <div className="mb-5 sm:mb-6">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-sm font-semibold text-neutral-700 tabular-nums">
                      {sortedCreators.length} {sortedCreators.length === 1 ? 'creator' : 'creators'}
                    </p>
                    <div className="relative">
                      <button onClick={() => setFilterOpen((v) => !v)} className={iconBtn(filterOpen || activeFilters.length > 0)} aria-expanded={filterOpen} aria-label="Filter and sort">
                        <SlidersHorizontal className="w-4 h-4" /><span className="hidden sm:inline">Filter</span>
                        {activeFilters.length > 0 && <span className="tabular-nums text-xs rounded-full bg-white text-neutral-900 w-5 h-5 inline-flex items-center justify-center">{activeFilters.length}</span>}
                      </button>
                      {filterOpen && (
                        <FilterPanel
                          onClose={() => setFilterOpen(false)}
                          selectedPlatform={selectedPlatform}
                          setSelectedPlatform={setSelectedPlatform}
                          sortBy={sortBy}
                          setSortBy={setSortBy}
                          platformCounts={platformCounts}
                          total={followedCreators.length}
                          liveCount={liveCount}
                        />
                      )}
                    </div>
                    {followedCreators.length >= 2 && (
                      <button onClick={() => { setCompareMode((v) => !v); setSelectedForCompare([]); }} className={iconBtn(compareMode)} aria-pressed={compareMode} aria-label="Pick creators to compare">
                        <Scale className="w-4 h-4" /><span className="hidden sm:inline">Compare</span>
                      </button>
                    )}
                    <div className="inline-flex h-10 rounded-xl border border-neutral-300 bg-white p-0.5">
                      {[{ id: 'cards', Icon: LayoutGrid, label: 'Cards' }, { id: 'list', Icon: List, label: 'List' }].map(({ id, Icon, label }) => (
                        <button
                          key={id}
                          onClick={() => changeView(id)}
                          aria-label={`${label} view`}
                          aria-pressed={view === id}
                          className={`inline-flex items-center justify-center w-9 rounded-[10px] transition-colors ${view === id ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:text-neutral-950'}`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeFilters.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeFilters.map((f) => (
                        <button key={f.key} onClick={f.clear} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold">
                          {f.label} <X className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {loadingCreators ? (
                <div className={`${PANEL} flex items-center justify-center p-14`}>
                  <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
                </div>
              ) : sortedCreators.length === 0 ? (
                <div className={`${PANEL} text-center p-14`}>
                  {selectedPlatform === 'all' ? (
                    <>
                      <p className="text-xl font-extrabold text-neutral-900">Your collection is empty.</p>
                      <p className="mt-2 text-[15px] text-neutral-700">Follow a creator and their card shows up here.</p>
                      <Link to="/search" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white font-bold rounded-xl hover:bg-brand-hover transition-colors text-sm">
                        <Search className="w-4 h-4" /> Find creators
                      </Link>
                    </>
                  ) : (
                    <p className="text-[15px] font-semibold text-neutral-800">
                      {selectedPlatform === 'live' ? 'Nobody you follow is live right now.' : `You don't follow anyone on ${PLATFORM_DISPLAY_NAMES[selectedPlatform]} yet.`}
                    </p>
                  )}
                </div>
              ) : renderCollection(sortedCreators)}

              {/* Compare picker bar */}
              {compareMode && (
                <div className="sticky bottom-20 md:bottom-6 z-40 mt-8">
                  <div className="mx-auto max-w-xl flex items-center gap-3 rounded-2xl bg-neutral-950 text-white px-4 py-3 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]">
                    <div className="flex -space-x-2">
                      {selectedForCompare.map(id => {
                        const c = followedCreators.find(fc => fc.id === id);
                        return c ? <CreatorAvatar key={id} src={c.profile_image} name={c.display_name} size="sm" rounded="rounded-full" className="ring-2 ring-neutral-950" /> : null;
                      })}
                    </div>
                    <p className="flex-1 text-sm font-semibold">
                      {selectedForCompare.length < 2 ? `Pick ${2 - selectedForCompare.length} more` : `${selectedForCompare.length} of 3 picked`}
                    </p>
                    <Link
                      to={compareHref}
                      onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${selectedForCompare.length >= 2 ? 'bg-white text-neutral-950 hover:bg-neutral-100' : 'bg-white/15 text-white/60 pointer-events-none'}`}
                    >
                      Compare <ChevronRight className="w-4 h-4" />
                    </Link>
                    <button onClick={() => { setCompareMode(false); setSelectedForCompare([]); }} aria-label="Cancel" className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SAVED COMPARES ── */}
          {activeTab === 'compares' && (
            <div className="mt-6">
              {loadingCompares ? (
                <div className={`${PANEL} flex items-center justify-center p-14`}>
                  <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
                </div>
              ) : savedCompares.length === 0 ? (
                <div className={`${PANEL} p-14 text-center`}>
                  <p className="text-xl font-extrabold text-neutral-900">No saved matchups yet.</p>
                  <p className="mt-2 text-[15px] text-neutral-700">Put two creators head to head on Compare and hit Save.</p>
                  <Link to="/compare" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white font-bold rounded-xl hover:bg-brand-hover transition-colors text-sm">
                    <Scale className="w-4 h-4" /> Go to Compare
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedCompares.map(compare => {
                    const entries = compare.creators_param.split(',').map(e => {
                      const [platform, username] = e.split(':');
                      return { platform, username };
                    }).filter(e => e.platform && e.username);
                    const shown = entries.slice(0, 3);
                    const mid = (shown.length - 1) / 2;
                    return (
                      <div key={compare.id} className={`${PANEL} overflow-hidden`}>
                        <Link to={`/compare?creators=${compare.creators_param}`} className="block">
                          <div className="relative h-[150px] bg-[#0a0a0f] overflow-hidden">
                            <DotGrid />
                            {shown.map((e, i) => (
                              <img
                                key={`${e.platform}/${e.username}`}
                                src={cardImageUrl(e.platform, e.username, { mark: false })}
                                alt="" width="250" height="350" loading="lazy" draggable="false"
                                onLoad={(ev) => ev.currentTarget.classList.remove('opacity-0')}
                                className={`absolute left-1/2 top-4 w-[82px] h-auto ${CARD_RADIUS} select-none opacity-0 transition-opacity duration-500 shadow-[0_16px_30px_-10px_rgba(0,0,0,0.8)]`}
                                style={{ transform: `translateX(calc(-50% + ${(i - mid) * 58}px)) rotate(${(i - mid) * 8}deg)` }}
                              />
                            ))}
                          </div>
                          <div className="px-4 pt-3.5">
                            <p className="font-bold text-[15px] text-neutral-900 truncate">{compare.name}</p>
                            <p className="mt-0.5 text-sm text-neutral-600 truncate">{entries.map(e => e.username).join(' vs ')}</p>
                          </div>
                        </Link>
                        <div className="flex items-center justify-between px-4 pb-3.5 pt-3">
                          <button
                            onClick={() => handleDeleteCompare(compare.id)}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-700 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                          <Link to={`/compare?creators=${compare.creators_param}`} className="inline-flex items-center gap-1 text-sm font-bold text-neutral-900 hover:underline">
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

          {/* ── RECENTLY VIEWED ── */}
          {activeTab === 'recent' && (
            <div className="mt-6">
              {recentlyViewed.length === 0 ? (
                <div className={`${PANEL} p-14 text-center`}>
                  <p className="text-xl font-extrabold text-neutral-900">Nothing here yet.</p>
                  <p className="mt-2 text-[15px] text-neutral-700">Creators you visit show up here.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-sm font-semibold text-neutral-800">Your last {recentlyViewed.length} visits</p>
                    <button onClick={handleClearHistory} className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-700 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" /> Clear history
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-5">
                    {recentlyViewed.slice(0, 18).map((creator, idx) => (
                      <Link key={`${creator.platform}-${creator.username}-${idx}`} to={`/${creator.platform}/${creator.username}`} className="block">
                        <img
                          src={cardImageUrl(creator.platform, creator.username)}
                          alt={`${creator.displayName} card`}
                          width="250" height="350" loading="lazy" draggable="false"
                          onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                          className={`w-full h-auto ${CARD_RADIUS} select-none bg-[#15151c] opacity-0 transition-opacity duration-500 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]`}
                        />
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
