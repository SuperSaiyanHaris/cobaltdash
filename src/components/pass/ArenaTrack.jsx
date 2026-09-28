// ShinyPass "Arena" track: the HUD (level, season, XP), a featured reward
// stage, the 99 levels in swipeable pages of 10, and the season's packs.
// Pages use native scroll-snap, one page per swipe, so it scrolls like any
// other list on a phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Lock, Flame, Snowflake, Zap, ExternalLink } from 'lucide-react';
import { TRACK, MAX_LEVEL, PACKS, PACK_BY_KEY, itemName, itemBlurb } from '../../lib/shinyPass';
import { RewardGlyph, RewardVisual, RARITY_COLORS } from './RewardArt';
import { PackSvg, UserCardSvg } from './PassArt';
import { BadgePill } from './BadgeChip';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const PAGES = 10;
const pageOf = (level) => Math.min(PAGES - 1, Math.floor((Math.max(1, level) - 1) / 10));
const shortName = (r) => itemName(r).replace(/^(Sticker|Title): /, '');

function statusOf(r, level, opened) {
  if (r.level > level) return r.level === level + 1 ? 'current' : 'locked';
  if (r.kind === 'pack') return opened.has(r.level) ? 'claimed' : 'ready';
  return 'claimed';
}

function Tile({ r, status, selected, onSelect }) {
  const rc = RARITY_COLORS[r.rarity];
  return (
    <button
      type="button"
      onClick={() => onSelect(r.level)}
      aria-pressed={selected}
      aria-label={`Level ${r.level}: ${itemName(r)}${status === 'ready' ? ', ready to open' : status === 'claimed' ? ', unlocked' : ''}`}
      className={`sp-tile sp-r-${r.rarity} ${status}`}
    >
      <span className="n">{r.level}</span>
      {status === 'claimed' && <span className="ok"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>}
      {status === 'locked' && <span className="ok"><Lock className="w-3 h-3" /></span>}
      <span className="g"><RewardGlyph kind={r.kind} color={rc.text} /></span>
      <span className="l">{status === 'ready' ? 'Open' : shortName(r)}</span>
    </button>
  );
}

export default function ArenaTrack({ me, state, onOpenPack, onViewPack, demo = false }) {
  const p = state.progress;
  const season = state.season || { number: 1, daysLeft: 0, lastDay: '' };
  const opened = useMemo(() => new Set(state.packs.opened), [state.packs.opened]);
  const firstReady = state.packs.available[0];
  const nextMilestone = TRACK.find((r) => r && r.level > p.level && (r.kind === 'pack' || r.kind === 'tier'))?.level;
  const [selected, setSelected] = useState(firstReady || nextMilestone || Math.min(MAX_LEVEL, p.level + 1));
  const [page, setPage] = useState(pageOf(selected));
  const scroller = useRef(null);
  const stage = useRef(null);
  const [now] = useState(() => Date.now());

  // Start on the page holding the featured reward.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = pageOf(selected) * (el.clientWidth + 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / (el.clientWidth + 12));
    if (i !== page) setPage(i);
  }
  const go = (i) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(PAGES - 1, i)) * (el.clientWidth + 12), behavior: 'smooth' });
  };

  function select(level) {
    setSelected(level);
    // On phones the stage sits above the pages: bring it into view.
    if (window.innerWidth < 860 && stage.current) {
      const top = stage.current.getBoundingClientRect().top;
      if (top < 60 || top > window.innerHeight * 0.4) stage.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const sel = TRACK[selected];
  const selStatus = statusOf(sel, p.level, opened);
  const away = sel.level - p.level;
  const boosted = p.boost_until && new Date(p.boost_until).getTime() > now;

  return (
    <div className="sp-arena flex flex-col gap-5">
      {/* HUD */}
      <div className="sp-hud">
        <div className="sp-lvl font-arena italic"><small>LEVEL</small><b>{p.level}</b></div>
        <div className="relative min-w-0 flex flex-col gap-2">
          <div className="font-arena italic font-extrabold uppercase tracking-[0.08em] text-[15px] text-white/75 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="text-white">Season {season.number}</span>
            <span className="text-white/90">{season.daysLeft} days left</span>
            {state.handle && <Link to={`/u/${state.handle}`} className="inline-flex items-center gap-1 normal-case not-italic font-sans font-semibold text-[13px] tracking-normal text-white/75 hover:text-white">@{state.handle} <ExternalLink className="w-3 h-3" /></Link>}
          </div>
          <div className="sp-bar"><i style={{ width: `${Math.max(2, (p.level >= MAX_LEVEL ? 1 : p.pct) * 100)}%` }} /><u /></div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-white/75 tabular-nums">
            <span><b className="text-white">{p.level >= MAX_LEVEL ? 'Max level' : `${fmt(p.into)} / ${fmt(p.need)}`}</b>{p.level < MAX_LEVEL && ' XP'}</span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-300" />{p.streak || 0}</span>
              <span className="inline-flex items-center gap-1"><Snowflake className="w-3.5 h-3.5 text-sky-300" />{p.streak_freezes || 0}</span>
              {boosted && <span className="inline-flex items-center gap-1 text-emerald-300"><Zap className="w-3.5 h-3.5" />+25%</span>}
              <span>+{fmt(state.today.xp)} today</span>
            </span>
          </div>
          {state.badges.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5">{state.badges.slice(0, 4).map((b) => <BadgePill key={b.badge} badge={b.badge} dark />)}</div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4">
        {/* Featured reward */}
        <div ref={stage} className={`sp-feature sp-r-${sel.rarity} scroll-mt-20`}>
          <div className="sp-art"><RewardVisual reward={sel} me={me} /></div>
          <div className="sp-copy">
            <p className="font-arena italic font-extrabold uppercase tracking-[0.1em] text-[15px]" style={{ color: 'var(--ra)' }}>
              {selStatus === 'ready' ? 'Ready to open' : `Level ${sel.level} reward`}
            </p>
            <h2 className="mt-1 font-arena italic font-black uppercase text-white text-[clamp(38px,6vw,60px)] leading-[.88] text-balance">{itemName(sel)}</h2>
            <p className="mt-2 text-[14.5px] text-white/85 max-w-[36ch] leading-snug">{itemBlurb(sel)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="sp-chip rar">{sel.rarity}</span>
            {sel.alsoTier && <span className="sp-chip">+ {sel.alsoTier.toLowerCase()} card</span>}
              <span className="sp-chip">{selStatus === 'ready' ? 'Unlocked' : selStatus === 'claimed' ? 'Unlocked' : `${away} level${away === 1 ? '' : 's'} away`}</span>
            </div>
            {sel.kind === 'pack' && selStatus === 'ready' && (
              <button onClick={() => onOpenPack(sel.level)} className={`mt-4 self-start px-6 py-3 rounded-xl text-[15px] font-bold transition-colors ${demo ? 'bg-white hover:bg-neutral-100 text-neutral-950' : 'bg-brand hover:bg-brand-hover text-white'}`}>
                Open pack
              </button>
            )}
            {sel.kind === 'pack' && selStatus === 'claimed' && (
              <button onClick={() => onViewPack(sel.level)} className="mt-4 self-start px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors">
                See what was inside
              </button>
            )}
          </div>
        </div>

        {/* Pages of 10 */}
        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-arena italic font-black uppercase text-white text-[22px] tracking-wide tabular-nums">
              Levels {page * 10 + 1}–{page === PAGES - 1 ? 99 : page * 10 + 10}
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous levels" className="w-10 h-10 rounded-xl border border-white/15 bg-white/[0.04] text-white flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => go(page + 1)} disabled={page === PAGES - 1} aria-label="Next levels" className="w-10 h-10 rounded-xl border border-white/15 bg-white/[0.04] text-white flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          <div ref={scroller} onScroll={onScroll} className="sp-pages">
            {Array.from({ length: PAGES }, (_, i) => (
              <div key={i} className="sp-page" aria-label={`Levels ${i * 10 + 1} to ${i === PAGES - 1 ? 99 : i * 10 + 10}`}>
                {TRACK.slice(i * 10 + 1, i === PAGES - 1 ? 100 : i * 10 + 11).map((r) => (
                  <Tile key={r.level} r={r} status={statusOf(r, p.level, opened)} selected={r.level === selected} onSelect={select} />
                ))}
              </div>
            ))}
          </div>
          <div className="sp-dots" role="tablist" aria-label="Pages">
            {Array.from({ length: PAGES }, (_, i) => (
              <button key={i} role="tab" aria-selected={i === page} aria-label={`Levels ${i * 10 + 1} and up`} onClick={() => go(i)}
                className={i === page ? 'on' : (i + 1) * 10 <= p.level ? 'done' : ''} />
            ))}
          </div>
          <div className="mt-1 hidden lg:flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="w-16 flex-shrink-0 rotate-[-4deg]"><UserCardSvg me={me} still /></div>
            <p className="text-[13.5px] text-white/80 leading-snug">
              Your card levels up with you: <b className="text-white">Rare at 25</b>, <b className="text-white">Epic at 50</b>, <b className="text-white">Legendary at 75</b>. Everything you unlock stays yours when the season resets.
            </p>
          </div>
        </div>
      </div>

      {/* The season's packs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-arena italic font-black uppercase text-white text-[26px] tracking-wide">Season packs</h2>
          <p className="text-[13px] text-white/70">{opened.size} of {PACKS.length} opened</p>
        </div>
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-5 lg:grid-cols-10 sm:overflow-visible">
          {PACKS.map((k) => {
            const ready = state.packs.available.includes(k.level);
            const done = opened.has(k.level);
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => (ready ? onOpenPack(k.level) : done ? onViewPack(k.level) : select(k.level))}
                className="snap-start flex-shrink-0 w-[30%] min-[480px]:w-[22%] sm:w-auto flex flex-col items-center gap-1.5"
                aria-label={`${k.name} pack, level ${k.level}${ready ? ', ready to open' : done ? ', opened' : ''}`}
              >
                <PackSvg pack={PACK_BY_KEY[k.key]} still={!ready} locked={!ready && !done} season={season.number} className="w-full" />
                <span className={`font-arena italic font-extrabold uppercase text-[13px] tracking-wide px-2 py-0.5 rounded ${ready ? 'bg-white text-neutral-950' : done ? 'border border-white/30 text-white/85' : 'text-white/70'}`}>
                  {ready ? 'Open' : done ? 'Opened' : `Lv ${k.level}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
