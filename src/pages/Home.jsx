import { memo, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import MusicIcon from '../components/MusicIcon';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';
import { getAllPosts } from '../services/blogService';
import {
  getRankedCreators, getTopCreatorsByPlatform, getCreatorStats, getCardsByRarity,
} from '../services/creatorService';
import { supabase } from '../lib/supabase';
import { formatNumber } from '../lib/utils';
import { cardImageUrl } from '../lib/cardUrl';
import HomeSponsorBand from '../components/HomeSponsorBand';
import HeroCardStage from '../components/HeroCardStage';
import HomeProductBento from '../components/HomeProductBento';
import { CARD_PLATFORMS } from '../lib/badgeCard';
import { PLATFORM_COUNT, PLATFORM_ACCENTS, isActivePlatform } from '../lib/constants';
import { isMac as IS_MAC } from '../lib/platform';
import { resizedBlogImageUrl, BLOG_CARD_TARGET } from '../lib/blogImageUrl';

const PLATFORMS = [
  { id: 'youtube',  name: 'YouTube',  Icon: YouTubeIcon,  accent: PLATFORM_ACCENTS.youtube },
  { id: 'tiktok',   name: 'TikTok',   Icon: TikTokIcon,   accent: PLATFORM_ACCENTS.tiktok },
  { id: 'twitch',   name: 'Twitch',   Icon: TwitchIcon,   accent: PLATFORM_ACCENTS.twitch },
  { id: 'kick',     name: 'Kick',     Icon: KickIcon,     accent: PLATFORM_ACCENTS.kick },
  { id: 'bluesky',  name: 'Bluesky',  Icon: BlueskyIcon,  accent: PLATFORM_ACCENTS.bluesky },
  { id: 'music',    name: 'Music',    Icon: MusicIcon,    accent: PLATFORM_ACCENTS.music },
  { id: 'mastodon', name: 'Mastodon', Icon: MastodonIcon, accent: PLATFORM_ACCENTS.mastodon },
  { id: 'substack', name: 'Substack', Icon: SubstackIcon, accent: PLATFORM_ACCENTS.substack },
];

// The rotating hero word. Each entry names one platform's creator and paints
// itself in that platform's own brand color, so the headline cycles through
// the full lineup rather than a generic gradient. Word and color are one unit
// — never let them drift apart, the color IS the platform label here.
const HEADLINE_ROTATIONS = [
  { word: 'YouTuber',         color: PLATFORM_ACCENTS.youtube },
  { word: 'TikToker',         color: PLATFORM_ACCENTS.tiktok },
  { word: 'Twitch streamer',  color: PLATFORM_ACCENTS.twitch },
  { word: 'Kick streamer',    color: PLATFORM_ACCENTS.kick },
  { word: 'Bluesky poster',   color: PLATFORM_ACCENTS.bluesky },
  { word: 'Musician',         color: PLATFORM_ACCENTS.music },
  { word: 'Mastodon poster',  color: PLATFORM_ACCENTS.mastodon },
  { word: 'Substack writer',  color: PLATFORM_ACCENTS.substack },
];

// Platforms the hero card hand draws Legendary/Epic/Rare cards from.
const HERO_CARD_PLATFORMS = ['youtube', 'twitch', 'kick', 'tiktok', 'bluesky', 'music'];

// Display order + labels for the rotating #1-per-platform hero card.
const TOP_CARD_META = [
  { platform: 'youtube',  label: 'YouTuber',        metric: 'subscribers' },
  { platform: 'tiktok',   label: 'TikToker',        metric: 'followers' },
  { platform: 'twitch',   label: 'Twitch Streamer', metric: 'followers' },
  { platform: 'kick',     label: 'Kick Streamer',   metric: 'paid subscribers' },
  { platform: 'bluesky',  label: 'Bluesky',         metric: 'followers' },
  { platform: 'music',    label: 'Artist',          metric: 'monthly listeners' },
  { platform: 'mastodon', label: 'Mastodon',        metric: 'followers' },
  { platform: 'substack', label: 'Substack',        metric: 'subscribers' },
];

/* ---------------------------------------------------------------------------
 * Hero pieces. Each rotation timer lives inside its own memoized component so
 * a tick only re-renders that subtree, not the whole page.
 * ------------------------------------------------------------------------- */

const RotatingHeadlineWord = memo(function RotatingHeadlineWord() {
  const reduceMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % HEADLINE_ROTATIONS.length), 3120);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // Static fallback word when the user prefers reduced motion. No single
  // platform gets to own the headline in that state, so it stays neutral.
  const { word, color } = reduceMotion
    ? { word: 'Creator', color: '#ffffff' }
    : HEADLINE_ROTATIONS[idx];

  return (
    <span className="relative block overflow-hidden mt-1">
      {/* initial={false}: skip the enter transition only for the very first
          word (part of the page's LCP element) — every rotation after that
          still animates in exactly as before. Without this, Lighthouse
          measured the LCP "element render delay" at 2,400ms, an exact match
          to this component's rotation interval, meaning Chrome wasn't
          counting the headline as painted until the first rotation fired. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={word}
          initial={{ opacity: 0, y: '30%' }}
          animate={{ opacity: 1, y: '0%' }}
          exit={{ opacity: 0, y: '-30%' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
          style={{ color }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});

// Champions — the #1 creator on every platform, fanned out coverflow-style
// (Ripit.co's homepage card-fan carousel is the reference) instead of a plain
// grid — a static "line after line of #1s" grid read as flat, and the user
// specifically wanted the fanned/rotated card motion instead. One card is
// centered and full detail (avatar, name, a large platform-appropriate stat);
// the rest recede to the sides at increasing rotation/scale/fade, like a
// hand of cards. Auto-advances (paused on hover, and under
// prefers-reduced-motion the fan just holds on the first card — no forced
// motion). Arrows + dots for manual control; clicking either doesn't
// permanently stop auto-advance, this is a decorative showcase, not a tabbed
// interface the user is expected to "land" on.
// The card used to close with a 30-day sparkline; the user found the chart
// cluttered and asked for the count itself to carry the card instead. It
// then went through a second pass ("data is not centered... extreme genius
// level UI/UX") into the current "trophy card" treatment: a thin platform-
// accent hairline across the top (the one place platform color shows beyond
// the tiny icon), then everything else — icon+label, ringed avatar with a
// black rank badge, name, a hairline divider, and the big tabular-nums stat
// with its label — stacked and text-centered, not left-aligned. Stat block
// is always shown, not just on the active card, so the fan doesn't reflow
// height as cards recede. Deliberately NOT CountUp on that number: same
// reasoning as everywhere else on this page — a below-the-fold CountUp shows
// a literal "0" until scrolled into view, which reads as broken data.
function ChampionsGrid({ tops }) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const holdTimeoutRef = useRef(null);
  const holdIntervalRef = useRef(null);

  useEffect(() => {
    if (reduceMotion || paused || tops.length < 2) return;
    const id = setInterval(() => setActiveIndex((i) => (i + 1) % tops.length), 3200);
    return () => clearInterval(id);
  }, [reduceMotion, paused, tops.length]);

  // Press-and-hold on either arrow: one immediate step, then after a short
  // delay a fast repeat kicks in so holding the button spins through cards
  // instead of requiring a click per card.
  const stopHold = () => {
    clearTimeout(holdTimeoutRef.current);
    clearInterval(holdIntervalRef.current);
    setPaused(false);
  };
  useEffect(() => () => stopHold(), []);

  if (tops.length === 0) return null;

  const go = (dir) => setActiveIndex((i) => (i + dir + tops.length) % tops.length);

  const startHold = (dir) => {
    setPaused(true);
    go(dir);
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => go(dir), 150);
    }, 350);
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 overflow-hidden">
      <div className="scroll-reveal text-center mb-10 sm:mb-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">Right now</p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900">
          The #1 on every platform
        </h2>
        <p className="mt-4 text-base sm:text-lg text-neutral-600">
          Real numbers, updated daily, across all {PLATFORM_COUNT} platforms.
        </p>
      </div>

      <motion.div
        className="relative h-[360px] sm:h-[420px] flex items-center justify-center touch-pan-y cursor-grab active:cursor-grabbing"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragStart={() => setPaused(true)}
        onDragEnd={(e, info) => {
          const SWIPE_THRESHOLD = 50;
          if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -400) go(1);
          else if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 400) go(-1);
          setPaused(false);
        }}
      >
        {tops.map((top, i) => {
          let offset = i - activeIndex;
          if (offset > tops.length / 2) offset -= tops.length;
          if (offset < -tops.length / 2) offset += tops.length;
          const abs = Math.abs(offset);
          if (abs > 3) return null;

          const isActive = offset === 0;

          // The creator's live holographic card (middleware.js -> /card/...).
          // Platform logos follow the brand rules: receded cards are rotated,
          // scaled and faded (Twitch forbids tilting its logo; YouTube forbids
          // altering it or shrinking it under 20dp), so they use mark=0 and
          // only name the platform in text. Once a card is centered (upright,
          // full size, full opacity) the logo version fades in over it, after
          // the fan's spring has settled. draggable=false so the browser's
          // native image drag doesn't fight the swipe gesture.
          const cardClassName = `block w-full rounded-[6.4%/4.571%] transition-[filter] cursor-pointer ${
            isActive ? 'drop-shadow-[0_18px_30px_rgba(0,0,0,0.28)] hover:brightness-110' : 'drop-shadow-[0_10px_18px_rgba(0,0,0,0.18)]'
          }`;

          const cardInner = (
            <span className="relative block">
              <img
                src={cardImageUrl(top.platform, top.username, { mark: false })}
                width="250"
                height="350"
                alt={`${top.display_name}, #1 on ${top._platformLabel}: ${formatNumber(top.subscribers || 0)} ${top._metricLabel}`}
                draggable="false"
                loading={abs <= 1 ? 'eager' : 'lazy'}
                className="w-full h-auto select-none"
              />
              {abs <= 1 && (
                <img
                  src={cardImageUrl(top.platform, top.username)}
                  width="250"
                  height="350"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                  className={`absolute inset-0 w-full h-auto select-none transition-opacity ${isActive ? 'opacity-100 duration-300 delay-500' : 'opacity-0 duration-0'}`}
                />
              )}
            </span>
          );

          return (
            <motion.div
              key={top.platform}
              className="absolute w-[220px] sm:w-[250px]"
              animate={{
                x: offset * (reduceMotion ? 0 : 120),
                y: abs * 12,
                rotate: reduceMotion ? 0 : offset * 7,
                scale: 1 - abs * 0.13,
                opacity: abs > 2 ? 0 : 1 - abs * 0.3,
                zIndex: 10 - abs,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
              style={{ pointerEvents: abs > 2 ? 'none' : 'auto' }}
            >
              {isActive ? (
                <Link to={`/${top.platform}/${top.username}`} className={cardClassName}>
                  {cardInner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Show ${top.display_name}, #1 on ${top._platformLabel}`}
                  className={cardClassName}
                >
                  {cardInner}
                </button>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          type="button"
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          aria-label="Previous (hold to rewind)"
          className="p-2 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:border-neutral-300 transition-colors select-none"
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
              // Padding expands the actual tap target to 24px+ (was a 6px hit
              // area, flagged by PageSpeed); the matching negative margin
              // keeps the row's visual spacing identical to before, since the
              // dot itself -- not this button -- carries the visible size.
              className="group p-[9px] -m-[9px] flex items-center justify-center"
            >
              <span
                // transition-colors, not transition-all: animating width is a
                // non-composited (main-thread, layout-triggering) animation,
                // flagged by PageSpeed. The width change still happens instantly
                // on click, just without animating through the in-between values.
                className={`block h-1.5 rounded-full transition-colors ${i === activeIndex ? 'w-6 bg-neutral-900' : 'w-1.5 bg-neutral-300 group-hover:bg-neutral-400'}`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          aria-label="Next (hold to fast-forward)"
          className="p-2 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:border-neutral-300 transition-colors select-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

// posts === null → loading skeletons (space reserved, no layout shift when
// data lands); [] → nothing to show, hide the section.
// Blog teaser as a magazine spread: the newest post as a big lead story with
// its title over the image, the next two as compact stories beside it.
function blogDate(dateStr) {
  if (!dateStr) return '';
  // published_at is a bare DATE; local noon keeps it on the right day in
  // every timezone (same fix as Blog.jsx's formatDate).
  const d = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function BlogMeta({ post, className = '' }) {
  const parts = [blogDate(post.published_at), post.read_time].filter(Boolean);
  if (!parts.length) return null;
  return <p className={`text-xs tabular-nums ${className}`}>{parts.join(' · ')}</p>;
}

const BlogTeaser = memo(function BlogTeaser({ posts }) {
  if (posts !== null && posts.length === 0) return null;
  const [lead, ...rest] = posts || [];

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 mb-2">From the blog</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">The creator economy, in numbers</h2>
        </div>
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900 hover:gap-2 transition-all">
          All posts <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {posts === null ? (
        <div className="grid lg:grid-cols-[1.35fr,1fr] gap-5">
          <div className="aspect-[16/10] rounded-3xl bg-neutral-200/70 animate-pulse" />
          <div className="grid gap-5">
            {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-neutral-200/70 animate-pulse" />)}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.35fr,1fr] gap-5">
          <Link
            to={`/blog/${lead.slug}`}
            className="group relative block overflow-hidden rounded-3xl bg-neutral-900 aspect-[4/5] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[440px]"
          >
            {lead.image && (
              <img
                src={resizedBlogImageUrl(lead.image, 1200, 675)}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/0" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              {lead.category && (
                <span className="inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-white/15 backdrop-blur border border-white/20 rounded-full mb-3">
                  {lead.category}
                </span>
              )}
              <h3 className="text-xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight line-clamp-3 text-balance">{lead.title}</h3>
              {lead.description && <p className="hidden sm:block mt-3 text-sm sm:text-base text-white/70 line-clamp-2 max-w-2xl">{lead.description}</p>}
              <BlogMeta post={lead} className="mt-3 text-white/50" />
            </div>
          </Link>

          <div className="grid gap-4 lg:grid-rows-3">
            {rest.slice(0, 3).map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="group flex items-center gap-4 p-3 sm:p-4 bg-white border border-neutral-200/80 rounded-2xl hover:border-neutral-300 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)] transition-[border-color,box-shadow]"
              >
                {post.image && (
                  <div className="w-32 sm:w-40 flex-shrink-0 aspect-[16/10] rounded-xl overflow-hidden bg-neutral-100">
                    <img
                      src={resizedBlogImageUrl(post.image, BLOG_CARD_TARGET.width, BLOG_CARD_TARGET.height)}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  {post.category && <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{post.category}</p>}
                  <h3 className="mt-1 text-sm sm:text-[15px] font-bold text-neutral-900 leading-snug line-clamp-3 group-hover:text-indigo-600 transition-colors">{post.title}</h3>
                  <BlogMeta post={post} className="mt-1.5 text-neutral-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
});

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [latestPosts, setLatestPosts] = useState(null);
  const [topCreators, setTopCreators] = useState([]);
  const [youtubeTop, setYoutubeTop] = useState([]);
  const [liveStats, setLiveStats] = useState({ creators: null, dataPoints: null });
  const [heroCards, setHeroCards] = useState([]);
  const [topByPlatform, setTopByPlatform] = useState([]);
  const [topHistory, setTopHistory] = useState(null);
  const navigate = useNavigate();

  // Live counts from DB.
  // Both use `count: 'estimated'`, which reads Postgres `reltuples` instead of
  // walking the table. `creators` used to ask for `exact`, which is a full seq
  // scan over 43K+ rows on every single home page view (~12ms of DB time for a
  // decorative stat, growing with the table). Checked 2026-07-25: reltuples and
  // the exact count agreed to the row, and autoanalyze keeps it current.
  // Only positive counts are shown — a failed fetch must not render zeros.
  useEffect(() => {
    Promise.all([
      supabase.from('creators').select('*', { count: 'estimated', head: true }).then(r => r.count),
      supabase.from('creator_stats').select('*', { count: 'estimated', head: true }).then(r => r.count),
    ]).then(([creators, dataPoints]) => {
      if (creators > 0 && dataPoints > 0) setLiveStats({ creators, dataPoints });
    }).catch(() => {});
  }, []);

  // Hero card hand: every platform's #1 plus a random draw of Legendary,
  // Epic and Rare cards per platform (no Commons here; the sign-in page's
  // wall shows every rarity), shuffled so each visit pulls a different run.
  // The YouTube top 10 feeds the rankings, podium and earnings sections.
  useEffect(() => {
    Promise.all([
      getRankedCreators('youtube', 'subscribers', 10),
      getTopCreatorsByPlatform(),
      getCardsByRarity(HERO_CARD_PLATFORMS, { legendary: 1, epic: 2, rare: 2 }).catch(() => []),
    ]).then(([yt, top1s, drawn]) => {
      const seen = new Set();
      const pool = [...(top1s || []), ...(drawn || [])].filter((c) => {
        const key = `${c?.platform}/${c?.username}`;
        if (!c?.username || !c?.display_name || !isActivePlatform(c.platform) || !CARD_PLATFORMS[c.platform] || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      setHeroCards(pool);

      const byPlatform = Object.fromEntries((top1s || []).map(c => [c.platform, c]));
      const tops = TOP_CARD_META
        .filter(({ platform }) => byPlatform[platform])
        .map(({ platform, label, metric }) => ({
          ...byPlatform[platform],
          _platformLabel: label,
          _metricLabel: metric,
        }));
      setTopByPlatform(tops);

      setYoutubeTop(yt.slice(0, 10));
      const top5 = yt.slice(0, 5);
      setTopCreators(top5);

      if (top5[0]) getCreatorStats(top5[0].id, 30).then(setTopHistory).catch(() => {});
    }).catch(() => {});
  }, []);

  // Latest blog posts — null means loading (skeletons), [] means hide section
  useEffect(() => {
    getAllPosts()
      .then(posts => setLatestPosts(posts.slice(0, 4)))
      .catch(() => setLatestPosts([]));
  }, []);

  // "43,000+" once the live count arrives (rounded down, never overstated).
  const heroCreatorCount = liveStats.creators
    ? `${(Math.floor(liveStats.creators / 1000) * 1000).toLocaleString('en-US')}+`
    : 'thousands of';

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
        description="Creator analytics across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, and Music. Real-time subscriber counts, follower growth, earnings estimates, and rankings updated daily."
        keywords="youtube statistics, tiktok statistics, twitch statistics, kick statistics, subscriber count, follower count, creator analytics"
      />

      <main className="bg-[#fafafa] text-neutral-900">

        {/* ============== CINEMATIC HERO ==============
            Full-bleed hero — section min-height ensures the bg image + left stack always have room.
            Hard bottom edge (no gradient fade) per project preference. */}
        <section className="relative isolate overflow-hidden grain-dark bg-[#0a0a0f] text-white lg:min-h-[680px] flex flex-col">
          {/* Bespoke background — no stock photography, no gradient glow washes.
              Flat dark base plus a faint engineering dot-grid for texture only.
              Content (headline, search, focal card) carries all the visual weight. */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />

          {/* Fade to solid at the bottom edge so the section resolves cleanly
              into the page below, no hard seam. */}
          <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none bg-gradient-to-b from-transparent to-[#0a0a0f]" />

          {/* Two-column stage: headline, search and platforms on the left,
              the holographic card hand on the right (stacked on mobile,
              cards under the search). Replaced the drifting creator marquee
              (2026-09-25): it was the busiest thing on screen and said the
              least; the cards say the brand ("pull a shiny card"). */}
          <div className="relative flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 grid lg:grid-cols-[1.1fr,0.9fr] gap-6 lg:gap-10 items-center">
            <div className="text-center lg:text-left">
              {/* Headline — condensed to 2 lines, lighter weight above the fold.
                  Plain h1, not motion.h1: this text is the page's LCP element,
                  and animating it in from opacity:0 measurably delays LCP (a
                  fade-in means Chrome can't count it as painted until the
                  animation resolves). Confirmed via PageSpeed Insights on
                  2026-08-19 (poor 6.4s mobile LCP). No visual polish is worth
                  that on the single most time-sensitive element on the page. */}
              <h1
                className="font-black tracking-[-0.035em] leading-[0.95] text-white max-w-4xl mx-auto lg:mx-0"
                style={{ fontSize: 'clamp(2.25rem, 4.6vw, 4rem)' }}
              >
                <span className="block">Analytics for every</span>
                <RotatingHeadlineWord />
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/60 max-w-lg mx-auto lg:mx-0 text-pretty">
                Live stats, growth and rankings for {heroCreatorCount} creators across {PLATFORM_COUNT} platforms. Every one of them has a holographic card.
              </p>

              {/* Glass search — the page's primary action */}
              <motion.form
                onSubmit={handleSearch}
                role="search"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-8 max-w-xl mx-auto lg:mx-0"
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
                className="mt-7 flex flex-wrap justify-center lg:justify-start items-center gap-x-5 gap-y-3 max-w-md mx-auto lg:mx-0"
              >
                {PLATFORMS.map(({ id, name, Icon, accent }) => (
                  <Link
                    key={id}
                    to={`/rankings/${id}`}
                    aria-label={name}
                    title={name}
                    // p-1.5 -m-1.5: expands the tap target past the 18-22px
                    // icon to comfortably clear 24px (flagged by PageSpeed),
                    // while the matching negative margin keeps the row's gap
                    // spacing visually identical to before.
                    className={`p-1.5 -m-1.5 flex items-center justify-center ${id === 'youtube' ? '' : 'opacity-70 hover:opacity-100 transition-opacity'}`}
                  >
                    <Icon className="w-[18px] h-[18px]" style={{ color: accent }} />
                  </Link>
                ))}
              </motion.div>

              {/* Featured Listings CTA — sits under the platform icons, the
                  last thing in the post-search stack. Deliberately a quiet
                  text link now (2026-09-07), not a bordered card: this page's
                  job is search, and /promote itself now does the actual
                  selling, so this only needs to be a low-friction pointer to
                  it, not a second pitch competing with the search bar for
                  attention. Amber stays the one accent, this site's
                  established Featured Listings / Premium color. */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mt-7 sm:mt-8 flex justify-center lg:justify-start"
              >
                <Link
                  to="/promote"
                  className="group inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  <Megaphone className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="font-medium text-amber-300">Get Featured</span>
                  <span className="hidden sm:inline text-white/40">&middot; Sponsored placement in the rankings</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                </Link>
              </motion.div>
            </div>

            <HeroCardStage creators={heroCards} />
          </div>
        </section>

        {/* ============== WHAT'S INSIDE ============== */}
        <HomeProductBento
          youtubeTop={youtubeTop}
          topHistory={topHistory}
          liveStats={liveStats}
        />

        {/* ============== CHAMPIONS ============== */}
        <ChampionsGrid tops={topByPlatform} />

        {/* ============== SPONSORED PLACEMENT ============== */}
        <HomeSponsorBand topCreators={topCreators} />

        {/* ============== BLOG TEASER ============== */}
        <BlogTeaser posts={latestPosts} />

        {/* ============== FOOTER CTA ============== */}
        <section className="border-t border-neutral-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 mb-3">
              Start tracking creators in seconds.
            </h2>
            <p className="text-base text-neutral-600 max-w-xl mx-auto mb-7">
              Free. No signup required to browse. Sign in to follow creators and save comparisons.
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
