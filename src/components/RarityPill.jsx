import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, ArrowUp } from 'lucide-react';
import { cardTier, rarityBands, TIERS } from '../lib/badgeCard';
import { formatNumber } from '../lib/utils';

// A creator's card rarity as a tappable pill. Tapping opens a sheet that
// explains what the rarity means, where this creator sits on the ladder for
// their platform, and how far the next tier is. Rendered through a portal so
// no parent stacking context can put it behind other content, and built from
// a span (role=button) so it can sit inside a row that is itself a link.

const ORDER = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON'];
const LABEL = { LEGENDARY: 'Legendary', EPIC: 'Epic', RARE: 'Rare', COMMON: 'Common' };
const RULE = {
  LEGENDARY: 'Top 10, or top 0.1%',
  EPIC: 'Top 1%',
  RARE: 'Top 10%',
  COMMON: 'Everyone else',
};
// Readable text colors on light backgrounds (the card colors are too pale).
const LIGHT_TEXT = { LEGENDARY: '#b45309', EPIC: '#7e22ce', RARE: '#0369a1', COMMON: '#52525b' };

function RaritySheet({ tier, rank, total, platformName, creatorName, onClose }) {
  const bands = rarityBands(total);
  const idx = ORDER.indexOf(tier.name);
  const nextUp = idx > 0 ? ORDER.slice(0, idx).reverse().find((t) => bands[t.toLowerCase()]) : null;
  const placesToNext = nextUp ? rank - bands[nextUp.toLowerCase()][1] : 0;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${LABEL[tier.name]} card rarity`}
    >
      <div className="relative w-full sm:max-w-md bg-[#101016] text-white border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Card rarity</p>
        <p className="mt-2 text-4xl font-black tracking-tight" style={{ color: tier.a }}>{LABEL[tier.name]}</p>
        <p className="mt-3 text-[15px] text-white/85 leading-relaxed">
          {creatorName ? <span className="font-bold text-white">{creatorName}</span> : 'This creator'} is{' '}
          <span className="font-bold text-white tabular-nums">#{formatNumber(rank)}</span> of{' '}
          <span className="tabular-nums">{formatNumber(total)}</span> {platformName} creators we track, ranked by size.
        </p>

        <div className="mt-6 space-y-2">
          {ORDER.filter((t) => bands[t.toLowerCase()]).map((t) => {
            const [lo, hi] = bands[t.toLowerCase()];
            const current = t === tier.name;
            return (
              <div
                key={t}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${current ? 'bg-white/[0.08] border-white/25' : 'border-white/[0.06]'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TIERS[t].a }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold" style={{ color: TIERS[t].a }}>{LABEL[t]}</span>
                  <span className="block text-xs text-white/65">{RULE[t]}</span>
                </span>
                <span className="text-xs font-semibold text-white/80 tabular-nums whitespace-nowrap">
                  #{formatNumber(lo)}{hi > lo ? `–${formatNumber(hi)}` : ''}
                </span>
                {current && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-white text-neutral-950 text-[10px] font-black uppercase tracking-[0.1em]">This card</span>
                )}
              </div>
            );
          })}
        </div>

        {nextUp && placesToNext > 0 && (
          <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-white/90">
            <ArrowUp className="w-4 h-4 flex-shrink-0" style={{ color: TIERS[nextUp].a }} />
            {formatNumber(placesToNext)} {placesToNext === 1 ? 'place' : 'places'} from{' '}
            <span style={{ color: TIERS[nextUp].a }}>{LABEL[nextUp]}</span>
          </p>
        )}

        <p className="mt-5 text-sm text-white/70 leading-relaxed">
          Rankings refresh every day, so cards level up (and down) as creators grow.{' '}
          <Link to="/methodology#rarity" onClick={onClose} className="font-semibold text-white underline underline-offset-2">How it works</Link>
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default function RarityPill({ rank, total, platformName, creatorName, variant = 'dark', size = 'md', className = '' }) {
  const [open, setOpen] = useState(false);
  if (!rank || !total) return null;
  const tier = cardTier(rank, total);

  const openSheet = (e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); };
  const color = variant === 'dark' ? tier.a : LIGHT_TEXT[tier.name];
  const base = size === 'sm'
    ? 'gap-1.5 text-[10px] tracking-[0.12em]'
    : 'gap-1.5 h-8 px-3 rounded-full border text-xs tracking-[0.14em]';
  const skin = size === 'sm' ? '' : variant === 'dark' ? 'border-white/20 bg-white/[0.06] hover:border-white/50' : 'border-neutral-300 bg-white hover:border-neutral-900';

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={openSheet}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openSheet(e); }}
        title="What does this rarity mean?"
        className={`inline-flex items-center font-black uppercase cursor-pointer transition-colors ${base} ${skin} ${className}`}
        style={{ color }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tier.a }} />
        {size === 'sm' ? LABEL[tier.name] : tier.name}
        {size !== 'sm' && <span aria-hidden="true" className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full border border-current text-[9px] leading-none">?</span>}
      </span>
      {open && (
        <RaritySheet
          tier={tier}
          rank={rank}
          total={total}
          platformName={platformName}
          creatorName={creatorName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
