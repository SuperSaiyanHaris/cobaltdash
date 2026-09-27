// The ShinyPass track: levels 1 to 99 in a horizontal scroller, with every
// pack, card-rarity upgrade and drop on it. Scrolls to your level on load.
import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Check, Lock, Snowflake, Type, CircleDot } from 'lucide-react';
import { MAX_LEVEL, unlockAt, RINGS, TITLES } from '../../lib/shinyPass';
import { TIERS } from '../../lib/badgeCard';
import { PackSvg } from './PassArt';

// px per level: tighter on phones so more of the track is in view.
const nodeWidth = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 78 : 96);

function DropIcon({ drop }) {
  if (drop.kind === 'freeze') return <Snowflake className="w-5 h-5 text-sky-300" />;
  if (drop.kind === 'ring') {
    const r = RINGS[drop.key];
    return <span className="block w-6 h-6 rounded-full p-[3px]" style={{ background: `conic-gradient(${r.a}, ${r.b}, ${r.a})` }}><span className="block w-full h-full rounded-full bg-[#15151c]" /></span>;
  }
  return <Type className="w-5 h-5 text-white/80" />;
}

const dropLabel = (d) => d.kind === 'freeze' ? 'Streak Freeze' : d.kind === 'ring' ? RINGS[d.key]?.name : `“${TITLES[d.key]?.name}”`;

export default function PassTrack({ level = 0, pct = 0, opened = [], onPack }) {
  const scroller = useRef(null);
  const NODE = nodeWidth();

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = Math.max(0, (Math.max(level, 1) - 1) * NODE - el.clientWidth / 2 + NODE / 2);
    el.scrollLeft = target;
  }, [level]);

  const nudge = (dir) => scroller.current?.scrollBy({ left: dir * NODE * 5, behavior: 'smooth' });
  const railFill = level <= 0 ? 0 : (level - 1) * NODE + NODE / 2 + (level < MAX_LEVEL ? pct * NODE : 0);

  return (
    <div className="relative">
      <div className="hidden md:flex absolute -top-14 right-0 gap-2">
        <button onClick={() => nudge(-1)} aria-label="Earlier levels" className="w-10 h-10 rounded-xl border border-white/20 hover:border-white/60 text-white flex items-center justify-center transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <button onClick={() => nudge(1)} aria-label="Later levels" className="w-10 h-10 rounded-xl border border-white/20 hover:border-white/60 text-white flex items-center justify-center transition-colors"><ChevronRight className="w-5 h-5" /></button>
      </div>

      <div ref={scroller} className="overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent] snap-x">
        <div className="relative" style={{ width: MAX_LEVEL * NODE, height: 268 }}>
          {/* Rail */}
          <div className="absolute left-0 right-0 top-[176px] h-[4px] rounded-full bg-white/10" />
          <div
            className="absolute left-0 top-[176px] h-[4px] rounded-full"
            style={{ width: railFill, background: 'linear-gradient(90deg, #A1A1AA, #5EC8FF 25%, #C084FC 50%, #FFD76A 75%, #FFF3C4)' }}
          />

          {Array.from({ length: MAX_LEVEL }, (_, i) => {
            const lv = i + 1;
            const u = unlockAt(lv);
            const reached = lv <= level;
            const current = lv === level;
            const pack = u?.pack;
            const isOpened = pack && opened.includes(lv);
            const canOpen = pack && reached && !isOpened;
            return (
              <div key={lv} className="absolute top-0 snap-center flex flex-col items-center" style={{ left: i * NODE, width: NODE }}>
                {/* Reward above the rail */}
                <div className="h-[160px] w-full flex items-end justify-center pb-2">
                  {pack ? (
                    <button
                      type="button"
                      onClick={() => onPack?.(lv, { canOpen, isOpened, reached })}
                      className={`relative w-[68px] sm:w-[84px] transition-transform ${canOpen ? 'animate-[sp-bob_2.4s_ease-in-out_infinite]' : ''}`}
                      aria-label={canOpen ? `Open the ${pack.name} pack` : isOpened ? `See what was in the ${pack.name} pack` : `${pack.name} pack, unlocks at level ${lv}`}
                    >
                      <PackSvg pack={pack} still={!canOpen} locked={!reached} className="drop-shadow-[0_14px_18px_rgba(0,0,0,0.75)]" />
                      {isOpened && <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-[#0a0a0f]"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>}
                      {!reached && <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-neutral-800 text-white/80 flex items-center justify-center ring-2 ring-[#0a0a0f]"><Lock className="w-3 h-3" /></span>}
                      {canOpen && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white text-neutral-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 whitespace-nowrap">Open</span>}
                    </button>
                  ) : u?.tier ? (
                    <div className={`flex flex-col items-center text-center ${reached ? '' : 'opacity-50'}`}>
                      <span className="w-10 h-14 rounded-md p-[2px]" style={{ background: `linear-gradient(140deg, ${TIERS[u.tier].a}, ${TIERS[u.tier].b} 40%, ${TIERS[u.tier].c})` }}>
                        <span className="block w-full h-full rounded-[5px] bg-[#0B0B12]" />
                      </span>
                      <span className="mt-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: TIERS[u.tier].a }}>{u.tier.toLowerCase()} card</span>
                      {u.drop && <span className="mt-0.5 text-[10px] font-semibold text-white/70 leading-tight px-1">+ {dropLabel(u.drop)}</span>}
                    </div>
                  ) : u?.drop ? (
                    <div className={`flex flex-col items-center text-center px-1 ${reached ? '' : 'opacity-50'}`}>
                      <span className="w-10 h-10 rounded-xl bg-white/[0.07] border border-white/15 flex items-center justify-center"><DropIcon drop={u.drop} /></span>
                      <span className="mt-1.5 text-[10px] font-semibold text-white/80 leading-tight">{dropLabel(u.drop)}</span>
                    </div>
                  ) : lv % 5 === 0 ? null : (
                    <CircleDot className="w-3 h-3 text-white/15 mb-1" />
                  )}
                </div>

                {/* Level dot on the rail */}
                <div className="relative h-[34px] flex items-center justify-center">
                  <span
                    className={`relative z-10 flex items-center justify-center rounded-full font-black tabular-nums transition-colors ${
                      current ? 'w-9 h-9 text-sm bg-white text-neutral-950 ring-4 ring-white/20'
                        : pack ? `w-8 h-8 text-xs ${reached ? 'bg-white text-neutral-950' : 'bg-[#1c1c24] text-white/70 border border-white/20'}`
                        : `w-6 h-6 text-[10px] ${reached ? 'bg-white/90 text-neutral-950' : 'bg-[#16161d] text-white/60 border border-white/15'}`
                    }`}
                  >
                    {lv}
                  </span>
                </div>
                {current && <span className="mt-1.5 rounded-full bg-white text-neutral-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5">You</span>}
                {pack && !current && <span className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${reached ? 'text-white/85' : 'text-white/60'}`}>{pack.name}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
