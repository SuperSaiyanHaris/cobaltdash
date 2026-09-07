import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Megaphone, TrendingUp, ArrowRight,
  Check, Users, Lock,
} from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PreviewRankingRow from '../components/PreviewRankingRow';
import { getRankedCreators } from '../services/creatorService';
import { PLATFORM_COUNT } from '../lib/constants';
import { formatNumber } from '../lib/utils';

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const CELL = 'bg-white border border-neutral-200/80 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden';
// Quiet hover, matching the site's standard convention (border darken + a
// faint tint, no lift/scale/shadow bloom) — not the lift an early bento
// concept explored, kept consistent with every other card on the site.
const HOVERABLE = 'transition-colors hover:border-neutral-300';

const FALLBACK_NAMES = ['MrBeast', 'T-Series', 'Cocomelon', 'SET India', 'Vlad and Niki'];
const SPONSORED_INDEX = 3; // After rank #3, before #4 — mirrors /rankings injection point

const STEPS = [
  { Icon: Users,      title: 'Pick a creator', body: (n) => `Search any of the ${n} creators across our ${PLATFORM_COUNT} platforms. Already tracked means already eligible.` },
  { Icon: Megaphone,  title: 'Choose your slot', body: () => 'Basic ($49) for steady visibility starting at rank 15. Premium ($149) for top-of-page placement.' },
  { Icon: TrendingUp, title: 'Live in minutes', body: () => 'Stripe Checkout. Confirmation, then your creator appears on the live rankings page right away.' },
];

const FAQS = [
  {
    q: 'Are featured slots labeled?',
    a: 'Yes. Basic shows "Sponsored" and Premium shows "⭐ Premium." We don\'t hide that they\'re paid placements.',
  },
  {
    q: 'What happens if a slot is taken?',
    a: 'First come, first served. When someone above you cancels or expires, everyone below moves up automatically and the freed slot opens. No waitlist to manage.',
  },
  {
    q: 'Can I cancel?',
    a: 'Anytime, from the Listings tab in your account. Your placement stays active through the end of the current billing period.',
  },
];

// Whole-cell click target for the pricing tiers, same pattern the previous
// card layout used — the entire cell is the link when purchasable, a plain
// non-interactive div when sold out (never a washed-out fade, the badge and
// disabled footer already say "unavailable" clearly).
function PriceCell({ soldOut, to, onClick, className = '', children }) {
  const base = `${CELL} p-6 sm:p-7 ${className}`;
  if (soldOut) {
    return <div className={`${base} cursor-not-allowed select-none`}>{children}</div>;
  }
  return (
    <Link to={to} onClick={onClick} className={`group block ${base} ${HOVERABLE}`}>
      {children}
    </Link>
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

/**
 * /promote, public landing page for Featured Listings.
 * Explains the product to potential B2B buyers without requiring auth.
 * "Get a featured listing" CTA → /account?tab=listings (auth gate downstream).
 *
 * Bento layout (redesigned 2026-09-07, replacing the old stacked-sections
 * page): one grid holding the hero, the live stats, the real rankings
 * preview, how-it-works, both pricing tiers, the FAQ, and the final CTA,
 * so a buyer sees the whole pitch without much scrolling. Amber stays the
 * one accent (the site's existing Featured Listings / Premium color),
 * deliberately not the multi-color gradient an early concept explored —
 * that concept assumed the home hero's rotating word still used a fixed
 * gradient, which it doesn't anymore (it cycles solid per-platform brand
 * colors), so introducing a new gradient here would have had no real
 * precedent elsewhere on the site.
 */
export default function Promote() {
  const { isAuthenticated } = useAuth();
  // creators starts null (not 0) — 0 would render as a real, wrong number
  // for a moment before the count query resolves. Same "never fabricate a
  // 0 loading state" rule the Home hero's stats strip follows.
  const [stats, setStats] = useState({ creators: null, dailyVisitors: 12000 });
  const [topCreators, setTopCreators] = useState([]);
  const [premiumSoldOut, setPremiumSoldOut] = useState(false);
  const [basicSoldOut, setBasicSoldOut] = useState(false);

  useEffect(() => {
    supabase.from('creators').select('*', { count: 'exact', head: true })
      .then(r => setStats((s) => ({ ...s, creators: r.count || 0 })))
      .catch(() => {});
    getRankedCreators('youtube', 'subscribers', 5)
      .then((rows) => setTopCreators(rows || []))
      .catch(() => {});
    const now = new Date().toISOString();
    const PREMIUM_TOTAL = PLATFORM_COUNT * 2;
    const BASIC_TOTAL = PLATFORM_COUNT * 98;
    Promise.all([
      supabase.from('featured_listings').select('id', { count: 'exact', head: true })
        .eq('placement_tier', 'premium').eq('status', 'active').gt('active_until', now),
      supabase.from('featured_listings').select('id', { count: 'exact', head: true })
        .eq('placement_tier', 'basic').eq('status', 'active').gt('active_until', now),
    ]).then(([{ count: p }, { count: b }]) => {
      setPremiumSoldOut((p || 0) >= PREMIUM_TOTAL);
      setBasicSoldOut((b || 0) >= BASIC_TOTAL);
    }).catch(() => {});
  }, []);

  const handleCtaClick = (e) => {
    if (isAuthenticated) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('openAuthPanel', {
      detail: {
        message: 'Create a free account to set up your featured listing. Takes about 30 seconds.',
        returnTo: '/account?tab=listings',
      },
    }));
  };
  const ctaHref = '/account?tab=listings';
  const allSoldOut = premiumSoldOut && basicSoldOut;

  const rows = (topCreators.length > 0 ? topCreators : Array(5).fill(null)).slice(0, 5);

  return (
    <>
      <SEO
        title="Featured Listings: Promote Your Creators on ShinyPull"
        description="Get your creator featured in our daily rankings. $49/mo for visibility across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Substack, and Music rankings. Premium slots from $149/mo."
        keywords="creator promotion, sponsored ranking, featured listing, B2B creator marketing, talent promotion, agency tools"
      />

      <div className="min-h-screen bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex items-center gap-1.5 mb-6">
            <Megaphone className="w-3.5 h-3.5 text-amber-500" />
            <span className={MICRO}>Featured Listings</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(110px,auto)] gap-3">

            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={`${CELL} sm:col-span-2 lg:col-span-2 lg:row-span-2 p-6 sm:p-8 flex flex-col justify-center`}
            >
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 leading-[1.15]">
                Get seen in the same rankings as <span className="text-amber-600">MrBeast.</span>
              </h1>
              <p className="mt-3 text-sm sm:text-[15px] text-neutral-500 leading-relaxed max-w-md">
                A real sponsored row inside our live rankings tables across {PLATFORM_COUNT} platforms. Labeled, cancel anytime.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 mt-6">
                {allSoldOut ? (
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-100 text-neutral-400 text-sm font-medium rounded-lg cursor-not-allowed select-none">
                    <Lock className="w-4 h-4" />
                    Every slot is taken right now
                  </span>
                ) : (
                  <Link
                    to={ctaHref} onClick={handleCtaClick}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Megaphone className="w-4 h-4" />
                    Get featured
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to="/rankings"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-neutral-800 text-sm font-medium rounded-lg transition-colors"
                >
                  See live rankings
                </Link>
              </div>
            </motion.div>

            {/* Stat cells */}
            {[
              { label: 'Creators tracked', value: stats.creators },
              { label: 'Platforms covered', value: PLATFORM_COUNT },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 * (i + 1), ease: [0.16, 1, 0.3, 1] }}
                className={`${CELL} p-5 flex flex-col justify-center`}
              >
                <p className="text-2xl font-bold text-neutral-900 tabular-nums">
                  {s.value == null ? (
                    <span className="inline-block h-7 w-14 rounded bg-neutral-100 animate-pulse align-middle" />
                  ) : (
                    formatNumber(s.value)
                  )}
                </p>
                <p className={`${MICRO} mt-1`}>{s.label}</p>
              </motion.div>
            ))}

            {/* Live preview */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={`${CELL} sm:col-span-2 lg:col-span-2`}
            >
              <div className="px-5 pt-5 pb-1">
                <p className={MICRO}>Live preview</p>
              </div>
              <div>
                {rows.map((creator, i) => {
                  const items = [
                    <PreviewRankingRow key={creator?.id || i} rank={i + 1} creator={creator} fallbackName={FALLBACK_NAMES[i]} />,
                  ];
                  if (i === SPONSORED_INDEX - 1) {
                    items.push(
                      <div key="sponsored-demo" className="flex items-center gap-3 px-3 py-3 bg-amber-50/60 border-y border-amber-200">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 text-[11px] font-semibold flex-shrink-0">★</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 truncate">Your Creator Here</p>
                          <p className="text-[10px] text-amber-800 font-medium uppercase tracking-[0.1em]">Sponsored</p>
                        </div>
                        <span className="text-xs font-medium text-amber-700 flex-shrink-0">Claim →</span>
                      </div>
                    );
                  }
                  return items;
                })}
              </div>
            </motion.div>

            {/* How it works */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className={`${CELL} sm:col-span-2 lg:col-span-2 lg:row-span-2 p-6`}
            >
              <p className={`${MICRO} mb-1`}>How it works</p>
              <div className="divide-y divide-neutral-100">
                {STEPS.map((step) => (
                  <div key={step.title} className="flex items-start gap-3 py-4 first:pt-3">
                    <step.Icon className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-neutral-900">{step.title}</h3>
                      <p className="text-[13px] text-neutral-500 mt-0.5 leading-relaxed">{step.body(formatNumber(stats.creators ?? 0))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Basic pricing */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="sm:col-span-1 lg:col-span-2"
            >
              <PriceCell soldOut={basicSoldOut} to={ctaHref} onClick={handleCtaClick} className="h-full">
                <div className="flex items-center gap-2">
                  <span className={`${MICRO} text-neutral-500`}>Basic</span>
                  {basicSoldOut && <SoldOutBadge />}
                </div>
                <p className="text-3xl font-semibold text-neutral-900 mt-2 tabular-nums">$49<span className="text-base font-normal text-neutral-400">/mo</span></p>
                <p className="text-[13px] text-neutral-500 mt-3 mb-4">Rank 15, 20, 25... Desktop and mobile.</p>
                <ul className="space-y-1.5 mb-4">
                  {['Rank 15, 20, 25, 30...', 'Desktop and mobile', 'Cancel anytime'].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-700">
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-neutral-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                {basicSoldOut ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 select-none">
                    <Lock className="w-3.5 h-3.5" />
                    Every slot is taken right now
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900 group-hover:gap-3 transition-all">
                    Get a Basic slot <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </PriceCell>
            </motion.div>

            {/* Premium pricing — one amber top rule is the differentiation,
                same functional-color convention as the rest of the site. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="sm:col-span-1 lg:col-span-2"
            >
              <PriceCell
                soldOut={premiumSoldOut} to={ctaHref} onClick={handleCtaClick}
                className={`h-full border-t-2 border-t-amber-400 ${!premiumSoldOut ? 'hover:border-t-amber-500 hover:bg-amber-50/40' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-600">⭐ Premium</span>
                  {premiumSoldOut ? (
                    <SoldOutBadge />
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-medium text-amber-700">2 / platform</span>
                  )}
                </div>
                <p className="text-3xl font-semibold text-neutral-900 mt-2 tabular-nums">$149<span className="text-base font-normal text-neutral-400">/mo</span></p>
                <p className="text-[13px] text-neutral-500 mt-3 mb-4">Rank 4-5 &amp; 9-10, top of fold.</p>
                <ul className="space-y-1.5 mb-4">
                  {['Rank 4-5 and 9-10 placement', '⭐ Premium gold card treatment', 'Only 2 slots per platform', 'Cancel anytime'].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-700">
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                {premiumSoldOut ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 select-none">
                    <Lock className="w-3.5 h-3.5" />
                    Every slot is taken right now
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 group-hover:text-amber-700 group-hover:gap-3 transition-all">
                    Get a Premium slot <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </PriceCell>
            </motion.div>

            {/* FAQ */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`${CELL} sm:col-span-2 lg:col-span-4 p-6`}
            >
              <p className={`${MICRO} mb-4`}>FAQ</p>
              <div className="grid sm:grid-cols-3 gap-6">
                {FAQS.map((item) => (
                  <div key={item.q}>
                    <h3 className="text-sm font-medium text-neutral-900 mb-1">{item.q}</h3>
                    <p className="text-[13px] text-neutral-500 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Final CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="sm:col-span-2 lg:col-span-4 bg-neutral-900 rounded-2xl p-8 text-center flex flex-col items-center gap-4"
            >
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
                {allSoldOut ? 'All slots are currently filled. Check back soon.' : 'Most listings go live in under 60 seconds.'}
              </h2>
              {allSoldOut ? (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white/40 text-sm font-medium rounded-lg cursor-not-allowed select-none">
                  <Lock className="w-4 h-4" />
                  Every slot is taken right now
                </span>
              ) : (
                <Link
                  to={ctaHref} onClick={handleCtaClick}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-neutral-100 text-neutral-900 text-sm font-medium rounded-lg transition-colors"
                >
                  Start now
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}
