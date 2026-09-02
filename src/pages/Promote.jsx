import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Megaphone, Trophy, TrendingUp, Shield, ArrowRight,
  Check, BarChart3, Users, Eye, Lock,
} from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import FeaturedListingPreview from '../components/FeaturedListingPreview';
import { getRankedCreators } from '../services/creatorService';
import { PLATFORM_COUNT } from '../lib/constants';
import { formatNumber } from '../lib/utils';

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

// Whole-card click target for the pricing tiers. Renders a <Link> when the
// tier is purchasable (hover = quiet border darkening + a faint bg tint,
// no lift/scale/shadow per the site's hover convention) or a plain
// non-interactive <div> when sold out.
function CardShell({ soldOut, to, onClick, className = '', hoverTint = 'hover:bg-neutral-50/60', children }) {
  const base = `${CARD} ${className} p-7 sm:p-8 transition-colors`;
  // Sold out: card content stays fully legible (no blanket opacity fade) —
  // the badge + disabled footer already say "unavailable" clearly, and a
  // washed-out card reads cheap. Just not interactive.
  if (soldOut) {
    return <div className={`${base} cursor-not-allowed select-none`}>{children}</div>;
  }
  return (
    <Link to={to} onClick={onClick} className={`group block ${base} hover:border-neutral-300 ${hoverTint}`}>
      {children}
    </Link>
  );
}

// Small dot + micro-label badge, same convention as the site's LIVE indicator
// elsewhere — just neutral-toned since "sold out" isn't an alert, it's status.
function SoldOutBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-600">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      Sold out
    </span>
  );
}

// Footer action row, full-bleed hairline separating it from the feature
// list. Purely visual when soldOut (the whole card is already non-clickable).
function CardFooter({ soldOut, label, tone }) {
  const toneClass = tone === 'amber' ? 'text-amber-600 group-hover:text-amber-700' : 'text-neutral-900';
  return (
    <div className="-mx-7 sm:-mx-8 px-7 sm:px-8 pt-4 border-t border-neutral-100">
      {soldOut ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 select-none">
          <Lock className="w-3.5 h-3.5" />
          Every slot is taken right now, check back soon
        </span>
      ) : (
        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${toneClass} group-hover:gap-3 transition-all`}>
          {label} <ArrowRight className="w-4 h-4" />
        </span>
      )}
    </div>
  );
}

/**
 * /promote, public landing page for Featured Listings.
 * Explains the product to potential B2B buyers without requiring auth.
 * "Get a featured listing" CTA → /account?tab=listings (auth gate downstream).
 */
export default function Promote() {
  const { isAuthenticated } = useAuth();
  // creators starts null (not 0) — 0 would render as a real, wrong number
  // for a moment before the count query resolves. Same "never fabricate a
  // 0 loading state" rule the Home hero's stats strip follows.
  const [stats, setStats] = useState({ creators: null, dailyVisitors: 12000 });
  const [topCreators, setTopCreators] = useState([]);
  // Sold-out flags per tier — true when every reserved slot across every
  // platform is currently filled. Drives the disabled "Sold out" state on
  // the Basic / Premium CTAs so users can't fall through to a checkout that
  // would fail validation in /account.
  const [premiumSoldOut, setPremiumSoldOut] = useState(false);
  const [basicSoldOut, setBasicSoldOut] = useState(false);

  useEffect(() => {
    supabase.from('creators').select('*', { count: 'exact', head: true })
      .then(r => setStats((s) => ({ ...s, creators: r.count || 0 })))
      .catch(() => {});
    // Fetch top 5 YouTube creators for the FeaturedListingPreview component
    // so the mockup shows real names, not fallbacks.
    getRankedCreators('youtube', 'subscribers', 5)
      .then((rows) => setTopCreators(rows || []))
      .catch(() => {});
    // Sold-out check — premium caps at 2 per platform (×8 = 16 total).
    // Basic capacity is huge (~98 slots × 8 platforms ≈ 784) so basic is
    // realistically never sold out, but we check anyway in case it does.
    const now = new Date().toISOString();
    const PREMIUM_TOTAL = PLATFORM_COUNT * 2;
    const BASIC_TOTAL = PLATFORM_COUNT * 98; // Top 500 fits 98 basic slots/platform
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

  // CTA click handler: signed-in users go straight to the Listings tab.
  // Signed-out users get the auth panel with a returnTo so they land in the right place.
  const handleCtaClick = (e) => {
    if (isAuthenticated) return; // let the Link navigate normally
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('openAuthPanel', {
      detail: {
        message: 'Create a free account to set up your featured listing. Takes about 30 seconds.',
        returnTo: '/account?tab=listings',
      },
    }));
  };
  const ctaHref = '/account?tab=listings';

  return (
    <>
      <SEO
        title="Featured Listings: Promote Your Creators on ShinyPull"
        description="Get your creator featured in our daily rankings. $49/mo for visibility across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music rankings. Premium slots from $149/mo."
        keywords="creator promotion, sponsored ranking, featured listing, B2B creator marketing, talent promotion, agency tools"
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Hero — white block, hairline rule, typographic. Amber is the Featured
            Listings product accent (functional, kept). */}
        <section className="bg-white border-b border-neutral-200/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-20 pb-12 sm:pb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-center max-w-3xl mx-auto"
            >
              <div className="inline-flex items-center gap-1.5 mb-5">
                <Megaphone className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-600">Featured Listings</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-neutral-900 mb-5 tracking-tight leading-[1.1]">
                Put your creator in front of <span className="text-amber-600">the people watching the data</span>
              </h1>

              <p className="text-base sm:text-lg text-neutral-500 mb-8 max-w-2xl mx-auto leading-relaxed">
                Get featured directly in our live rankings across every platform we track. Visibility next to MrBeast, Ninja, Charli D'Amelio. Cancel anytime.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {premiumSoldOut && basicSoldOut ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-100 text-neutral-400 font-medium rounded-lg cursor-not-allowed select-none"
                  >
                    <Lock className="w-4 h-4" />
                    Every slot is taken right now
                  </button>
                ) : (
                  <Link
                    to={ctaHref} onClick={handleCtaClick}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium rounded-lg transition-colors"
                  >
                    <Megaphone className="w-4 h-4" />
                    Get featured
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to="/rankings"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-neutral-800 text-sm font-medium rounded-lg transition-colors"
                >
                  See live rankings
                </Link>
              </div>

              {/* Quick stats strip — one bordered container, hairline-divided cells.
                  Plain formatNumber(), not CountUp: this renders instantly on mount
                  (no scroll-trigger), so an animate-from-0 would show a fabricated
                  "0" for a beat before the real count lands. */}
              <div className={`mt-12 grid grid-cols-3 max-w-2xl mx-auto ${CARD} divide-x divide-neutral-200/80`}>
                {[
                  { label: 'Creators tracked', value: stats.creators },
                  { label: 'Platforms covered', value: PLATFORM_COUNT },
                  { label: 'Pages per day', value: stats.dailyVisitors, suffix: '+' },
                ].map((s) => (
                  <div key={s.label} className="p-4 sm:p-5 text-center">
                    <p className="text-2xl sm:text-3xl font-semibold text-neutral-900 tabular-nums">
                      {s.value == null ? (
                        <span className="inline-block h-7 sm:h-8 w-12 rounded bg-neutral-100 animate-pulse align-middle" />
                      ) : (
                        <>{formatNumber(s.value)}{s.suffix}</>
                      )}
                    </p>
                    <p className={`${MICRO} mt-1.5`}>{s.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Live preview — moved up front, right after the hero. This is the
            thing buyers actually want to see first: what the slot looks like
            in a real rankings table, before they read a single price. */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-8">
            <p className={`${MICRO} text-amber-600 mb-2`}>Live preview</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900">This is what your slot looks like.</h2>
            <p className="mt-2 text-sm sm:text-base text-neutral-500">The exact card, in the exact table, that goes live under your name.</p>
          </div>
          <div className="max-w-3xl mx-auto">
            <FeaturedListingPreview topCreators={topCreators} showCtas={false} />
          </div>
        </section>

        {/* How it works — white block, takes over the visual weight the
            pricing section used to have here now that pricing moved down. */}
        <section className="bg-white border-y border-neutral-200/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900">How it works</h2>
              <p className="mt-2 text-sm sm:text-base text-neutral-500">Live in under a minute.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {[
                { Icon: Users,      title: 'Pick a creator',       body: `Search any creator across our ${PLATFORM_COUNT} platforms. If they're tracked here, they're eligible.`, tint: 'text-indigo-500' },
                { Icon: Megaphone,  title: 'Choose your slot',     body: 'Basic ($49) for steady visibility starting at rank 15. Premium ($149) for top-of-page placement.', tint: 'text-amber-500' },
                { Icon: TrendingUp, title: 'Live in minutes',      body: 'Stripe Checkout. Confirmation, then your creator appears on the live rankings page right away.', tint: 'text-emerald-600' },
              ].map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className={`${CARD} p-6 relative`}
                >
                  <span className="absolute top-5 right-5 text-xs font-medium text-neutral-300 tabular-nums">0{i + 1}</span>
                  <step.Icon className={`w-5 h-5 ${step.tint} mb-4`} />
                  <h3 className="text-base font-medium text-neutral-900 mb-1.5">{step.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing tiers — right after "How it works", ahead of the FAQ.
            The entire card is the click target, not just the CTA line at
            the bottom. */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-12">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900">Two ways to get featured</h2>
            <p className="mt-2 text-sm sm:text-base text-neutral-500">Pick the slot. Pick the platform. Live in minutes.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {/* Basic */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <CardShell
                soldOut={basicSoldOut}
                to={ctaHref}
                onClick={handleCtaClick}
                className="border-neutral-200/80"
              >
                <div className="flex items-center gap-2">
                  <span className={`${MICRO} text-neutral-500`}>Basic</span>
                  {basicSoldOut && <SoldOutBadge />}
                </div>
                <p className="text-4xl font-semibold text-neutral-900 mt-2 tabular-nums">$49<span className="text-base font-normal text-neutral-400">/mo</span></p>
                <p className="text-sm text-neutral-500 mt-4 mb-6">Placed starting at rank 15, then every 5 rows. Visible on the rankings page anyone hits looking for top creators.</p>
                <ul className="space-y-2.5 mb-7">
                  {[
                    'Rank 15, 20, 25, 30... on your chosen platform',
                    'Shows on both desktop and mobile rankings',
                    'Cancel anytime',
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-neutral-700">
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CardFooter soldOut={basicSoldOut} label="Get a Basic slot" tone="neutral" />
              </CardShell>
            </motion.div>

            {/* Premium — one amber top rule is the differentiation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <CardShell
                soldOut={premiumSoldOut}
                to={ctaHref}
                onClick={handleCtaClick}
                className="border-t-2 border-t-amber-400 hover:border-t-amber-500"
                hoverTint="hover:bg-amber-50/40"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-600">⭐ Premium</span>
                  {premiumSoldOut ? (
                    <SoldOutBadge />
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-medium text-amber-700">Only 2 slots / platform</span>
                  )}
                </div>
                <p className="text-4xl font-semibold text-neutral-900 mt-2 tabular-nums">$149<span className="text-base font-normal text-neutral-400">/mo</span></p>
                <p className="text-sm text-neutral-500 mt-4 mb-6">Top-of-page placement between ranks 4-5 and 9-10. The first thing readers see when comparing top creators.</p>
                <ul className="space-y-2.5 mb-7">
                  {[
                    'Between rank 4-5 and 9-10, top of fold visibility',
                    'Golden card treatment, ⭐ Premium label',
                    'Maximum 2 slots per platform. Scarce inventory.',
                    'Cancel anytime',
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-neutral-700">
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CardFooter soldOut={premiumSoldOut} label="Get a Premium slot" tone="amber" />
              </CardShell>
            </motion.div>
          </div>
        </section>

        {/* FAQ — white block, takes over the visual weight pricing had here
            before it moved up above this section. */}
        <section className="bg-white border-y border-neutral-200/80">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 text-center mb-10">FAQ</h2>
            <div className="space-y-3">
              {[
                {
                  q: 'Can I feature someone who isn\'t in your database?',
                  a: 'For YouTube, Twitch, Kick, Bluesky, Mastodon, and Music: we add new creators continuously. If they aren\'t tracked yet, request them via the Search page. For TikTok, the Listings page has an instant-add flow that pulls their profile in seconds.',
                },
                {
                  q: 'How is this different from a regular ad?',
                  a: 'Featured Listings appear inside our actual ranked tables, not in display banner slots. People are already reading those rows when they look up creators, so attention is built-in.',
                },
                {
                  q: 'Are featured slots labeled?',
                  a: 'Yes. Basic shows as "Sponsored" and Premium shows as "⭐ Premium". We don\'t hide that they\'re paid placements. Clarity makes the format trustworthy.',
                },
                {
                  q: 'Can I cancel?',
                  a: 'Anytime, from the Listings tab in your account. Cancellation stops the next renewal. Your placement stays active through the end of the current billing period.',
                },
                {
                  q: 'What happens if a slot is taken?',
                  a: 'Slots are first come, first served. When the slot you want is full, checkout is disabled for that tier until an opening frees up. The moment someone above you cancels or their listing expires, every lower placement automatically moves up one position and the next available slot opens for purchase. No manual waitlist.',
                },
              ].map((item) => (
                <div key={item.q} className={`${CARD} p-5`}>
                  <h3 className="font-medium text-neutral-900 mb-1.5">{item.q}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 mb-3">Ready to get featured?</h2>
            <p className="text-sm text-neutral-500 mb-6 max-w-xl mx-auto">
              {premiumSoldOut && basicSoldOut
                ? 'All slots are currently filled. The queue moves the moment a slot opens, check back soon.'
                : 'Most listings go live in under 60 seconds.'}
            </p>
            {premiumSoldOut && basicSoldOut ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-100 text-neutral-400 font-medium rounded-lg cursor-not-allowed select-none"
              >
                <Lock className="w-4 h-4" />
                Every slot is taken right now
              </button>
            ) : (
              <Link
                to={ctaHref} onClick={handleCtaClick}
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium rounded-lg transition-colors"
              >
                <Megaphone className="w-4 h-4" />
                Start now
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
