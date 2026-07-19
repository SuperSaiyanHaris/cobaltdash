import { memo, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, ArrowRight, ArrowUpRight, Calculator, Scale, TrendingUp, Trophy,
  Youtube, Twitch, LineChart, DollarSign, Users, Music, ChevronLeft, ChevronRight, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';
import { getAllPosts } from '../services/blogService';
import {
  getRankedCreators, getTopCreatorsByPlatform, getSparklineData, getCreatorStats,
} from '../services/creatorService';
import { supabase } from '../lib/supabase';
import { formatNumber, formatRelativeTimeShort } from '../lib/utils';
import CreatorAvatar from '../components/CreatorAvatar';
import CountUp from '../components/CountUp';
import Sparkline from '../components/Sparkline';
import FeaturedListingPreview from '../components/FeaturedListingPreview';
import PreviewRankingRow from '../components/PreviewRankingRow';
import { PLATFORM_COUNT } from '../lib/constants';
import { isMac as IS_MAC } from '../lib/platform';

const PLATFORMS = [
  { id: 'youtube',  name: 'YouTube',  Icon: Youtube,      accent: '#ef4444' },
  { id: 'tiktok',   name: 'TikTok',   Icon: TikTokIcon,   accent: '#ec4899' },
  { id: 'twitch',   name: 'Twitch',   Icon: Twitch,       accent: '#a855f7' },
  { id: 'kick',     name: 'Kick',     Icon: KickIcon,     accent: '#22c55e' },
  { id: 'bluesky',  name: 'Bluesky',  Icon: BlueskyIcon,  accent: '#0ea5e9' },
  { id: 'music',    name: 'Music',    Icon: Music,        accent: '#f59e0b' },
  { id: 'mastodon', name: 'Mastodon', Icon: MastodonIcon, accent: '#7c3aed' },
  { id: 'rumble',   name: 'Rumble',   Icon: RumbleIcon,   accent: '#65a30d' },
  { id: 'substack', name: 'Substack', Icon: SubstackIcon, accent: '#ea580c' },
];

const HEADLINE_ROTATIONS = ['YouTuber', 'TikToker', 'Streamer', 'Artist', 'Creator'];

// Display order + labels for the rotating #1-per-platform hero card.
const TOP_CARD_META = [
  { platform: 'youtube',  label: '#1 YouTuber',        metric: 'subscribers' },
  { platform: 'tiktok',   label: '#1 TikToker',        metric: 'followers' },
  { platform: 'twitch',   label: '#1 Twitch Streamer', metric: 'followers' },
  { platform: 'kick',     label: '#1 Kick Streamer',   metric: 'paid subscribers' },
  { platform: 'bluesky',  label: '#1 on Bluesky',      metric: 'followers' },
  { platform: 'music',    label: '#1 Artist',          metric: 'monthly listeners' },
  { platform: 'mastodon', label: '#1 on Mastodon',     metric: 'followers' },
  { platform: 'rumble',   label: '#1 on Rumble',       metric: 'followers' },
  { platform: 'substack', label: '#1 on Substack',     metric: 'subscribers' },
];

const FALLBACK_NAMES = ['MrBeast', 'T-Series', 'Cocomelon', 'SET India', 'Vlad and Niki'];

// Same CPM range the earnings calculator advertises.
const CPM_LOW = 0.5;
const CPM_HIGH = 4.0;

function fmtUSD(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  return `$${Math.round(n)}`;
}

// Average daily views from a creator's real 30-day total_views history.
// Returns null when there isn't enough data — callers must hide, not fake.
function deriveDailyViews(history) {
  const rows = (history || []).filter((r) => r.total_views > 0);
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const days = Math.max(1, Math.round(
    (new Date(last.recorded_at) - new Date(first.recorded_at)) / 86400000
  ));
  const delta = last.total_views - first.total_views;
  return delta > 0 ? Math.round(delta / days) : null;
}

/* ---------------------------------------------------------------------------
 * Hero pieces. Each rotation timer lives inside its own memoized component so
 * a tick only re-renders that subtree, not the whole page.
 * ------------------------------------------------------------------------- */

const RotatingHeadlineWord = memo(function RotatingHeadlineWord() {
  const reduceMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % HEADLINE_ROTATIONS.length), 2400);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // Static fallback word when the user prefers reduced motion
  const word = reduceMotion ? 'Creator' : HEADLINE_ROTATIONS[idx];

  return (
    <span className="relative block overflow-hidden mt-1">
      <AnimatePresence mode="wait">
        <motion.span
          key={word}
          initial={{ opacity: 0, y: '30%' }}
          animate={{ opacity: 1, y: '0%' }}
          exit={{ opacity: 0, y: '-30%' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block bg-gradient-to-br from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent"
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});

const SHOWCASE_ICONS = { youtube: Youtube, twitch: Twitch };
const SHOWCASE_TINT = { youtube: 'text-red-400', twitch: 'text-purple-400' };
const SHOWCASE_METRIC = { youtube: 'subscribers', twitch: 'followers' };

// Real-creator showcase band — bigger card treatment borrowed from the auth
// page's showcase columns, so this reads as a considered section rather than
// a cramped ticker. Kept out of the tab order entirely (cards remain
// clickable) so keyboard users reach the search input immediately; the
// duplicated copy is hidden from assistive tech.
const HeroMarquee = memo(function HeroMarquee({ creators }) {
  if (creators.length === 0) return null;

  const strip = (hidden) => (
    <div className="flex gap-3 sm:gap-4" aria-hidden={hidden || undefined}>
      {creators.map((c, i) => {
        const Icon = SHOWCASE_ICONS[c.platform] || Youtube;
        return (
          <Link
            key={`${c.id}-${i}`}
            to={`/${c.platform}/${c.username}`}
            tabIndex={-1}
            className="inline-flex items-center gap-3 px-4 py-3 bg-white/[0.05] border border-white/10 rounded-xl hover:bg-white/[0.09] hover:border-white/20 transition-colors w-64 flex-shrink-0"
          >
            <CreatorAvatar src={c.profile_image} name={c.display_name} rounded="rounded-lg" className="!w-11 !h-11 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${SHOWCASE_TINT[c.platform] || 'text-neutral-400'}`} />
                <p className="text-sm font-semibold text-white truncate">{c.display_name}</p>
              </div>
              <p className="text-xs text-white/60 tabular-nums mt-0.5">
                {formatNumber(c.subscribers)} {SHOWCASE_METRIC[c.platform] || 'followers'}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div
      className="flex gap-3 sm:gap-4 animate-marquee-slow whitespace-nowrap"
      style={{ width: 'max-content' }}
    >
      {strip(false)}
      {strip(true)}
    </div>
  );
});

// Platform icon + tint lookup, reused from the hero's platform-icon row.
const PLATFORM_LOOKUP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

// Champions — the #1 creator on every platform, fanned out coverflow-style
// (Ripit.co's homepage card-fan carousel is the reference) instead of a plain
// grid — a static "line after line of #1s" grid read as flat, and the user
// specifically wanted the fanned/rotated card motion instead. One card is
// centered and full detail (avatar, count, real sparkline); the rest recede
// to the sides at increasing rotation/scale/fade, like a hand of cards.
// Auto-advances (paused on hover, and under prefers-reduced-motion the fan
// just holds on the first card — no forced motion). Arrows + dots for manual
// control; clicking either doesn't permanently stop auto-advance, this is a
// decorative showcase, not a tabbed interface the user is expected to "land"
// on. Deliberately NOT CountUp on the follower number: same reasoning as
// everywhere else on this page — a below-the-fold CountUp shows a literal
// "0" until scrolled into view, which reads as broken data.
function ChampionsGrid({ tops, sparklines }) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduceMotion || paused || tops.length < 2) return;
    const id = setInterval(() => setActiveIndex((i) => (i + 1) % tops.length), 3200);
    return () => clearInterval(id);
  }, [reduceMotion, paused, tops.length]);

  if (tops.length === 0) return null;

  const go = (dir) => setActiveIndex((i) => (i + dir + tops.length) % tops.length);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10 sm:mb-12"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">Right now</p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900">
          The #1 on every platform
        </h2>
        <p className="mt-4 text-base sm:text-lg text-neutral-600">
          Real numbers, updated daily, across all {PLATFORM_COUNT} platforms.
        </p>
      </motion.div>

      <div
        className="relative h-[300px] sm:h-[340px] flex items-center justify-center"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {tops.map((top, i) => {
          let offset = i - activeIndex;
          if (offset > tops.length / 2) offset -= tops.length;
          if (offset < -tops.length / 2) offset += tops.length;
          const abs = Math.abs(offset);
          if (abs > 3) return null;

          const isActive = offset === 0;
          const meta = PLATFORM_LOOKUP[top.platform];
          const Icon = meta?.Icon;
          const spark = sparklines[top.id];

          return (
            <motion.div
              key={top.platform}
              className="absolute w-[210px] sm:w-[250px]"
              animate={{
                x: offset * (reduceMotion ? 0 : 120),
                y: abs * 12,
                rotate: reduceMotion ? 0 : offset * 7,
                scale: 1 - abs * 0.13,
                opacity: abs > 2 ? 0 : 1 - abs * 0.3,
                zIndex: 10 - abs,
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              style={{ pointerEvents: isActive ? 'auto' : 'none' }}
            >
              <Link
                to={`/${top.platform}/${top.username}`}
                tabIndex={isActive ? 0 : -1}
                className={`group block bg-white border rounded-2xl p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-colors ${
                  isActive ? 'border-neutral-300 hover:border-neutral-400' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-3.5">
                  {Icon && <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.accent }} />}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{top._platformLabel}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CreatorAvatar src={top.profile_image} name={top.display_name} rounded="rounded-xl" className="!w-11 !h-11 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-neutral-900 truncate text-sm">{top.display_name}</p>
                    <p className="text-xs text-neutral-500 tabular-nums">
                      {formatNumber(top.subscribers || 0)} {top._metricLabel}
                    </p>
                  </div>
                </div>
                {isActive && (
                  <div className="h-7 mt-3">
                    {spark && spark.length >= 2 && <Sparkline data={spark} width={210} height={28} fluid />}
                  </div>
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous"
          className="p-2 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {tops.map((t, i) => (
            <button
              key={t.platform}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Show ${t._platformLabel}`}
              className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-6 bg-neutral-900' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next"
          className="p-2 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Product preview carousel — owns its rotation state. Auto-advance stops
 * permanently on manual tab selection and never runs under reduced motion.
 * ------------------------------------------------------------------------- */
const PreviewCarousel = memo(function PreviewCarousel({ topCreators, topHistory }) {
  const reduceMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  const mr = topCreators[0];
  const tseries = topCreators[1];
  const maxSubs = mr?.subscribers;
  const updatedAt = mr?.computedAt;
  const dailyViews = useMemo(() => deriveDailyViews(topHistory), [topHistory]);
  // YouTube subscriber counts barely move day to day for large channels (see
  // CLAUDE.md), so "30-day growth" is shown via total views instead — it's
  // the metric that actually moves, and growth30d is already views delta for
  // this platform (see refresh_rankings_cache_platform).
  const viewsStart = mr?.totalViews != null && mr?.growth30d != null ? mr.totalViews - mr.growth30d : null;

  const previews = useMemo(() => {
    const list = [
      // 1. RANKINGS
      {
        url: 'shinypull.com/rankings/youtube',
        label: 'Rankings',
        ctaText: 'See full rankings',
        ctaLink: '/rankings/youtube',
        content: (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-neutral-900">Top YouTubers</h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[10px] font-semibold text-emerald-700">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              </div>
              {updatedAt && (
                <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Updated {formatRelativeTimeShort(updatedAt)}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {(topCreators.length > 0 ? topCreators : Array(5).fill(null)).slice(0, 5).map((creator, i) => (
                <PreviewRankingRow
                  key={creator?.id || i}
                  rank={i + 1}
                  creator={creator}
                  fallbackName={FALLBACK_NAMES[i]}
                  maxValue={maxSubs}
                />
              ))}
            </div>
          </>
        ),
      },
      // 2. CREATOR PROFILE
      {
        url: `shinypull.com/youtube/${mr?.username || 'mrbeast'}`,
        label: 'Profile',
        ctaText: `See ${mr?.display_name || 'MrBeast'}'s profile`,
        ctaLink: `/youtube/${mr?.username || 'mrbeast'}`,
        content: (
          <>
            <div className="flex items-center gap-3 sm:gap-4 mb-5">
              <CreatorAvatar src={mr?.profile_image} name={mr?.display_name || 'MrBeast'} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-base sm:text-lg font-bold text-neutral-900 truncate">{mr?.display_name || 'MrBeast'}</h3>
                  <Youtube className="w-4 h-4 text-red-600 flex-shrink-0" />
                </div>
                <p className="text-xs text-neutral-500">@{mr?.username || 'mrbeast'} · YouTube</p>
              </div>
              {mr?.growth30d > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[10px] font-semibold text-emerald-700">
                  <TrendingUp className="w-3 h-3" />
                  +{formatNumber(mr.growth30d)} / 30d
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="p-2.5 sm:p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Subscribers</p>
                <p className="text-base sm:text-xl font-extrabold text-neutral-900 tabular-nums">{mr?.subscribers ? formatNumber(mr.subscribers) : '—'}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Total Views</p>
                <p className="text-base sm:text-xl font-extrabold text-neutral-900 tabular-nums">{mr?.totalViews ? formatNumber(mr.totalViews) : '—'}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Videos</p>
                <p className="text-base sm:text-xl font-extrabold text-neutral-900 tabular-nums">{mr?.totalPosts ? formatNumber(mr.totalPosts) : '—'}</p>
              </div>
            </div>
            {viewsStart != null && (
              <div className="p-3 sm:p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                <p className="text-[10px] text-neutral-500 uppercase tracking-[0.14em] font-medium mb-3">30-day view momentum</p>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">30 days ago</p>
                    <p className="text-lg sm:text-xl font-extrabold text-neutral-400 tabular-nums">{formatNumber(viewsStart)}</p>
                  </div>
                  <div className="flex flex-col items-center px-2 flex-shrink-0">
                    <ArrowRight className="w-4 h-4 text-neutral-300" />
                    {mr.growth30d !== 0 && (
                      <span className={`mt-1 text-[10px] font-semibold tabular-nums whitespace-nowrap ${mr.growth30d > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {mr.growth30d > 0 ? '+' : ''}{formatNumber(mr.growth30d)}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">Today</p>
                    <p className="text-lg sm:text-xl font-extrabold text-neutral-900 tabular-nums">{formatNumber(mr.totalViews)}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ),
      },
      // 3. COMPARE
      {
        url: 'shinypull.com/compare',
        label: 'Compare',
        ctaText: 'Compare creators',
        ctaLink: '/compare',
        content: (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-bold text-neutral-900">Head-to-head</h3>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Live</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {[mr, tseries].map((c, i) => {
                const name = c?.display_name || FALLBACK_NAMES[i];
                return (
                  <div key={i} className={`p-3 sm:p-4 rounded-xl border ${i === 0 ? 'bg-indigo-50/60 border-indigo-200' : 'bg-amber-50/60 border-amber-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <CreatorAvatar src={c?.profile_image} name={name} size="sm" />
                      <p className="text-sm font-bold text-neutral-900 truncate">{name}</p>
                    </div>
                    <p className="text-xl sm:text-2xl font-extrabold text-neutral-900 tabular-nums leading-none">
                      {c?.subscribers ? formatNumber(c.subscribers) : '—'}
                    </p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider mt-1">Subscribers</p>
                    <div className="mt-3 pt-3 border-t border-neutral-200/60 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500">Views</span>
                        <span className="font-semibold text-neutral-900 tabular-nums">{c?.totalViews ? formatNumber(c.totalViews) : '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500">Videos</span>
                        <span className="font-semibold text-neutral-900 tabular-nums">{c?.totalPosts ? formatNumber(c.totalPosts) : '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500">30d growth</span>
                        <span className="font-semibold text-emerald-600 tabular-nums">{c?.growth30d > 0 ? `+${formatNumber(c.growth30d)}` : '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-neutral-500">
              <Users className="w-3 h-3" />
              Stack up to 10 creators side-by-side
            </div>
          </>
        ),
      },
    ];

    // 4. EARNINGS — only shown when we can compute it from real view history.
    if (mr && dailyViews) {
      const rows = [
        { label: 'Per day',   low: dailyViews * CPM_LOW / 1000,         high: dailyViews * CPM_HIGH / 1000,         classes: 'bg-emerald-50/60 border-emerald-200' },
        { label: 'Per month', low: dailyViews * 30 * CPM_LOW / 1000,    high: dailyViews * 30 * CPM_HIGH / 1000,    classes: 'bg-green-50/60 border-green-200' },
        { label: 'Per year',  low: dailyViews * 365 * CPM_LOW / 1000,   high: dailyViews * 365 * CPM_HIGH / 1000,   classes: 'bg-teal-50/60 border-teal-200' },
      ];
      list.push({
        url: 'shinypull.com/youtube/money-calculator',
        label: 'Earnings',
        ctaText: 'Try the earnings calculator',
        ctaLink: '/youtube/money-calculator',
        content: (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-neutral-900">YouTube Earnings Estimate</h3>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">$0.50 - $4.00 CPM</span>
            </div>
            <div className="flex items-center gap-3 mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <CreatorAvatar src={mr.profile_image} name={mr.display_name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 truncate">{mr.display_name}</p>
                <p className="text-[11px] text-neutral-500 tabular-nums">{formatNumber(dailyViews)} views per day</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {rows.map((row) => (
                <div key={row.label} className={`p-3 border rounded-lg ${row.classes}`}>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1.5">{row.label}</p>
                  <p className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums leading-tight">{fmtUSD(row.low)}</p>
                  <p className="text-[10px] text-neutral-500">to</p>
                  <p className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums leading-tight">{fmtUSD(row.high)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-neutral-500">
              <DollarSign className="w-3 h-3" />
              Estimate based on industry CPM ranges
            </div>
          </>
        ),
      });
    }

    return list;
  }, [mr, tseries, topCreators, maxSubs, viewsStart, updatedAt, dailyViews]);

  // Auto-advance. Rankings (index 0) holds longer; stops for good once the
  // user picks a tab, and never runs under reduced motion.
  useEffect(() => {
    if (!autoPlay || reduceMotion || previews.length < 2) return;
    const dwell = idx === 0 ? 20000 : 9000;
    const id = setTimeout(() => setIdx((i) => (i + 1) % previews.length), dwell);
    return () => clearTimeout(id);
  }, [idx, autoPlay, reduceMotion, previews.length]);

  const active = previews[Math.min(idx, previews.length - 1)];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-2xl bg-white border border-neutral-200/80 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.22)] overflow-hidden"
      >
        {/* Browser chrome — URL updates per preview */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 bg-neutral-50">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <Link
            to={active.ctaLink}
            className="flex-1 max-w-md mx-auto bg-white border border-neutral-200 rounded-md px-3 py-1 text-[11px] text-neutral-500 flex items-center gap-1.5 hover:border-neutral-300 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <AnimatePresence mode="wait">
              <motion.span
                key={active.label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="truncate"
              >
                {active.url}
              </motion.span>
            </AnimatePresence>
          </Link>
          <div className="w-12" />
        </div>

        {/* Content area — fixed min-height set to the tallest preview (Rankings) so swaps don't reflow the page */}
        <div
          id="home-preview-panel"
          role="tabpanel"
          aria-labelledby={`home-preview-tab-${active.label}`}
          className="p-4 sm:p-6 min-h-[420px] sm:min-h-[440px] flex flex-col"
        >
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                {active.content}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* CTA — pinned to bottom so it stays put across all previews */}
          <Link
            to={active.ctaLink}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-sm rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={active.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {active.ctaText}
              </motion.span>
            </AnimatePresence>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>

      {/* Tabs */}
      <div role="tablist" aria-label="Product previews" className="mt-5 flex items-center justify-center gap-2">
        {previews.map((p, i) => (
          <button
            key={p.label}
            type="button"
            role="tab"
            id={`home-preview-tab-${p.label}`}
            aria-selected={i === idx}
            aria-controls="home-preview-panel"
            onClick={() => { setIdx(i); setAutoPlay(false); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              i === idx
                ? 'bg-neutral-900 border-neutral-900 text-white'
                : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-300'}`} />
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
});

// Only renders once both counts came back as real positive numbers — an
// analytics site must never display "0 creators tracked" as a loading state.
const LiveStatsStrip = memo(function LiveStatsStrip({ creators, dataPoints }) {
  if (!creators || !dataPoints) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mt-6 grid grid-cols-3 max-w-3xl mx-auto bg-white border border-neutral-200 rounded-xl overflow-hidden"
    >
      {[
        { label: 'Creators tracked',  value: creators },
        { label: 'Daily data points', value: dataPoints },
        { label: 'Platforms',         value: PLATFORM_COUNT },
      ].map((s, i) => (
        <div key={s.label} className={`p-4 sm:p-5 text-center ${i !== 2 ? 'border-r border-neutral-200' : ''}`}>
          <p className="text-xl sm:text-2xl font-extrabold text-neutral-900 tabular-nums">
            <CountUp value={s.value} />
          </p>
          <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 uppercase tracking-wider">{s.label}</p>
        </div>
      ))}
    </motion.div>
  );
});

// posts === null → loading skeletons (space reserved, no layout shift when
// data lands); [] → nothing to show, hide the section.
const BlogTeaser = memo(function BlogTeaser({ posts }) {
  if (posts !== null && posts.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-2">From the blog</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">Latest in creator economy</h2>
        </div>
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900 hover:gap-2 transition-all">
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {posts === null ? (
        <div className="grid md:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="aspect-[16/9] bg-neutral-100 animate-pulse" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-24 bg-neutral-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-neutral-100 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-neutral-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-5">
          {posts.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Link
                to={`/blog/${post.slug}`}
                className="group block bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:border-neutral-300 transition-colors duration-200"
              >
                {post.image && (
                  <div className="aspect-[16/9] overflow-hidden bg-neutral-100">
                    <img
                      src={post.image}
                      alt={post.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                )}
                <div className="p-5">
                  {post.category && (
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full mb-3">
                      {post.category}
                    </span>
                  )}
                  <h3 className="text-base font-bold text-neutral-900 mb-1.5 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-sm text-neutral-600 line-clamp-2 leading-relaxed">{post.description}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
});

const FEATURES = [
  { Icon: Trophy,     title: 'Live Rankings',       body: 'Updated daily, every platform',        to: '/rankings',                 accent: 'amber' },
  { Icon: Search,     title: 'Universal Search',    body: `${IS_MAC ? '⌘K' : 'Ctrl K'} from anywhere`, to: '/search',               accent: 'indigo' },
  { Icon: Scale,      title: 'Head-to-Head Compare',body: 'Stack any two creators',                to: '/compare',                  accent: 'violet' },
  { Icon: TrendingUp, title: 'Trending This Month',  body: 'Catch growth before it peaks',          to: '/trending',                 accent: 'emerald' },
  { Icon: Calculator, title: 'Earnings Estimator',   body: 'Estimate YouTube ad revenue',           to: '/youtube/money-calculator', accent: 'green' },
  { Icon: LineChart,  title: 'Daily Growth History', body: 'Charts, deltas, milestones',            to: '/youtube/mrbeast',          accent: 'sky' },
];

const FEATURE_COLORS = {
  amber:   'bg-amber-50 text-amber-600 border-amber-200',
  indigo:  'bg-indigo-50 text-indigo-600 border-indigo-200',
  violet:  'bg-violet-50 text-violet-600 border-violet-200',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  green:   'bg-green-50 text-green-600 border-green-200',
  sky:     'bg-sky-50 text-sky-600 border-sky-200',
};

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [latestPosts, setLatestPosts] = useState(null);
  const [topCreators, setTopCreators] = useState([]);
  const [liveStats, setLiveStats] = useState({ creators: null, dataPoints: null });
  const [marqueeCreators, setMarqueeCreators] = useState([]);
  const [topByPlatform, setTopByPlatform] = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [topHistory, setTopHistory] = useState(null);
  const navigate = useNavigate();

  // Live counts from DB.
  // `count: 'exact'` is exact-but-slow and times out on multi-million row tables;
  // `count: 'estimated'` uses Postgres reltuples for an instant approximation.
  // Only positive counts are shown — a failed fetch must not render zeros.
  useEffect(() => {
    Promise.all([
      supabase.from('creators').select('*', { count: 'exact', head: true }).then(r => r.count),
      supabase.from('creator_stats').select('*', { count: 'estimated', head: true }).then(r => r.count),
    ]).then(([creators, dataPoints]) => {
      if (creators > 0 && dataPoints > 0) setLiveStats({ creators, dataPoints });
    }).catch(() => {});
  }, []);

  // Marquee = YouTube top 20 + Twitch top 20, shuffled. (User: only these two platforms in ticker.)
  // The #1-per-platform cards come from a single rankings_cache query, then we
  // batch-fetch real 30-day sparkline series for the Champions carousel, plus
  // the top YouTuber's stats history for the earnings estimate.
  useEffect(() => {
    Promise.all([
      getRankedCreators('youtube', 'subscribers', 20),
      getRankedCreators('twitch', 'subscribers', 20),
      getTopCreatorsByPlatform(),
    ]).then(([yt, tw, top1s]) => {
      const pool = [...yt, ...tw].filter(c => c?.profile_image && c?.display_name);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      setMarqueeCreators(pool);

      const byPlatform = Object.fromEntries((top1s || []).map(c => [c.platform, c]));
      const tops = TOP_CARD_META
        .filter(({ platform }) => byPlatform[platform])
        .map(({ platform, label, metric }) => ({
          ...byPlatform[platform],
          _platformLabel: label,
          _metricLabel: metric,
        }));
      setTopByPlatform(tops);

      const top5 = yt.slice(0, 5);
      setTopCreators(top5);

      const ids = [...new Set(tops.map(c => c.id))];
      if (ids.length > 0) getSparklineData(ids).then(setSparklines).catch(() => {});
      if (top5[0]) getCreatorStats(top5[0].id, 30).then(setTopHistory).catch(() => {});
    }).catch(() => {});
  }, []);

  // Latest blog posts — null means loading (skeletons), [] means hide section
  useEffect(() => {
    getAllPosts()
      .then(posts => setLatestPosts(posts.slice(0, 3)))
      .catch(() => setLatestPosts([]));
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      <SEO
        title="Home"
        description="Creator analytics across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, and Music. Real-time subscriber counts, follower growth, earnings estimates, and rankings updated daily."
        keywords="youtube statistics, tiktok statistics, twitch statistics, kick statistics, subscriber count, follower count, creator analytics"
      />

      <main className="bg-[#fafafa] text-neutral-900">

        {/* ============== CINEMATIC HERO ==============
            Full-bleed hero — section min-height ensures the bg image + left stack always have room.
            Hard bottom edge (no gradient fade) per project preference. */}
        <section className="relative isolate overflow-hidden grain-dark bg-[#0a0a0f] text-white min-h-[680px] md:min-h-[760px] flex flex-col">
          {/* Bespoke background — no stock photography, no gradient glow washes.
              Flat dark base plus a faint engineering dot-grid for texture only.
              Content (headline, search, focal card) carries all the visual weight. */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />

          {/* Fade to solid at the bottom edge so the section resolves cleanly
              into the page below, no hard seam. */}
          <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none bg-gradient-to-b from-transparent to-[#0a0a0f]" />

          {/* Center stage — fills the remaining height and centers vertically,
              so the section reads as intentionally composed at any content length. */}
          <div className="relative flex-1 flex flex-col justify-center max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">

            {/* Headline — condensed to 2 lines, lighter weight above the fold */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="text-center font-black tracking-[-0.035em] leading-[0.95] text-white max-w-4xl mx-auto"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 5rem)' }}
            >
              <span className="block">Analytics for every</span>
              <RotatingHeadlineWord />
            </motion.h1>

            {/* Glass search — the page's primary action */}
            <motion.form
              onSubmit={handleSearch}
              role="search"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-10 max-w-xl mx-auto"
            >
              <div className="relative flex items-center bg-white/[0.08] backdrop-blur-xl rounded-2xl border border-white/15 shadow-2xl shadow-black/40 focus-within:border-white/30 focus-within:bg-white/[0.12] transition-all duration-200 overflow-hidden">
                <Search className="absolute left-4 w-5 h-5 text-white/50 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search any creator"
                  placeholder="Search any creator"
                  className="w-full pl-12 pr-32 py-4 bg-transparent text-white placeholder-white/60 focus:outline-none text-base"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 inline-flex items-center gap-1.5 px-4 py-2.5 bg-white text-neutral-900 hover:bg-white/90 text-sm font-semibold rounded-xl transition-colors"
                >
                  Search
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.form>

            {/* Platform icons — quiet, icon-only, no chip backgrounds. Identity
                is the tint alone, per the site's precision system. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-wrap justify-center items-center gap-x-5 gap-y-3 max-w-md mx-auto"
            >
              {PLATFORMS.map(({ id, name, Icon, accent }) => (
                <Link
                  key={id}
                  to={`/rankings/${id}`}
                  aria-label={name}
                  title={name}
                  className="opacity-70 hover:opacity-100 transition-opacity"
                >
                  <Icon className="w-[18px] h-[18px]" style={{ color: accent }} />
                </Link>
              ))}
            </motion.div>

            {/* Featured Listings CTA — sits under the platform icons, the
                last thing in the post-search stack. Amber = this site's one
                functional-color convention for the Premium tier, applied here
                without a glow/gradient per the no-orbs rule. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-8 sm:mt-10 flex justify-center"
            >
              <Link
                to="/promote"
                className="group flex items-center gap-3 pl-3.5 pr-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] backdrop-blur-xl border border-amber-400/25 hover:border-amber-400/40 rounded-2xl transition-all"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-400/15 flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-sm font-semibold text-white">Get Featured</span>
                  <span className="block text-xs text-white/50">Sponsored placement in the live rankings</span>
                </span>
                <ArrowRight className="w-4 h-4 text-white/40 group-hover:translate-x-0.5 group-hover:text-white/70 transition-all flex-shrink-0" />
              </Link>
            </motion.div>

          </div>

          {/* CREATOR SHOWCASE — real creators, real numbers. Moved out of the
              cramped strip that used to sit above the headline; now a proper
              closing section of the hero with room to breathe, using the same
              bigger-card treatment as the auth page's showcase columns. No
              label needed — the cards speak for themselves. Slower drift
              (220s, was riding the shared 120s .animate-marquee) since these
              cards are bigger/richer than a plain ticker and read as rushed
              at the faster pace. */}
          <div className="relative flex-shrink-0 pt-2 pb-10 sm:pb-14 overflow-hidden mask-gradient">
            <HeroMarquee creators={marqueeCreators} />
          </div>
        </section>

        {/* ============== PRODUCT PREVIEW ============== */}
        <section className="relative mt-20 sm:mt-28 mb-16 sm:mb-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section header so the dark→light transition reads as an intentional break */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10 sm:mb-12"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 mb-3">Live preview</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900">
                Real rankings. Live data.
              </h2>
            </motion.div>

            <PreviewCarousel topCreators={topCreators} topHistory={topHistory} />

            <LiveStatsStrip creators={liveStats.creators} dataPoints={liveStats.dataPoints} />
          </div>
        </section>

        {/* ============== CHAMPIONS ============== */}
        <ChampionsGrid tops={topByPlatform} sparklines={sparklines} />

        {/* ============== FEATURES ============== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 sm:mb-14"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-3">What you can do</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900">
              Track creators like a pro
            </h2>
            <p className="mt-4 text-base sm:text-lg text-neutral-600">
              No paywalls. Just data.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-10%' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link
                  to={feat.to}
                  className="group flex items-center gap-4 h-full bg-white border border-neutral-200 rounded-2xl p-5 hover:border-neutral-300 hover:bg-neutral-50/50 transition-colors duration-200"
                >
                  <div className={`w-11 h-11 rounded-xl border ${FEATURE_COLORS[feat.accent]} flex items-center justify-center flex-shrink-0`}>
                    <feat.Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-neutral-900">{feat.title}</h3>
                    <p className="text-sm text-neutral-500 mt-0.5">{feat.body}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-900 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0" />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ============== FEATURED LISTINGS — LIVE PREVIEW ============== */}
        {/* Reuses <FeaturedListingPreview /> so this view stays identical to the
            one on /promote. The "how it works" numbered tiles live on /promote
            only — this section is just the visual sell. */}
        <section className="relative pb-16 sm:pb-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10 sm:mb-12"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">For brands & creators</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900">
                Show up at the top.
              </h2>
              <p className="mt-3 text-base sm:text-lg text-neutral-600 max-w-2xl mx-auto">
                Sponsored placement inside the live rankings tables. Here's exactly what your slot looks like.
              </p>
            </motion.div>

            <FeaturedListingPreview topCreators={topCreators} />
          </div>
        </section>

        {/* ============== BLOG TEASER ============== */}
        <BlogTeaser posts={latestPosts} />

        {/* ============== FOOTER CTA ============== */}
        <section className="border-t border-neutral-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 mb-3">
              Start tracking creators in seconds.
            </h2>
            <p className="text-base text-neutral-600 max-w-xl mx-auto mb-7">
              Free. No signup required to browse. Sign in to follow creators, save comparisons, and get growth alerts.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('openCommandPalette'))}
                className="inline-flex items-center gap-1.5 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <Search className="w-4 h-4" />
                Search creators
                <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-white/10 border border-white/20 rounded text-white/80">
                  {IS_MAC ? <span className="text-xs leading-none">⌘</span> : 'Ctrl'}<span>K</span>
                </kbd>
              </button>
              <Link
                to="/rankings"
                className="inline-flex items-center gap-1.5 px-6 py-3 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-neutral-900 font-semibold rounded-xl transition-all duration-200"
              >
                Browse rankings
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
