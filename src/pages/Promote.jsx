import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Lock, Search, X, Loader2 } from 'lucide-react';
import SEO from '../components/SEO';
import CreatorAvatar from '../components/CreatorAvatar';
import FlipCard from '../components/FlipCard';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getRankedCreators, getTopCreatorsByPlatform, searchCreators } from '../services/creatorService';
import { PLATFORM_COUNT, PLATFORM_DISPLAY_NAMES, isActivePlatform } from '../lib/constants';
import { CARD_PLATFORMS } from '../lib/badgeCard';
import { formatNumber } from '../lib/utils';

/**
 * /promote, the Featured Listings landing page ("Your Card" design,
 * 2026-09-25).
 *
 * The hero asks who you want to feature. Picking a creator flips their
 * holographic card in and slides a gold foil sponsored row into their own
 * platform's live top 5, exactly where a Premium slot renders on /rankings.
 * The call to action then carries that creator through sign-in to the
 * Account listing dialog (?feature=platform/username), so the buyer never
 * searches twice. Before a pick, the stage cycles through each platform's #1.
 *
 * Below the dark band: the two plans drawn as the rows they buy, how it
 * works, the FAQ, and a dark closing band. No glow anywhere (hard rule).
 */

const PULL_EVERY_MS = 7000;
const SPONSORED_AFTER = 3; // Premium ghost slot sits after #3 on /rankings
const PREMIUM_PER_PLATFORM = 2;
const BASIC_PER_PLATFORM = 98;

const STEPS = [
  { n: '01', title: 'Pick a creator', body: 'Any creator we track is eligible. Search above or from your account.' },
  { n: '02', title: 'Choose a slot', body: 'Basic ($49/mo) runs at rank 15, 20, 25 and down. Premium ($149/mo) sits near the top, two per platform.' },
  { n: '03', title: 'Go live', body: 'Pay with Stripe and the row shows up in the rankings right away. Cancel anytime.' },
];

const FAQS = [
  {
    q: 'Are featured slots labeled?',
    a: 'Yes. Every featured row carries an Ad label, and Premium rows get the gold foil treatment. We never pass them off as organic ranks.',
  },
  {
    q: 'What happens if a slot is taken?',
    a: 'First come, first served. When a listing above yours ends, everyone below moves up and the freed slot opens.',
  },
  {
    q: 'Can I cancel?',
    a: 'Anytime, from the Listings tab in your account. Your row stays up through the end of the billing period.',
  },
];

const platformName = (p) => PLATFORM_DISPLAY_NAMES[p] || CARD_PLATFORMS[p]?.name || p;

/** Organic row in the preview table (light, like /rankings). */
function OrganicRow({ rank, creator }) {
  return (
    <motion.div layout transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
      <span className="w-5 text-center text-sm font-bold tabular-nums text-neutral-400">{rank}</span>
      <CreatorAvatar src={creator?.profile_image} name={creator?.display_name || ' '} size="sm" />
      <span className="flex-1 min-w-0 text-sm font-semibold text-neutral-900 truncate">{creator?.display_name || ' '}</span>
      <span className="text-sm font-semibold text-neutral-900 tabular-nums">{creator?.subscribers ? formatNumber(creator.subscribers) : ''}</span>
    </motion.div>
  );
}

/** The gold foil Premium row, same build as the sponsored rows on /rankings. */
function FoilRow({ creator, price = '$149/mo', compact = false }) {
  return (
    <div className="sponsor-foil rounded-2xl p-[1.5px]">
      <div className={`relative flex items-center gap-3 rounded-[14px] bg-gradient-to-r from-amber-50 via-white to-amber-50 px-3 sm:px-4 ${compact ? 'py-2.5' : 'py-3'} overflow-hidden`}>
        <span aria-hidden="true" className="sponsor-shine" />
        <span className="relative inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px] font-bold uppercase tracking-[0.1em] bg-amber-100 border border-amber-300 text-amber-800 flex-shrink-0">Ad</span>
        {creator ? (
          <CreatorAvatar src={creator.profile_image} name={creator.display_name} size="lg" rounded="rounded-xl" className="relative !w-10 !h-10" />
        ) : (
          <span className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 flex items-center justify-center text-neutral-900 font-black flex-shrink-0">★</span>
        )}
        <span className="relative min-w-0 flex-1">
          <span className="block font-bold text-[15px] text-neutral-900 truncate">{creator ? creator.display_name : 'Your channel here'}</span>
          <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 truncate">Featured · Premium</span>
        </span>
        <span className="relative text-sm font-bold text-amber-700 tabular-nums whitespace-nowrap">{price}</span>
      </div>
    </div>
  );
}

/** Basic's row: amber edge, no foil, no shine. */
function BasicRow() {
  return (
    <div className="rounded-2xl p-[1.5px] bg-gradient-to-r from-amber-200 via-amber-300 to-amber-200">
      <div className="flex items-center gap-3 rounded-[14px] bg-gradient-to-r from-amber-50 via-white to-amber-50 px-3 sm:px-4 py-2.5">
        <span className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px] font-bold uppercase tracking-[0.1em] bg-amber-100 border border-amber-300 text-amber-800 flex-shrink-0">Ad</span>
        <span className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 font-black flex-shrink-0">★</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[15px] text-neutral-900 truncate">Your channel here</span>
          <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 truncate">Featured</span>
        </span>
        <span className="text-sm font-bold text-amber-700 tabular-nums whitespace-nowrap">$49/mo</span>
      </div>
    </div>
  );
}

function CreatorSearch({ picked, onPick, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seq.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const rows = await searchCreators(q);
        if (seq.current === mine) {
          setResults((rows || []).filter((c) => isActivePlatform(c.platform) && c.username).slice(0, 6));
          setActive(0);
        }
      } catch {
        if (seq.current === mine) setResults([]);
      } finally {
        if (seq.current === mine) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (c) => {
    onPick(c);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  if (picked) {
    return (
      <div className="flex items-center gap-3 w-full max-w-md rounded-xl bg-white/[0.06] border border-white/15 px-3 py-2.5">
        <CreatorAvatar src={picked.profile_image} name={picked.display_name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white truncate">{picked.display_name}</span>
          <span className="block text-[11px] text-white/60">{platformName(picked.platform)}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Change
        </button>
      </div>
    );
  }

  const showList = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <label htmlFor="promote-search" className="sr-only">Search for a creator to feature</label>
      <div className="flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-3 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]">
        <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        <input
          id="promote-search"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
            if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Who do you want to feature?"
          className="flex-1 min-w-0 bg-transparent text-[15px] text-neutral-900 placeholder-neutral-400 focus:outline-none"
        />
        {searching && <Loader2 className="w-4 h-4 text-neutral-400 animate-spin flex-shrink-0" />}
      </div>
      {showList && (
        <div className="absolute z-20 left-0 right-0 mt-2 rounded-xl bg-white border border-neutral-200 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)] overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-500">{searching ? 'Searching…' : 'No creators found. Try another name.'}</p>
          ) : results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${i === active ? 'bg-neutral-50' : ''}`}
            >
              <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" />
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900 truncate">{c.display_name || c.username}</span>
              <span className="text-[11px] font-medium text-neutral-500">{platformName(c.platform)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SoldOutBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-600">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      Sold out
    </span>
  );
}

export default function Promote() {
  const { isAuthenticated } = useAuth();
  const reduceMotion = useReducedMotion();
  const [creatorCount, setCreatorCount] = useState(null);
  const [samples, setSamples] = useState([]);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [top5, setTop5] = useState({}); // platform -> rows
  const [premiumSoldOut, setPremiumSoldOut] = useState(false);
  const [basicSoldOut, setBasicSoldOut] = useState(false);

  useEffect(() => {
    supabase.from('creators').select('*', { count: 'exact', head: true })
      .then((r) => setCreatorCount(r.count || null))
      .catch(() => {});
    getTopCreatorsByPlatform()
      .then((rows) => setSamples((rows || []).filter((c) => c?.username && isActivePlatform(c.platform) && CARD_PLATFORMS[c.platform])))
      .catch(() => {});
    const now = new Date().toISOString();
    Promise.all([
      supabase.from('featured_listings').select('id', { count: 'exact', head: true })
        .eq('placement_tier', 'premium').eq('status', 'active').gt('active_until', now),
      supabase.from('featured_listings').select('id', { count: 'exact', head: true })
        .eq('placement_tier', 'basic').eq('status', 'active').gt('active_until', now),
    ]).then(([{ count: p }, { count: b }]) => {
      setPremiumSoldOut((p || 0) >= PLATFORM_COUNT * PREMIUM_PER_PLATFORM);
      setBasicSoldOut((b || 0) >= PLATFORM_COUNT * BASIC_PER_PLATFORM);
    }).catch(() => {});
  }, []);

  // Before a pick, cycle the stage through each platform's #1.
  useEffect(() => {
    if (picked || reduceMotion || samples.length < 2) return;
    const t = setInterval(() => { if (!document.hidden) setSampleIdx((i) => (i + 1) % samples.length); }, PULL_EVERY_MS);
    return () => clearInterval(t);
  }, [picked, reduceMotion, samples.length]);

  const sample = samples.length ? samples[sampleIdx % samples.length] : null;
  const stageCreator = picked || sample;
  const platform = stageCreator?.platform || 'youtube';

  useEffect(() => {
    if (top5[platform]) return;
    let cancelled = false;
    getRankedCreators(platform, 'subscribers', 5)
      .then((rows) => { if (!cancelled) setTop5((m) => ({ ...m, [platform]: rows || [] })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [platform, top5]);

  const rows = useMemo(() => {
    const r = top5[platform] || [];
    return r.length ? r.slice(0, 5) : Array(5).fill(null);
  }, [top5, platform]);

  const featureParam = picked ? `&feature=${encodeURIComponent(`${picked.platform}/${picked.username}`)}` : '';
  const ctaHref = `/account?tab=listings${featureParam}`;
  const allSoldOut = premiumSoldOut && basicSoldOut;

  const handleCtaClick = useCallback((e) => {
    if (isAuthenticated) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('openAuthPanel', {
      detail: {
        message: 'Create a free account to set up your featured listing. Takes about 30 seconds.',
        returnTo: ctaHref,
      },
    }));
  }, [isAuthenticated, ctaHref]);

  const ctaLabel = picked ? `Feature ${picked.display_name}` : 'Get featured';

  return (
    <>
      <SEO
        title="Featured Listings: Promote Your Creators on ShinyPull"
        description={`Put your creator in our daily rankings. $49/mo for a featured row across ${PLATFORM_COUNT} platforms, Premium slots near the top from $149/mo. Labeled, cancel anytime.`}
        keywords="creator promotion, sponsored ranking, featured listing, B2B creator marketing, talent promotion, agency tools"
      />

      {/* ── Dark stage: search, card, live preview ── */}
      <section className="relative isolate z-20 bg-[#0a0a0f] text-white">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-14 sm:pb-20">
          <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-10 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-3">Featured listings</p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-balance">
                Get seen in the same rankings as <span className="text-amber-400">MrBeast.</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/70 max-w-lg mx-auto lg:mx-0 text-pretty">
                A gold sponsored row inside the live rankings on {PLATFORM_COUNT} platforms, in front of everyone checking who&apos;s on top.
              </p>

              <div className="mt-8 flex flex-col items-center lg:items-start gap-4">
                <CreatorSearch picked={picked} onPick={setPicked} onClear={() => setPicked(null)} />

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {allSoldOut ? (
                    <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white/60 text-sm font-semibold cursor-not-allowed select-none">
                      <Lock className="w-4 h-4" /> Every slot is taken right now
                    </span>
                  ) : (
                    <Link
                      to={ctaHref}
                      onClick={handleCtaClick}
                      className="inline-flex items-center gap-2 max-w-full px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-sm font-bold transition-colors"
                    >
                      <span className="truncate">{ctaLabel}</span>
                      <span className="whitespace-nowrap font-semibold text-neutral-800">from $49/mo</span>
                      <ArrowRight className="w-4 h-4 flex-shrink-0" />
                    </Link>
                  )}
                  <Link to={`/rankings/${platform}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white transition-colors">
                    See the live rankings <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <p className="text-xs text-white/50">
                  {creatorCount ? `${formatNumber(creatorCount)} creators` : 'Every creator we track'} across {PLATFORM_COUNT} platforms. Labeled as an ad, cancel anytime.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <FlipCard creator={stageCreator && { platform: stageCreator.platform, username: stageCreator.username, name: stageCreator.display_name, avatar: stageCreator.profile_image }} />
              <p className="mt-5 text-[13px] text-white/60 text-center min-h-[20px]">
                {picked ? `${picked.display_name} on ${platformName(picked.platform)}` : sample ? `#1 on ${platformName(sample.platform)}: ${sample.display_name}` : ' '}
              </p>
            </div>
          </div>

          {/* Where the row goes: the creator's own platform, live top 5,
              with the foil row sliding in after #3. Decorative, so hidden
              from screen readers; the copy above says the same thing. */}
          <div className="mt-12 sm:mt-16 max-w-2xl mx-auto">
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4">
              {picked ? `Here's where ${picked.display_name} shows up` : `Here's where you show up`} · {platformName(platform)} rankings
            </p>
            <div aria-hidden="true" className="rounded-2xl bg-white text-neutral-900 overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 bg-neutral-50">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Top {platformName(platform)}</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Live</span>
              </div>
              {rows.slice(0, SPONSORED_AFTER).map((c, i) => <OrganicRow key={c?.id || `a${i}`} rank={i + 1} creator={c} />)}
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={picked ? `${picked.platform}/${picked.username}` : 'ghost'}
                  layout
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-3 sm:px-4 py-2 border-b border-neutral-100">
                    <FoilRow creator={picked} />
                  </div>
                </motion.div>
              </AnimatePresence>
              {rows.slice(SPONSORED_AFTER, 5).map((c, i) => <OrganicRow key={c?.id || `b${i}`} rank={i + SPONSORED_AFTER + 1} creator={c} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Light: plans, how it works, FAQ ── */}
      <div className="bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">Two ways in</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">What you see is what you buy.</h2>
            <p className="mt-3 text-neutral-600">Each plan is exactly the row it puts in the rankings.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Basic */}
            <div className="rounded-2xl bg-white border border-neutral-200 p-6 sm:p-7 flex flex-col">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> Basic
                </p>
                {basicSoldOut && <SoldOutBadge />}
              </div>
              <p className="mt-2 text-4xl font-extrabold text-neutral-900 tabular-nums">$49<span className="text-base font-medium text-neutral-400">/mo</span></p>
              <div className="mt-5"><BasicRow /></div>
              <ul className="mt-5 space-y-2 flex-1">
                {['Rank 15, 20, 25 and down', 'Every page view, desktop and mobile', 'Cancel anytime'].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-neutral-700">
                    <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-400" />{f}
                  </li>
                ))}
              </ul>
              {basicSoldOut ? (
                <span className="mt-6 inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-400 select-none"><Lock className="w-4 h-4" /> Every slot is taken right now</span>
              ) : (
                <Link to={ctaHref} onClick={handleCtaClick} className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition-colors">
                  Get a Basic slot <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>

            {/* Premium */}
            <div className="sponsor-foil rounded-2xl p-[2px]">
              <div className="h-full rounded-[14px] bg-white p-6 sm:p-7 flex flex-col">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Premium
                  </p>
                  {premiumSoldOut ? <SoldOutBadge /> : (
                    <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-semibold text-amber-800">Only {PREMIUM_PER_PLATFORM} per platform</span>
                  )}
                </div>
                <p className="mt-2 text-4xl font-extrabold text-neutral-900 tabular-nums">$149<span className="text-base font-medium text-neutral-400">/mo</span></p>
                <div className="mt-5"><FoilRow compact /></div>
                <ul className="mt-5 space-y-2 flex-1">
                  {['Rank 4-5 or 9-10, near the top of the page', 'Gold foil row with the shine', 'Cancel anytime'].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-neutral-700">
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />{f}
                    </li>
                  ))}
                </ul>
                {premiumSoldOut ? (
                  <span className="mt-6 inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-400 select-none"><Lock className="w-4 h-4" /> Every slot is taken right now</span>
                ) : (
                  <Link to={ctaHref} onClick={handleCtaClick} className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-sm font-bold transition-colors">
                    Get a Premium slot <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="mt-16 grid sm:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl bg-white border border-neutral-200 p-6">
                <p className="text-xs font-bold tabular-nums text-amber-600">{s.n}</p>
                <h3 className="mt-2 text-base font-bold text-neutral-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div className="mt-16">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 mb-5">Questions</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {FAQS.map((item) => (
                <div key={item.q}>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">{item.q}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dark close ── */}
      <section className="relative isolate overflow-hidden bg-[#0a0a0f] text-white">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {allSoldOut ? 'Every slot is filled. Check back soon.' : 'Most listings go live in under a minute.'}
          </h2>
          {!allSoldOut && (
            <Link
              to={ctaHref}
              onClick={handleCtaClick}
              className="mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-sm font-bold transition-colors"
            >
              {ctaLabel} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
