// ShinyPass "Arena" track: the header (who you are, level, XP, streak, a clear
// button to your public page), the next reward, the 99 levels in swipeable
// pages of 10, and the season's packs as 3D objects. Pages use native
// scroll-snap, one page per swipe. On phones a tapped level opens a bottom
// sheet, so the page never jumps; on desktop the reward card updates in place.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Lock, Flame, Snowflake, Zap, X } from 'lucide-react';
import { TRACK, MAX_LEVEL, PACKS, PACK_BY_KEY, itemName, itemBlurb } from '../../lib/shinyPass';
import { RewardGlyph, RewardVisual, RARITY_COLORS } from './RewardArt';
import { Pack3D, UserCardSvg } from './PassArt';
import { BadgePill } from './BadgeChip';
import useDesktop from './useDesktop';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const PAGES = 10;
const pageOf = (level) => Math.min(PAGES - 1, Math.floor((Math.max(1, level) - 1) / 10));
const shortName = (r) => itemName(r).replace(/^(Sticker|Title): /, '');

function statusOf(r, level, opened) {
  if (r.level > level) return r.level === level + 1 ? 'current' : 'locked';
  if (r.kind === 'pack') return opened.has(r.level) ? 'claimed' : 'ready';
  return 'claimed';
}

// Locker tab for each cosmetic kind the track hands out.
const LOCKER_TAB = { sticker: 'sticker', title: 'title', ring: 'ring', name: 'name', back: 'back', banner: 'banner' };
const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

const Tile = memo(function Tile({ r, status, selected, onSelect, pct = 0 }) {
  const rc = RARITY_COLORS[r.rarity];
  const said = { ready: ', ready to open', claimed: ', claimed', current: ', next up', locked: ', locked' }[status];
  return (
    <button
      type="button"
      onClick={() => onSelect(r.level)}
      aria-pressed={selected}
      aria-label={`Level ${r.level}: ${itemName(r)}${said}`}
      className={`sp-tile sp-r-${r.rarity} ${status}`}
    >
      <span className="n">{r.level}</span>
      {status === 'claimed' && <span className="ok"><Check className="w-3.5 h-3.5" strokeWidth={3.5} /></span>}
      {status === 'locked' && <span className="ok"><Lock className="w-3 h-3" /></span>}
      {status === 'current' && <span className="nx">Next</span>}
      <span className="g"><RewardGlyph kind={r.kind} color={rc.text} /></span>
      <span className="l"><span>{status === 'ready' ? 'Open' : shortName(r)}</span></span>
      <span className="rb" aria-hidden="true" />
      {status === 'current' && <span className="pg" aria-hidden="true"><i style={{ width: `${Math.max(4, pct * 100)}%` }} /></span>}
    </button>
  );
});

function Avatar({ me }) {
  const initial = (me?.publicHandle || me?.handle || '?').slice(0, 1).toUpperCase();
  return me?.avatar
    ? <img src={me.avatar} alt="" referrerPolicy="no-referrer" className="sp-av" />
    : <span className="sp-av" aria-hidden="true">{initial}</span>;
}

/** One reward, big: the art, what it is, and the one thing to do with it. */
function Feature({ reward, me, status, away, demo, onOpenPack, onViewPack, label }) {
  const eyebrow = status === 'ready' ? 'Ready to open' : label || `Level ${reward.level} reward`;
  return (
    <div className={`sp-feature sp-r-${reward.rarity}`}>
      <div className="sp-art"><RewardVisual reward={reward} me={me} /></div>
      <div className="sp-copy">
        <p className="font-arena italic font-extrabold uppercase tracking-[0.1em] text-[15px]" style={{ color: 'var(--ra)' }}>{eyebrow}</p>
        <h2 className="mt-1 font-arena italic font-black uppercase text-white text-[clamp(30px,6.4vw,54px)] leading-[.92] text-balance">{itemName(reward)}</h2>
        <p className="mt-2 text-[15px] text-white/85 max-w-[40ch] leading-snug">{itemBlurb(reward)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="sp-chip rar">{reward.rarity}</span>
          {reward.alsoTier && <span className="sp-chip">+ {reward.alsoTier.toLowerCase()} card</span>}
          {status === 'claimed'
            ? <span className="sp-chip got"><Check className="w-3.5 h-3.5" strokeWidth={3} />Unlocked</span>
            : status === 'ready'
              ? <span className="sp-chip ready">Ready</span>
              : <span className="sp-chip">{status === 'current' ? 'Next up' : `${away} levels away`}</span>}
        </div>
        {reward.kind === 'pack' && status === 'ready' && (
          <button onClick={() => onOpenPack(reward.level)} className={`sp-cta ${demo ? 'light' : 'brand'}`}>Open pack</button>
        )}
        {!demo && status === 'claimed' && LOCKER_TAB[reward.kind] && (
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('shinypass:locker', { detail: LOCKER_TAB[reward.kind] }));
              document.getElementById('locker')?.scrollIntoView({ behavior: smooth(), block: 'start' });
            }}
            className="sp-cta light"
          >
            Equip it in your locker
          </button>
        )}
        {reward.kind === 'pack' && status === 'claimed' && (
          <button onClick={() => onViewPack(reward.level)} className="sp-cta light">See what was inside</button>
        )}
      </div>
    </div>
  );
}

/** Phones: a tapped level opens here instead of moving the page. */
function RewardSheet({ children, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-end justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Reward">
      <div className="sp-sheet relative w-full max-w-xl max-h-[92dvh] overflow-y-auto overscroll-contain bg-[#0a0a0f] rounded-t-3xl p-3 pb-[max(14px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The season's ten 3D packs. They are the heaviest part of the page (about 200
 * SVG nodes each) and sit below the fold, so they start mounting when the strip
 * nears the screen, one every 70ms, and start over each time the Track tab is
 * shown again, so no single render blocks a tap or a scroll.
 */
function SeasonPacks({ opened, available, season, onOpenPack, onViewPack }) {
  const ref = useRef(null);
  const [count, setCount] = useState(0);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { const id = setTimeout(() => setNear(true), 300); return () => clearTimeout(id); }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '700px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return undefined;
    const id = setInterval(() => setCount((c) => (c >= PACKS.length ? c : c + 1)), 70);
    return () => clearInterval(id);
  }, [near]);
  return (
    <div ref={ref} className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-arena italic font-black uppercase text-white text-[26px] tracking-wide">Season packs</h2>
          <p className="text-[13.5px] text-white/75">{opened.size} of {PACKS.length} opened</p>
        </div>
        <div className="sp-packs" style={count < PACKS.length ? { minHeight: 250 } : undefined}>
          {PACKS.slice(0, count).map((k) => {
            const ready = available.includes(k.level);
            const done = opened.has(k.level);
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => {
                  if (ready) return onOpenPack(k.level);
                  if (done) return onViewPack(k.level);
                  // A pack you haven't reached: show what's inside it.
                  window.dispatchEvent(new CustomEvent('shinypass:guide', { detail: k.key }));
                  return document.getElementById('pack-guide')?.scrollIntoView({ behavior: smooth(), block: 'start' });
                }}
                className="sp-pack"
                aria-label={`${k.name} pack, level ${k.level}${ready ? ', ready to open' : done ? ', opened' : ''}`}
              >
                <Pack3D pack={PACK_BY_KEY[k.key]} still={!ready} ready={ready} locked={!ready && !done} season={season.number} size="md" />
                <span className={`sp-pack-tag ${ready ? 'ready' : done ? 'done' : ''}`}>
                  {ready ? 'Open' : done ? 'Opened' : `Level ${k.level}`}
                </span>
              </button>
            );
          })}
        </div>
    </div>
  );
}

// (Tile is memoized so choosing a level re-renders two tiles, not 99.)
export default function ArenaTrack({ me, state, onOpenPack, onViewPack, demo = false, bodyHidden = false, handleForm = null }) {
  const p = state.progress;
  const season = state.season || { number: 1, daysLeft: 0, lastDay: '' };
  const opened = useMemo(() => new Set(state.packs.opened), [state.packs.opened]);
  const firstReady = state.packs.available[0];
  const nextReward = firstReady ? TRACK[firstReady] : TRACK[Math.min(MAX_LEVEL, p.level + 1)];
  const desktop = useDesktop();
  // On phones the other tabs are not mounted, so a hidden body costs nothing.
  const showBody = desktop || !bodyHidden;
  const [selected, setSelected] = useState(nextReward.level);
  const [sheet, setSheet] = useState(null);
  const [page, setPage] = useState(pageOf(selected));
  const scroller = useRef(null);
  const [now] = useState(() => Date.now());

  // Start on the page holding the next reward.
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
    if (el) el.scrollTo({ left: Math.max(0, Math.min(PAGES - 1, i)) * (el.clientWidth + 12), behavior: smooth() });
  };

  const select = useCallback((level) => {
    setSelected(level);
    if (window.innerWidth < 1024) setSheet(level);
  }, []);

  const shown = desktop ? TRACK[selected] : nextReward;
  const shownStatus = statusOf(shown, p.level, opened);
  const next = p.level < MAX_LEVEL ? TRACK[p.level + 1] : null;
  const boosted = p.boost_until && new Date(p.boost_until).getTime() > now;
  const sheetReward = sheet ? TRACK[sheet] : null;
  const act = { demo, onOpenPack: (l) => { setSheet(null); onOpenPack(l); }, onViewPack: (l) => { setSheet(null); onViewPack(l); } };

  return (
    <div className="sp-arena flex flex-col gap-4 sm:gap-5">
      {/* Header */}
      <div className="sp-hud">
        <div className="sp-top">
          <div className="sp-who">
            <Avatar me={me} />
            <div className="min-w-0">
              <p className="sp-handle">{state.handle ? `@${state.handle}` : demo ? 'Your name here' : 'Your ShinyPass'}</p>
              <p className="sp-season">Season {season.number} · {season.daysLeft} days left</p>
            </div>
          </div>
          {state.handle && (
            <Link to={`/u/${state.handle}`} className="sp-profile-btn">
              My profile <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
        {handleForm}
        <div className="sp-level-row">
          <div className="sp-lvl font-arena italic"><small>LEVEL</small><b>{p.level}</b></div>
          <div className="sp-xp">
            <div className="sp-xpline">
              <span><b>{p.level >= MAX_LEVEL ? 'Max level' : fmt(p.into)}</b>{p.level < MAX_LEVEL && ` / ${fmt(p.need)} XP`}</span>
              {p.level < MAX_LEVEL && <span>Level {p.level + 1}</span>}
            </div>
            <div className="sp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((p.level >= MAX_LEVEL ? 1 : p.pct) * 100)} aria-label="XP to next level">
              <i style={{ width: `${Math.max(2, (p.level >= MAX_LEVEL ? 1 : p.pct) * 100)}%` }} />
            </div>
            {next && (
              <p className="sp-togo">
                <b className="tabular-nums">{fmt(p.need - p.into)} XP</b> to <b>{itemName(next)}</b>
              </p>
            )}
          </div>
        </div>
        <div className="sp-stats">
          <span className="sp-stat"><Flame className="w-4 h-4 text-orange-300" />{p.streak || 0} day streak</span>
          <span className="sp-stat"><Snowflake className="w-4 h-4 text-sky-300" />{p.streak_freezes || 0} freeze{(p.streak_freezes || 0) === 1 ? '' : 's'}</span>
          <span className="sp-stat">+{fmt(state.today.xp)} XP today</span>
          {boosted && <span className="sp-stat"><Zap className="w-4 h-4 text-emerald-300" />+25% boost</span>}
          {state.badges.slice(0, 2).map((b) => <BadgePill key={b.badge} badge={b.badge} dark />)}
        </div>
      </div>

      {showBody && <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4">
        <Feature
          reward={shown}
          me={me}
          status={shownStatus}
          away={shown.level - p.level}
          label={!desktop || shown.level === nextReward.level ? 'Next reward' : undefined}
          {...act}
        />

        {/* All levels */}
        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-arena italic font-black uppercase text-white text-[22px] tracking-wide tabular-nums">
              Levels {page * 10 + 1}–{page === PAGES - 1 ? 99 : page * 10 + 10}
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous levels" className="w-11 h-11 rounded-xl border border-white/15 bg-white/[0.04] text-white flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => go(page + 1)} disabled={page === PAGES - 1} aria-label="Next levels" className="w-11 h-11 rounded-xl border border-white/15 bg-white/[0.04] text-white flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          <div ref={scroller} onScroll={onScroll} className="sp-pages">
            {Array.from({ length: PAGES }, (_, i) => (
              <div key={i} className="sp-page" aria-label={`Levels ${i * 10 + 1} to ${i === PAGES - 1 ? 99 : i * 10 + 10}`}>
                {TRACK.slice(i * 10 + 1, i === PAGES - 1 ? 100 : i * 10 + 11).map((r) => (
                  <Tile key={r.level} r={r} status={statusOf(r, p.level, opened)} selected={desktop && r.level === selected} onSelect={select} pct={p.pct} />
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
            <div className="w-16 flex-shrink-0"><UserCardSvg me={me} still /></div>
            <p className="text-[13.5px] text-white/80 leading-snug">
              Your card levels up with you: <b className="text-white">Rare at 25</b>, <b className="text-white">Epic at 50</b>, <b className="text-white">Legendary at 75</b>. Everything you unlock stays yours when the season resets.
            </p>
          </div>
        </div>
      </div>}

      {/* The season's packs */}
      {showBody && <SeasonPacks opened={opened} available={state.packs.available} season={season} onOpenPack={onOpenPack} onViewPack={onViewPack} />}

      {sheetReward && !desktop && (
        <RewardSheet onClose={() => setSheet(null)}>
          <Feature reward={sheetReward} me={me} status={statusOf(sheetReward, p.level, opened)} away={sheetReward.level - p.level} {...act} />
        </RewardSheet>
      )}
    </div>
  );
}
