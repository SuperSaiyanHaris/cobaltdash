import { Link } from 'react-router-dom';
import { cardImageUrl } from '../../lib/cardUrl';
import { formatNumber } from '../../lib/utils';

// "Cards" view of a rankings page: every ranked creator's live holographic
// card in rank order, with the featured-listing slots in the same positions
// as the table. An unsold slot is a gold "Your card here" card linking to
// /promote; a sold one is the buyer's own card under a Featured label.

function AdCard({ premium, price }) {
  return (
    <Link to="/promote" className="group block">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 border border-amber-400/40 text-amber-300">Ad</span>
        <span className="text-[11px] font-semibold text-amber-300/80">{premium ? 'Premium' : 'Featured'}</span>
      </div>
      <div className={`rounded-[6.4%/4.571%] p-[3px] aspect-[250/350] ${premium ? 'sponsor-foil shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)]' : 'bg-gradient-to-br from-amber-300/70 via-amber-500/50 to-amber-700/60'}`}>
        <div className="relative h-full rounded-[5.2%/3.7%] bg-[#15110a] flex flex-col items-center justify-center text-center px-4 overflow-hidden">
          <span aria-hidden="true" className="sponsor-shine" />
          <div className={`relative ${premium ? 'w-16 h-16 sm:w-20 sm:h-20 text-3xl' : 'w-14 h-14 text-2xl'} rounded-full bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 flex items-center justify-center font-black text-neutral-900`}>★</div>
          <p className="relative mt-4 text-base sm:text-lg font-extrabold text-white">Your card here</p>
          <p className="relative mt-1 text-[11px] sm:text-xs text-white/55 leading-snug">
            {premium ? 'A featured slot near the top of this ranking.' : 'A featured slot in this ranking.'}
          </p>
          <p className="relative mt-3 text-xl sm:text-2xl font-black text-amber-300 tabular-nums">{price.replace('/mo', '')}<span className="text-xs sm:text-sm text-white/40">/mo</span></p>
          <span className="relative mt-3 px-3.5 py-1.5 rounded-lg bg-amber-400 group-hover:bg-amber-300 text-neutral-900 text-xs sm:text-sm font-bold transition-colors">Claim this spot</span>
        </div>
      </div>
    </Link>
  );
}

export default function RankingsCardGrid({ items, growthUnit }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-x-4 sm:gap-x-6 gap-y-7 sm:gap-y-9">
      {items.map((c, i) => {
        if (c.isSponsored && c.isGhost) {
          return <AdCard key={`ad-${c.listingId}`} premium={c.isPremium} price={c.slotPrice} />;
        }
        const sponsored = c.isSponsored;
        return (
          <Link
            key={sponsored ? `sponsored-${c.listingId}` : c.id}
            id={sponsored ? `listing-${c.listingId}` : undefined}
            to={`/${c.platform}/${c.username}`}
            className="group block"
          >
            <div className="flex items-center justify-between gap-2 mb-2 px-1 min-h-[20px]">
              {sponsored ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 border border-amber-400/40 text-amber-300">Ad · Featured</span>
              ) : (
                <span className={`text-sm font-black tabular-nums ${c.originalRank <= 3 ? 'text-amber-300' : 'text-white/55'}`}>#{c.originalRank}</span>
              )}
              {!sponsored && typeof c.growth30d === 'number' && c.growth30d !== 0 && (
                <span className={`text-[11px] font-semibold tabular-nums truncate ${c.growth30d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {c.growth30d > 0 ? '+' : ''}{formatNumber(c.growth30d)}<span className="hidden sm:inline"> {growthUnit}</span>
                </span>
              )}
            </div>
            <img
              src={cardImageUrl(c.platform, c.username)}
              alt={`${c.display_name} creator card`}
              width="250"
              height="350"
              loading={i < 10 ? 'eager' : 'lazy'}
              draggable="false"
              className={`w-full h-auto select-none rounded-[6.4%/4.571%] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:-translate-y-1 ${sponsored ? 'ring-2 ring-amber-400/70 ring-offset-4 ring-offset-[#0a0a0f]' : ''}`}
            />
          </Link>
        );
      })}
    </div>
  );
}
