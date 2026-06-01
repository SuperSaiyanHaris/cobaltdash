import { Link, useNavigate } from 'react-router-dom';
import {
  Search, ArrowRight, ArrowUpRight, Calculator, Scale, TrendingUp, Trophy,
  Youtube, Twitch, BarChart3, BookOpen, Sparkles, Zap, LineChart, Star,
  DollarSign, Users, User,
} from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import { Music } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEO from '../components/SEO';
import { getAllPosts } from '../services/blogService';
import { getRankedCreators } from '../services/creatorService';
import { supabase } from '../lib/supabase';
import { formatNumber } from '../lib/utils';
import CreatorAvatar from '../components/CreatorAvatar';
import CountUp from '../components/CountUp';
import Sparkline from '../components/Sparkline';
import FeaturedListingPreview from '../components/FeaturedListingPreview';
import { PLATFORM_COUNT } from '../lib/constants';

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', Icon: Youtube,     accent: '#ef4444', tone: 'red',     gradient: 'from-red-500 to-rose-600',          shadow: 'shadow-red-500/25',     hoverShadow: 'group-hover:shadow-red-500/40',     blurb: 'Subscribers · views · earnings' },
  { id: 'tiktok',  name: 'TikTok',  Icon: TikTokIcon,  accent: '#ec4899', tone: 'pink',    gradient: 'from-pink-500 to-rose-600',         shadow: 'shadow-pink-500/25',    hoverShadow: 'group-hover:shadow-pink-500/40',    blurb: 'Followers · likes · video count' },
  { id: 'twitch',  name: 'Twitch',  Icon: Twitch,      accent: '#a855f7', tone: 'purple',  gradient: 'from-purple-500 to-violet-700',     shadow: 'shadow-purple-500/25',  hoverShadow: 'group-hover:shadow-purple-500/40',  blurb: 'Followers · hours watched · peak' },
  { id: 'kick',    name: 'Kick',    Icon: KickIcon,    accent: '#22c55e', tone: 'green',   gradient: 'from-green-500 to-emerald-600',     shadow: 'shadow-green-500/25',   hoverShadow: 'group-hover:shadow-green-500/40',   blurb: 'Paid subs · hours watched' },
  { id: 'bluesky', name: 'Bluesky', Icon: BlueskyIcon, accent: '#0ea5e9', tone: 'sky',     gradient: 'from-sky-500 to-cyan-600',          shadow: 'shadow-sky-500/25',     hoverShadow: 'group-hover:shadow-sky-500/40',     blurb: 'Followers · posts' },
  { id: 'music',   name: 'Music',   Icon: Music,         accent: '#f59e0b', tone: 'amber',   gradient: 'from-amber-500 to-orange-600',      shadow: 'shadow-amber-500/25',   hoverShadow: 'group-hover:shadow-amber-500/40',   blurb: 'Listeners · plays' },
  { id: 'mastodon',name: 'Mastodon',Icon: MastodonIcon,  accent: '#7c3aed', tone: 'violet',  gradient: 'from-violet-500 to-purple-700',     shadow: 'shadow-violet-500/25',  hoverShadow: 'group-hover:shadow-violet-500/40',  blurb: 'Followers · posts' },
  { id: 'rumble',  name: 'Rumble',  Icon: RumbleIcon,    accent: '#65a30d', tone: 'lime',    gradient: 'from-lime-500 to-green-700',        shadow: 'shadow-lime-500/25',    hoverShadow: 'group-hover:shadow-lime-500/40',    blurb: 'Followers · videos' },
  { id: 'substack',name: 'Substack',Icon: SubstackIcon,  accent: '#ea580c', tone: 'orange',  gradient: 'from-orange-500 to-amber-600',      shadow: 'shadow-orange-500/25',  hoverShadow: 'group-hover:shadow-orange-500/40',  blurb: 'Subscriber reach · rank' },
];

const HEADLINE_ROTATIONS = ['YouTuber', 'TikToker', 'Streamer', 'Artist', 'Creator'];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [latestPosts, setLatestPosts] = useState([]);
  const [topCreators, setTopCreators] = useState([]);
  const [liveStats, setLiveStats] = useState({ creators: null, dataPoints: null });
  const [wordIndex, setWordIndex] = useState(0);
  const navigate = useNavigate();

  // Rotating headline word
  useEffect(() => {
    const id = setInterval(() => setWordIndex((i) => (i + 1) % HEADLINE_ROTATIONS.length), 2400);
    return () => clearInterval(id);
  }, []);

  // Live counts from DB.
  // `count: 'exact'` is exact-but-slow and times out on multi-million row tables;
  // `count: 'estimated'` uses Postgres reltuples for an instant approximation.
  useEffect(() => {
    Promise.all([
      supabase.from('creators').select('*', { count: 'exact', head: true }).then(r => r.count),
      supabase.from('creator_stats').select('*', { count: 'estimated', head: true }).then(r => r.count),
    ]).then(([creators, dataPoints]) => {
      setLiveStats({ creators: creators || 0, dataPoints: dataPoints || 0 });
    }).catch(() => {});
  }, []);

  // Marquee = YouTube top 20 + Twitch top 20, shuffled. (User: only these two platforms in ticker.)
  // topByPlatform = #1 creator on each platform we track — rotated through the floating card.
  const [marqueeCreators, setMarqueeCreators] = useState([]);
  const [topByPlatform, setTopByPlatform] = useState([]);
  const [topPlatformIdx, setTopPlatformIdx] = useState(0);
  useEffect(() => {
    Promise.all([
      getRankedCreators('youtube', 'subscribers', 20),
      getRankedCreators('twitch', 'subscribers', 20),
      getRankedCreators('tiktok', 'subscribers', 1),
      getRankedCreators('kick', 'subscribers', 1),
      getRankedCreators('bluesky', 'subscribers', 1),
      getRankedCreators('music', 'subscribers', 1),
      getRankedCreators('mastodon', 'subscribers', 1),
      getRankedCreators('rumble', 'subscribers', 1),
      getRankedCreators('substack', 'subscribers', 1),
    ]).then(([yt, tw, tt, kk, bs, mu, ma, rb, sb]) => {
      // Marquee: YouTube + Twitch, shuffled
      const pool = [...yt, ...tw].filter(c => c?.profile_image && c?.display_name);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      setMarqueeCreators(pool);

      // #1 per platform for rotating bento card. Each platform uses its own metric.
      const top1 = [
        yt[0] && { ...yt[0], _platformLabel: '#1 YouTuber',         _metricLabel: 'subscribers' },
        tt[0] && { ...tt[0], _platformLabel: '#1 TikToker',         _metricLabel: 'followers' },
        tw[0] && { ...tw[0], _platformLabel: '#1 Twitch Streamer',  _metricLabel: 'followers' },
        kk[0] && { ...kk[0], _platformLabel: '#1 Kick Streamer',    _metricLabel: 'paid subscribers' },
        bs[0] && { ...bs[0], _platformLabel: '#1 on Bluesky',       _metricLabel: 'followers' },
        mu[0] && { ...mu[0], _platformLabel: '#1 Artist',           _metricLabel: 'monthly listeners' },
        ma[0] && { ...ma[0], _platformLabel: '#1 on Mastodon',      _metricLabel: 'followers' },
        rb[0] && { ...rb[0], _platformLabel: '#1 on Rumble',        _metricLabel: 'followers' },
        sb[0] && { ...sb[0], _platformLabel: '#1 on Substack',      _metricLabel: 'subscribers' },
      ].filter(Boolean);
      setTopByPlatform(top1);

      // Product preview leaderboard still YouTube top 5
      setTopCreators(yt.slice(0, 5));
    }).catch(() => {});
  }, []);

  // Rotate the floating #1 card across platforms every 4s
  useEffect(() => {
    if (topByPlatform.length === 0) return;
    const id = setInterval(() => {
      setTopPlatformIdx((i) => (i + 1) % topByPlatform.length);
    }, 4000);
    return () => clearInterval(id);
  }, [topByPlatform.length]);

  // Product preview carousel: rotates through 4 page mockups (rankings, profile, compare, earnings)
  const [previewIdx, setPreviewIdx] = useState(0);
  const PREVIEW_COUNT = 4;
  useEffect(() => {
    const id = setInterval(() => setPreviewIdx((i) => (i + 1) % PREVIEW_COUNT), 9000);
    return () => clearInterval(id);
  }, []);

  // Latest blog posts
  useEffect(() => {
    getAllPosts().then(posts => setLatestPosts(posts.slice(0, 3))).catch(() => {});
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'ShinyPull',
            url: 'https://shinypull.com',
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: 'https://shinypull.com/search?q={search_term_string}' },
              'query-input': 'required name=search_term_string',
            },
          }).replace(/<\/script>/gi, '<\\/script>'),
        }}
      />

      <main className="bg-[#fafafa] text-neutral-900">

        {/* ============== CINEMATIC HERO ==============
            Full-bleed hero — section min-height ensures the bg image + left stack always have room.
            Hard bottom edge (no gradient fade) per project preference. */}
        <section className="relative isolate overflow-hidden grain-dark bg-[#0a0a0f] text-white min-h-[720px] md:min-h-[900px]">
          {/* Background photo — two crops served via show/hide so neither
              orientation gets stretched. Mobile asset is a tall/portrait crop
              matched to the section's min-height; desktop is the wide hero.
              object-center keeps the focal point (the rising chart) inside
              the visible viewport on both. */}
          <img
            src="/hero-bg-mobile2.jpeg"
            alt=""
            aria-hidden="true"
            className="block md:hidden absolute inset-0 w-full h-full object-cover object-center opacity-90"
          />
          <img
            src="/hero-bg2.jpeg"
            alt=""
            aria-hidden="true"
            className="hidden md:block absolute inset-0 w-full h-full object-cover opacity-90"
          />

          {/* Light dark overlay for text legibility without washing out the artwork. */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#0a0a0f]/40 via-[#0a0a0f]/35 to-[#0a0a0f]" />

          {/* TOP MARQUEE — randomized top creators across platforms */}
          {marqueeCreators.length > 0 && (
            <div className="relative pt-5 pb-1 overflow-hidden mask-gradient">
              <div
                className="flex gap-4 sm:gap-6 animate-marquee whitespace-nowrap"
                style={{ width: 'max-content' }}
              >
                {[...marqueeCreators, ...marqueeCreators].map((c, i) => (
                  <Link
                    key={`${c.id}-${i}`}
                    to={`/${c.platform}/${c.username}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-full backdrop-blur-md hover:bg-white/[0.12] transition-colors"
                  >
                    <CreatorAvatar src={c.profile_image} name={c.display_name} size="xs" />
                    <span className="text-xs font-semibold text-white/90">{c.display_name}</span>
                    <span className="text-[10px] text-white/50 tabular-nums">{formatNumber(c.subscribers)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Center stage */}
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-16 pb-10 sm:pb-28">

            {/* Eyebrow badge */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex justify-center mb-7"
            >
              <Link
                to="/promote"
                className="group inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.07] border border-white/15 rounded-full text-xs font-medium text-white/80 backdrop-blur-md hover:bg-white/[0.12] transition-all"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span><span className="font-semibold text-white">Featured Listings</span> are live</span>
                <ArrowRight className="w-3 h-3 text-white/50 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </motion.div>

            {/* Headline — condensed to 2 lines, lighter weight above the fold */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="text-center font-black tracking-[-0.035em] leading-[0.95] text-white max-w-4xl mx-auto"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 5rem)' }}
            >
              <span className="block">Analytics for every</span>
              <span className="relative block overflow-hidden mt-1">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={wordIndex}
                    initial={{ opacity: 0, y: '30%' }}
                    animate={{ opacity: 1, y: '0%' }}
                    exit={{ opacity: 0, y: '-30%' }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-block bg-gradient-to-br from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent"
                  >
                    {HEADLINE_ROTATIONS[wordIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.h1>

            {/* Glass search */}
            <motion.form
              onSubmit={handleSearch}
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
                  placeholder="Search any creator: MrBeast, Ninja, Charli D'Amelio..."
                  className="w-full pl-12 pr-32 py-4 bg-transparent text-white placeholder-white/40 focus:outline-none text-base"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 inline-flex items-center gap-1.5 px-4 py-2.5 bg-white text-neutral-900 hover:bg-white/90 text-sm font-semibold rounded-xl transition-colors"
                >
                  Search
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Try chips */}
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs text-white/50">Try:</span>
                {['mrbeast', 'ninja', 'pewdiepie', 'kaicenat', 'taylor swift'].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)}
                    className="text-xs font-medium text-white/70 hover:text-white bg-white/[0.06] border border-white/10 hover:border-white/25 hover:bg-white/[0.12] rounded-full px-2.5 py-1 transition-all backdrop-blur-md"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.form>

            {/* Platform pills — compact glass row to keep links to each ranking */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-12 flex flex-wrap justify-center gap-2 sm:gap-3 max-w-3xl mx-auto"
            >
              {PLATFORMS.map(({ id, name, Icon, accent }) => (
                <Link
                  key={id}
                  to={`/rankings/${id}`}
                  className="group inline-flex items-center gap-2 px-3.5 py-2 bg-white/[0.06] border border-white/10 hover:border-white/30 hover:bg-white/[0.12] rounded-full backdrop-blur-md transition-all"
                  style={{ '--accent': accent }}
                >
                  <Icon className="w-4 h-4 transition-colors" style={{ color: accent }} />
                  <span className="text-sm font-semibold text-white/90 group-hover:text-white">{name}</span>
                </Link>
              ))}
            </motion.div>

          </div>

          {/* LEFT FOCAL CARD — the rotating #1-per-platform creator, centered vertically
              in the empty left half of the BG image. Featured Listings used to share this
              column but moved to its own browser-mockup preview section below.
              Bigger size (24rem) + larger typography because it's the only thing here now. */}
          {topByPlatform.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="hidden min-[1280px]:flex absolute top-1/2 -translate-y-1/2 flex-col gap-5 w-[24rem]"
              style={{ left: 'max(2rem, calc(50% - 30rem - 25rem))' }}
            >
              {/* Live activity ribbon */}
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-flex items-center gap-2 self-start px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-400/25 rounded-full backdrop-blur-md"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-300">Live across {PLATFORM_COUNT} platforms</span>
              </motion.div>

              {/* Rotating #1 platform card — enlarged */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={topPlatformIdx}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      to={`/${topByPlatform[topPlatformIdx].platform}/${topByPlatform[topPlatformIdx].username}`}
                      className="group block bg-white/[0.07] backdrop-blur-xl border border-white/15 rounded-3xl p-7 shadow-2xl shadow-black/50 hover:bg-white/[0.12] hover:border-white/30 transition-all"
                    >
                      <div className="flex items-center gap-4 mb-5">
                        <CreatorAvatar src={topByPlatform[topPlatformIdx].profile_image} name={topByPlatform[topPlatformIdx].display_name} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white/50 uppercase tracking-wider font-bold">{topByPlatform[topPlatformIdx]._platformLabel}</p>
                          <p className="text-lg font-bold text-white truncate">{topByPlatform[topPlatformIdx].display_name}</p>
                        </div>
                      </div>
                      <p className="text-5xl font-black text-white tabular-nums leading-none">
                        <CountUp value={topByPlatform[topPlatformIdx].subscribers || 0} />
                      </p>
                      <p className="text-sm text-white/55 mt-2">{topByPlatform[topPlatformIdx]._metricLabel}</p>
                      <div className="mt-4">
                        <Sparkline data={[10, 12, 11, 14, 16, 18, 17, 20, 22, 24]} width={336} height={40} trend="up" />
                      </div>
                    </Link>
                  </motion.div>
                </AnimatePresence>
                {/* Platform indicator dots */}
                <div className="flex justify-center gap-1.5 mt-4">
                  {topByPlatform.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 rounded-full transition-all ${i === topPlatformIdx ? 'w-6 bg-white' : 'w-1 bg-white/30'}`}
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
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

            {/* Build the carousel previews. All four reuse the same browser shell; only chrome URL + inner content + CTA differ. */}
            {(() => {
              const fallbackNames = ['MrBeast', 'T-Series', 'Cocomelon', 'SET India', 'Vlad and Niki'];
              const mr = topCreators[0];
              const tseries = topCreators[1];
              const cocomelon = topCreators[2];
              const sampleSubs = mr?.subscribers || 482_000_000;

              const previews = [
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
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Updated 2 min ago</span>
                      </div>
                      <div className="space-y-1">
                        {(topCreators.length > 0 ? topCreators : Array(5).fill(null)).slice(0, 5).map((creator, i) => {
                          const displayName = creator?.display_name || fallbackNames[i];
                          return (
                            <div key={creator?.id || i} className="grid grid-cols-[28px_1fr_auto_auto] sm:grid-cols-[28px_1fr_100px_70px] items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-lg">
                              <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                                i === 0 ? 'bg-gradient-to-br from-amber-100 to-yellow-200 text-amber-800 ring-1 ring-amber-300' :
                                i === 1 ? 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 ring-1 ring-slate-300' :
                                i === 2 ? 'bg-gradient-to-br from-orange-100 to-amber-200 text-orange-800 ring-1 ring-orange-300' :
                                'bg-neutral-100 text-neutral-500'
                              }`}>{i + 1}</span>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <CreatorAvatar src={creator?.profile_image} name={displayName} size="sm" />
                                <p className="text-sm font-semibold text-neutral-900 truncate">{displayName}</p>
                              </div>
                              <div className="hidden sm:flex items-center justify-end">
                                <Sparkline data={[10, 12, 11, 14, 16, 18, 17, 20]} width={80} height={20} trend="up" />
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-neutral-900 tabular-nums">
                                  {creator?.subscribers ? formatNumber(creator.subscribers) : '—'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
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
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[10px] font-semibold text-emerald-700">
                          <TrendingUp className="w-3 h-3" />
                          +1.2M / 30d
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                        <div className="p-2.5 sm:p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Subscribers</p>
                          <p className="text-base sm:text-xl font-extrabold text-neutral-900 tabular-nums">{formatNumber(sampleSubs)}</p>
                        </div>
                        <div className="p-2.5 sm:p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Total Views</p>
                          <p className="text-base sm:text-xl font-extrabold text-neutral-900 tabular-nums">{formatNumber(mr?.totalViews || 99_000_000_000)}</p>
                        </div>
                        <div className="p-2.5 sm:p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Videos</p>
                          <p className="text-base sm:text-xl font-extrabold text-neutral-900 tabular-nums">{formatNumber(mr?.totalPosts || 850)}</p>
                        </div>
                      </div>
                      <div className="p-3 sm:p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg">
                        <p className="text-[10px] text-indigo-600 uppercase tracking-wider font-bold mb-2">30-day subscriber growth</p>
                        <Sparkline data={[470, 472, 474, 475, 476, 477, 478, 479, 480, 481, 482]} width={500} height={48} trend="up" fluid />
                      </div>
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
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Live</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {[mr, tseries].map((c, i) => {
                          const name = c?.display_name || fallbackNames[i];
                          const subs = c?.subscribers || (i === 0 ? 482_000_000 : 311_000_000);
                          return (
                            <div key={i} className={`p-3 sm:p-4 rounded-xl border ${i === 0 ? 'bg-indigo-50/60 border-indigo-200' : 'bg-amber-50/60 border-amber-200'}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <CreatorAvatar src={c?.profile_image} name={name} size="sm" />
                                <p className="text-sm font-bold text-neutral-900 truncate">{name}</p>
                              </div>
                              <p className="text-xl sm:text-2xl font-extrabold text-neutral-900 tabular-nums leading-none">
                                {formatNumber(subs)}
                              </p>
                              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mt-1">Subscribers</p>
                              <div className="mt-3 pt-3 border-t border-neutral-200/60 space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-neutral-500">Views</span>
                                  <span className="font-semibold text-neutral-900 tabular-nums">{formatNumber(c?.totalViews || (i === 0 ? 99_000_000_000 : 280_000_000_000))}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-neutral-500">Videos</span>
                                  <span className="font-semibold text-neutral-900 tabular-nums">{formatNumber(c?.totalPosts || (i === 0 ? 850 : 24_000))}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-neutral-500">30d growth</span>
                                  <span className="font-semibold text-emerald-600 tabular-nums">+{i === 0 ? '1.2M' : '320K'}</span>
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
                // 4. EARNINGS CALCULATOR
                {
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
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">$0.50 - $4.00 CPM</span>
                      </div>
                      <div className="flex items-center gap-3 mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                        <CreatorAvatar src={mr?.profile_image} name={mr?.display_name || 'MrBeast'} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-neutral-900 truncate">{mr?.display_name || 'MrBeast'}</p>
                          <p className="text-[11px] text-neutral-500 tabular-nums">{formatNumber(mr?.totalViews || 99_000_000_000)} total views</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        {[
                          { label: 'Per day',   low: '$2.4K',  high: '$19.6K', color: 'emerald' },
                          { label: 'Per month', low: '$73K',   high: '$590K',  color: 'green' },
                          { label: 'Per year',  low: '$880K',  high: '$7M',    color: 'teal' },
                        ].map((row) => (
                          <div key={row.label} className={`p-3 bg-${row.color}-50/60 border border-${row.color}-200 rounded-lg`}>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1.5">{row.label}</p>
                            <p className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums leading-tight">{row.low}</p>
                            <p className="text-[10px] text-neutral-500">to</p>
                            <p className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums leading-tight">{row.high}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-neutral-500">
                        <DollarSign className="w-3 h-3" />
                        Estimate based on industry CPM ranges
                      </div>
                    </>
                  ),
                },
              ];

              const active = previews[previewIdx];

              return (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-10%' }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="relative rounded-2xl bg-white border border-neutral-200 shadow-xl shadow-neutral-200/60 overflow-hidden"
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
                            key={previewIdx}
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
                    <div className="p-4 sm:p-6 min-h-[420px] sm:min-h-[440px] flex flex-col">
                      <div className="flex-1">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={previewIdx}
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
                            key={previewIdx}
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

                  {/* Tabs / dot navigation */}
                  <div className="mt-5 flex items-center justify-center gap-2">
                    {previews.map((p, i) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setPreviewIdx(i)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          i === previewIdx
                            ? 'bg-neutral-900 border-neutral-900 text-white'
                            : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${i === previewIdx ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-300'}`} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Live stats strip under preview */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 grid grid-cols-3 max-w-3xl mx-auto bg-white border border-neutral-200 rounded-xl overflow-hidden"
            >
              {[
                { label: 'Creators tracked',  value: liveStats.creators ?? 0 },
                { label: 'Daily data points', value: liveStats.dataPoints ?? 0 },
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
          </div>
        </section>

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
            <p className="mt-4 text-base sm:text-lg text-neutral-600 max-w-2xl mx-auto">
              Everything you need to follow the creator economy. No paywalls. Just data.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {[
              {
                Icon: Trophy,
                title: 'Live Rankings',
                body: 'See the top creators on each platform updated daily. Sort by followers, views, or fastest growing.',
                to: '/rankings',
                accent: 'amber',
              },
              {
                Icon: Search,
                title: 'Universal Search',
                body: 'Look up any creator across six platforms with one search. Hit ⌘K from anywhere.',
                to: '/search',
                accent: 'indigo',
              },
              {
                Icon: Scale,
                title: 'Head-to-Head Compare',
                body: 'Stack creators side-by-side. Subscribers, views, watch hours, growth rates, all at once.',
                to: '/compare',
                accent: 'violet',
              },
              {
                Icon: TrendingUp,
                title: 'Trending This Month',
                body: 'The fastest-growing creators across every platform. Catch trends before they peak.',
                to: '/trending',
                accent: 'emerald',
              },
              {
                Icon: Calculator,
                title: 'Earnings Estimator',
                body: 'Estimate any YouTuber\'s ad revenue based on view counts and average CPM ranges.',
                to: '/youtube/money-calculator',
                accent: 'green',
              },
              {
                Icon: LineChart,
                title: 'Daily Growth History',
                body: 'Look back at how a creator has grown over weeks and months. Charts, deltas, milestones.',
                to: '/youtube/mrbeast',
                accent: 'sky',
              },
            ].map((feat, i) => {
              const colorMap = {
                amber:    'bg-amber-50 text-amber-600 border-amber-200',
                indigo:   'bg-indigo-50 text-indigo-600 border-indigo-200',
                violet:   'bg-violet-50 text-violet-600 border-violet-200',
                emerald:  'bg-emerald-50 text-emerald-600 border-emerald-200',
                green:    'bg-green-50 text-green-600 border-green-200',
                sky:      'bg-sky-50 text-sky-600 border-sky-200',
              };
              return (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <Link
                    to={feat.to}
                    className="group block h-full bg-white border border-neutral-200 rounded-2xl p-6 hover:border-neutral-300 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                  >
                    <div className={`w-11 h-11 rounded-xl border ${colorMap[feat.accent]} flex items-center justify-center mb-5`}>
                      <feat.Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-neutral-900 mb-2">{feat.title}</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed mb-4">{feat.body}</p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900 group-hover:gap-2 transition-all">
                      Open
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
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
        {latestPosts.length > 0 && (
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

            <div className="grid md:grid-cols-3 gap-5">
              {latestPosts.map((post, i) => (
                <motion.div
                  key={post.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="group block bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:border-neutral-300 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
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
          </section>
        )}

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
              <Link
                to="/rankings"
                className="inline-flex items-center gap-1.5 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Browse rankings
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('openCommandPalette'))}
                className="inline-flex items-center gap-1.5 px-6 py-3 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-neutral-900 font-semibold rounded-xl transition-all duration-200"
              >
                <Search className="w-4 h-4" />
                Search creators
                <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-neutral-100 border border-neutral-200 rounded text-neutral-500">
                  <span className="text-xs leading-none">⌘</span>K
                </kbd>
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
