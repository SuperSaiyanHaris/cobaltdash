import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import CreatorAvatar from './CreatorAvatar';
import { formatNumber } from '../lib/utils';

// "Show up at the top" band on the home page: a dark stage (echoing the hero)
// with a slice of the real YouTube rankings and the sponsored slot sitting in
// it as a gold foil row, where Premium placements really appear (after #3).
// Everything except the clearly labelled sponsored row is live data. The
// full pitch, plans and checkout live on /promote; the browser-mockup
// version (FeaturedListingPreview) stays there.

const PLANS = [
  { name: 'Basic', price: 49, note: 'Rank 15, 20, 25… on every platform' },
  { name: 'Premium', price: 149, note: 'Rank 4–5 and 9–10, gold card, 2 per platform' },
];

function Row({ rank, creator }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <span className="w-5 text-center text-sm font-bold tabular-nums text-white/40">{rank}</span>
      <CreatorAvatar src={creator?.profile_image} name={creator?.display_name || '—'} size="sm" />
      <span className="flex-1 min-w-0 text-sm font-semibold text-white/80 truncate">{creator?.display_name || ' '}</span>
      <span className="text-sm font-bold text-white/80 tabular-nums">{creator?.subscribers ? formatNumber(creator.subscribers) : ''}</span>
    </div>
  );
}

export default function HomeSponsorBand({ topCreators = [] }) {
  const rows = topCreators.length >= 5 ? topCreators : Array(5).fill(null);

  return (
    <section className="relative isolate overflow-hidden bg-[#0a0a0f] text-white">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 grid lg:grid-cols-[0.95fr,1.05fr] gap-10 lg:gap-14 items-center">
        <div className="scroll-reveal text-center lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-3">For brands &amp; creators</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">Show up at the top.</h2>
          <p className="mt-4 text-base sm:text-lg text-white/60 max-w-lg mx-auto lg:mx-0 text-pretty">
            A sponsored slot inside the live rankings, seen by everyone who comes to see who&apos;s on top.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-3 max-w-lg mx-auto lg:mx-0 text-left">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-2xl p-4 border ${p.name === 'Premium' ? 'border-amber-400/40 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${p.name === 'Premium' ? 'text-amber-300' : 'text-white/60'}`}>
                  {p.name === 'Premium' ? '★ ' : ''}{p.name}
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">${p.price}<span className="text-sm font-medium text-white/40">/mo</span></p>
                <p className="mt-1.5 flex gap-1.5 text-xs text-white/60 leading-snug">
                  <Check className="w-3.5 h-3.5 mt-px flex-shrink-0 text-emerald-400" />
                  {p.note}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
            <Link to="/promote" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-sm font-bold transition-colors">
              Claim a slot
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/rankings/youtube" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white transition-colors">
              See it in the rankings <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* A real slice of the YouTube top 5 with the sponsored slot where
            Premium placements go. Decorative, so hidden from screen readers;
            the copy on the left says the same thing. */}
        <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="space-y-2 [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]">
            {rows.slice(0, 3).map((c, i) => <Row key={c?.id || i} rank={i + 1} creator={c} />)}

            <div className="sponsor-foil relative rounded-2xl p-[1.5px] my-3 scale-[1.04] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.8)]">
              <div className="relative flex items-center gap-3 px-4 py-4 rounded-[calc(1rem-1.5px)] bg-[#17130a] overflow-hidden">
                <span className="sponsor-shine" />
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 border border-amber-400/40 text-amber-300">Ad</span>
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 flex items-center justify-center text-neutral-950 text-sm font-black">★</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-white truncate">Your channel here</span>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/80">Sponsored · Premium</span>
                </span>
                <span className="text-sm font-bold text-amber-300 tabular-nums">$149/mo</span>
              </div>
            </div>

            {rows.slice(3, 5).map((c, i) => <Row key={c?.id || i + 3} rank={i + 4} creator={c} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
