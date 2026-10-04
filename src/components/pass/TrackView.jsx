// ShinyPass Track tab: who you are (card, level, XP, streak), the ten chapters,
// the road of rewards for the chapter you're in, the selected reward up close,
// and a live "try it on" of how it looks on your profile. Phones get the same
// thing as one vertical road with a bottom sheet per reward.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Flame, Lock, X } from 'lucide-react';
import { TRACK, MAX_LEVEL, PACKS, TITLES, STICKERS, itemName, itemBlurb, streakBonus } from '../../lib/shinyPass';
import RewardLight, { RARITY_HEX, RARITY_LABEL, KIND_LABEL, ringBg, nameBg, bannerBg } from './RewardLight';
import PackArt, { PACK_META } from './PackArt';
import { UserCardSvg } from './PassArt';
import { CardBackArt } from './RewardArt';
import useDesktop from './useDesktop';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const chapterOf = (level) => Math.min(9, Math.floor((Math.max(1, level) - 1) / 10));
const chapterRange = (i) => ({ start: i * 10 + 1, end: i === 9 ? 99 : i * 10 + 10 });
const shortName = (r) => itemName(r).replace(/^(Sticker|Title): /, '');
const BAR_H = { common: 7, uncommon: 10, rare: 13, epic: 16, legendary: 18 };
const LOCKER_TAB = { sticker: 'sticker', title: 'title', ring: 'ring', name: 'name', back: 'back', banner: 'banner' };

function statusOf(r, level, opened) {
  if (r.level > level) return r.level === level + 1 ? 'next' : 'locked';
  if (r.kind === 'pack') return opened.has(r.level) ? 'claimed' : 'ready';
  return 'claimed';
}

const LockGlyph = () => <Lock className="w-3 h-3 text-[#B4B0B9]" strokeWidth={3} aria-hidden="true" />;

function Status({ status, small = false }) {
  if (status === 'claimed') return <span className="spx-check" style={small ? { width: 20, height: 20 } : undefined}><Check className={small ? 'w-3 h-3' : 'w-2.5 h-2.5'} strokeWidth={4} /></span>;
  if (status === 'next') return <span className="spx-badge">NEXT</span>;
  if (status === 'ready') return <span className="spx-badge">OPEN</span>;
  return <LockGlyph />;
}

// ── Header card ──────────────────────────────────────────────────────────
function Hero({ me, state, desktop, handleForm }) {
  const p = state.progress;
  const next = p.level < MAX_LEVEL ? TRACK[p.level + 1] : null;
  const [now] = useState(() => Date.now());
  const boosted = p.boost_until && new Date(p.boost_until).getTime() > now;
  const pct = Math.max(2, (p.level >= MAX_LEVEL ? 1 : p.pct) * 100);
  const bar = (
    <div className="spx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="XP to next level"><i style={{ width: `${pct}%` }} /></div>
  );
  const nextChip = next && (
    <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-[#F7F5F1] font-extrabold text-[var(--ink)] min-w-0 max-w-full">
      <span className="w-5 h-5 rounded-full grid place-items-center bg-white flex-none" style={{ boxShadow: `inset 0 0 0 2px ${RARITY_HEX[next.rarity]}` }}><span className="w-2 h-2 rounded-full" style={{ background: RARITY_HEX[next.rarity] }} /></span>
      <span className="truncate">{shortName(next)}</span>
    </span>
  );
  const tiles = [
    { v: `${p.streak || 0} ${(p.streak || 0) === 1 ? 'day' : 'days'}`, s: p.streak > 1 ? `Streak · +${streakBonus(p.streak)} XP/day` : 'Daily streak', bg: '#FFF4EC', c: '#C2410C' },
    { v: `${p.streak_freezes || 0} freeze${(p.streak_freezes || 0) === 1 ? '' : 's'}`, s: 'Saves a missed day', bg: '#EEF8FF', c: '#0369A1' },
    { v: `+${fmt(state.today.xp)} XP`, s: boosted ? 'Earned today · +25% boost' : 'Earned today', bg: '#F7F5F1', c: '#8a8790' },
    { v: `${Math.min(MAX_LEVEL, p.level)} / ${MAX_LEVEL}`, s: 'Rewards unlocked', bg: '#F3EFFF', c: '#6D4AFF' },
  ];

  if (!desktop) {
    return (
      <div className="flex flex-col gap-3">
        <div className="spx-card !rounded-[22px] p-4 flex items-center gap-3.5">
          <div className="font-arena italic font-black text-[64px] leading-[.82] text-[var(--ink)] tabular-nums">{p.level}</div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-[var(--ink)] tabular-nums">
              <span>{p.level >= MAX_LEVEL ? 'Max level' : `${fmt(p.into)} / ${fmt(p.need)} XP`}</span>
              <span className="inline-flex items-center gap-1 text-[#C2410C]"><Flame className="w-3.5 h-3.5" />{p.streak || 0}</span>
            </div>
            <div className="spx-bar !h-2.5">{<i style={{ width: `${pct}%` }} />}</div>
            {next && <div className="text-xs font-semibold text-[var(--mute)] truncate"><b className="text-[var(--ink)] tabular-nums">{fmt(p.need - p.into)} XP</b> to {shortName(next)}</div>}
          </div>
        </div>
        {handleForm}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="spx-card p-7 px-8 grid items-center gap-9" style={{ gridTemplateColumns: '150px minmax(0,1fr) minmax(300px,420px)' }}>
        <div className="w-[146px] -rotate-3 shadow-[0_10px_24px_rgba(20,18,30,.18)] rounded-[6.4%/4.571%]"><UserCardSvg me={me} still /></div>
        <div className="flex items-center gap-7 min-w-0">
          <div className="flex flex-col items-start">
            <div className="text-[11px] font-extrabold tracking-[.16em] text-[var(--soft)]">LEVEL</div>
            <div className="font-arena italic font-black text-[112px] leading-[.82] text-[var(--ink)] tabular-nums">{p.level}</div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <div className="flex justify-between text-[13px] font-bold text-[var(--ink)] tabular-nums">
              <span>{p.level >= MAX_LEVEL ? 'Max level' : <><b className="font-extrabold">{fmt(p.into)}</b> / {fmt(p.need)} XP</>}</span>
              {p.level < MAX_LEVEL && <span className="text-[var(--soft)]">Level {p.level + 1}</span>}
            </div>
            {bar}
            {next && <div className="flex items-center gap-2.5 text-[13px] font-semibold text-[var(--mute)] min-w-0"><span className="flex-none"><b className="text-[var(--ink)] tabular-nums">{fmt(p.need - p.into)} XP</b> to</span>{nextChip}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <div key={t.s} className="px-4 py-3.5 rounded-2xl" style={{ background: t.bg }}>
              <div className="font-bric font-extrabold text-[22px] text-[var(--ink)] tabular-nums leading-tight">{t.v}</div>
              <div className="text-[11px] font-bold mt-0.5" style={{ color: t.c }}>{t.s}</div>
            </div>
          ))}
        </div>
      </div>
      {handleForm}
    </div>
  );
}

// ── Chapters ─────────────────────────────────────────────────────────────
function Chapters({ level, chapter, onPick, desktop }) {
  const chips = PACKS.map((pk, i) => {
    const { start, end } = chapterRange(i);
    const done = end <= level;
    const cur = start <= level + 1 && end > level;
    return { pk, i, start, end, done, cur, label: done ? '✓ Done' : cur ? `${Math.max(0, level - start + 1)}/10` : 'Locked' };
  });
  if (desktop) {
    return (
      <div className="spx-chips">
        {chips.map((c) => {
          const on = c.i === chapter;
          return (
            <button key={c.pk.key} type="button" aria-pressed={on} onClick={() => onPick(c.i)} className={`spx-chip ${c.done || c.cur ? '' : 'dim'}`}>
              <span className="flex justify-between items-center"><span className="text-[10px] font-extrabold tracking-[.12em]" style={{ color: on ? 'rgba(255,255,255,.6)' : 'var(--soft)' }}>CH {c.i + 1}</span><span className="st" style={{ color: on ? '#C4B5FD' : c.done ? 'var(--ink)' : c.cur ? '#6D4AFF' : '#AAA6B0' }}>{c.label}</span></span>
              <span className="flex gap-0.5 items-end h-[18px]">
                {TRACK.slice(c.start, c.end + 1).map((r) => (
                  <i key={r.level} className="flex-1 rounded-[2px]" style={{ height: BAR_H[r.rarity], background: on ? (r.level <= level ? '#fff' : 'rgba(255,255,255,.35)') : RARITY_HEX[r.rarity], opacity: on ? 1 : r.level <= level ? 1 : 0.3 }} />
                ))}
              </span>
              <span><span className="nm block">{c.pk.name}</span><span className="sub block">Lv {c.start}-{c.end}</span></span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="spx-hs -mx-4 px-4 pb-1" role="tablist" aria-label="Chapters">
      {chips.map((c) => {
        const on = c.i === chapter;
        return (
          <button
            key={c.pk.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(c.i)}
            className={`flex-none w-[66px] px-1.5 py-2 rounded-[14px] flex flex-col items-center gap-1.5 ${on ? 'bg-[var(--ink)] text-white shadow-[0_8px_20px_rgba(20,18,30,.18)]' : 'bg-white shadow-[0_0_0_1px_var(--line)]'}`}
          >
            <span className="w-[30px]" style={{ opacity: c.done || c.cur ? 1 : 0.5 }}><PackArt packKey={c.pk.key} shadow={false} /></span>
            <span className="text-[10px] font-extrabold">Ch {c.i + 1}</span>
            <span className="text-[9px] font-extrabold" style={{ color: on ? '#C4B5FD' : c.done ? 'var(--ink)' : c.cur ? '#6D4AFF' : '#AAA6B0' }}>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Road ─────────────────────────────────────────────────────────────────
const railFill = (l, level) => (l <= level ? '#16151A' : l === level + 1 ? 'linear-gradient(90deg,#16151A 50%,#E6E1D8 50%)' : '#E6E1D8');

const RoadCard = memo(function RoadCard({ r, status, selected, onPick }) {
  const isPack = r.kind === 'pack';
  const accent = isPack ? PACK_META[r.key]?.accent : null;
  return (
    <button
      type="button"
      onClick={() => onPick(r.level)}
      aria-pressed={selected}
      aria-label={`Level ${r.level}: ${itemName(r)}, ${status === 'claimed' ? 'unlocked' : status === 'ready' ? 'ready to open' : status === 'next' ? 'next up' : 'locked'}`}
      className={`spx-reward spx-r-${r.rarity} ${status}`}
      style={isPack ? { background: `linear-gradient(180deg, ${accent}26, #fff 70%)` } : undefined}
    >
      <span className="flex w-full justify-between items-center px-1 min-h-[16px] gap-1"><span className="spx-kind">{KIND_LABEL[r.kind]}</span><Status status={status} /></span>
      <span className="art flex items-center justify-center" style={{ minHeight: isPack ? 154 : 84 }}>
        {isPack ? <span className="block w-[96px] pt-0.5 pb-1"><PackArt packKey={r.key} tilt /></span> : <RewardLight reward={r} />}
      </span>
      <span className="font-extrabold text-[12.5px] leading-tight text-[var(--ink)] min-h-[30px] flex items-center text-balance px-1">{shortName(r)}</span>
      <span className="spx-rlabel"><i />{RARITY_LABEL[r.rarity]}</span>
      <span className="mt-auto h-1 w-full" style={{ background: RARITY_HEX[r.rarity] }} />
    </button>
  );
});

function RoadDesktop({ chapter, level, opened, selected, onPick }) {
  const { start, end } = chapterRange(chapter);
  const rows = TRACK.slice(start, end + 1);
  const box = useRef(null);
  // Below ~1280px the road scrolls sideways; keep the chosen reward in view.
  useEffect(() => {
    const el = box.current;
    const card = el?.querySelector('[aria-pressed="true"]');
    if (!el || !card || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, card.offsetLeft - (el.clientWidth - card.clientWidth) / 2), behavior: 'auto' });
  }, [selected, chapter]);
  return (
    <div ref={box} className="overflow-x-auto -mx-2 px-2 pb-1">
    <div className="spx-road" style={{ gridTemplateColumns: `repeat(${rows.length - 1}, minmax(0,1fr)) 150px` }}>
      {rows.map((r) => {
        const done = r.level <= level;
        const isNext = r.level === level + 1;
        return (
          <div key={`d${r.level}`} className="spx-cell">
            <div className="rail" style={{ background: railFill(r.level, level) }} />
            <div
              className={`dot ${isNext ? 'spx-dotnext' : ''}`}
              style={{ background: isNext ? '#6D4AFF' : done ? '#16151A' : '#fff', color: isNext || done ? '#fff' : '#8a8790', boxShadow: isNext || done ? 'none' : 'inset 0 0 0 2px #E6E1D8' }}
            >{r.level}</div>
          </div>
        );
      })}
      {rows.map((r) => (
        <RoadCard key={`c${r.level}`} r={r} status={statusOf(r, level, opened)} selected={r.level === selected} onPick={onPick} />
      ))}
    </div>
    </div>
  );
}

function RoadMobile({ chapter, level, opened, onPick }) {
  const { start, end } = chapterRange(chapter);
  const rows = TRACK.slice(start, end + 1);
  return (
    <div>
      {rows.map((r, idx) => {
        const status = statusOf(r, level, opened);
        const done = r.level <= level;
        const isNext = r.level === level + 1;
        const last = idx === rows.length - 1;
        const vline = last ? 'transparent' : r.level + 1 <= level ? '#16151A' : r.level === level ? 'linear-gradient(#16151A 40%,#E6E1D8 40%)' : '#E6E1D8';
        return (
          <div key={r.level} className={`spx-vrow spx-r-${r.rarity} ${status}`} onClick={() => onPick(r.level)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.level); } }} aria-label={`Level ${r.level}: ${itemName(r)}`}>
            <div className="spx-vrail">
              <div className="line" style={{ background: vline }} />
              <div className={`dot ${isNext ? 'spx-dotnext' : ''}`} style={{ background: isNext ? '#6D4AFF' : done ? '#16151A' : '#fff', color: isNext || done ? '#fff' : '#8a8790', boxShadow: isNext || done ? 'none' : 'inset 0 0 0 2px #E6E1D8' }}>{r.level}</div>
            </div>
            <div className="spx-vcard">
              <div className="art flex-none">
                {r.kind === 'pack' ? <div className="w-[66px] pl-2 pr-1.5 py-1"><PackArt packKey={r.key} shadow={false} /></div> : <RewardLight reward={r} scale={0.78} />}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                <div className="spx-kind">{KIND_LABEL[r.kind]}</div>
                <div className="font-extrabold text-sm leading-tight text-[var(--ink)]">{shortName(r)}</div>
                <div className="spx-rlabel !pb-0"><i />{RARITY_LABEL[r.rarity]}</div>
              </div>
              <Status status={status} small />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Selected reward + try-on ─────────────────────────────────────────────
function tryOnFor(reward, eq) {
  const o = { ...eq };
  const hl = {};
  if (['ring', 'name', 'title', 'sticker', 'banner', 'back'].includes(reward.kind)) { o[reward.kind] = reward.key; hl[reward.kind] = true; }
  if (reward.kind === 'tier') hl.tier = true;
  return { o, hl, visual: Object.keys(hl).length > 0 };
}
const dash = (on) => (on ? '2px dashed #6D4AFF' : 'none');

function TryOn({ me, reward, eq }) {
  const { o, hl, visual } = tryOnFor(reward, eq);
  const handle = me.publicHandle || (me.handle !== 'you' ? me.handle : 'yourname');
  const tierLevel = reward.kind === 'tier' ? reward.level : me.level;
  const note = visual
    ? 'Dashed outline shows where it appears. Everything else is what you have equipped now.'
    : reward.kind === 'pack' ? 'Packs hold set pieces and extras. See everything inside on the Packs tab.' : 'This one works in the background. It does not change how you look.';
  return (
    <div className="spx-card p-6 flex flex-col gap-4 min-w-0">
      <div className="flex justify-between items-center gap-3">
        <h3 className="font-bric font-extrabold text-xl text-[var(--ink)]">Try it on</h3>
        <span className="px-3 py-1.5 rounded-full bg-[#F3EFFF] text-[#5636D6] text-xs font-extrabold truncate max-w-[60%]">{visual ? `Previewing: ${shortName(reward)}` : 'Your current look'}</span>
      </div>
      <div className="grid gap-5 min-[1200px]:grid-cols-[minmax(0,1fr)_250px]">
        <div className="rounded-[20px] border border-[var(--line)] overflow-hidden min-w-0">
          <div className="h-24 relative" style={{ background: o.banner ? bannerBg(o.banner) : 'var(--trough)', outline: dash(hl.banner), outlineOffset: -4 }}>
            <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(115deg,rgba(255,255,255,.22) 0 2px,rgba(255,255,255,0) 2px 12px)' }} />
          </div>
          <div className="px-5 pb-[18px] -mt-[34px] relative">
            <div className="w-[72px] h-[72px] rounded-full p-[5px] box-border" style={{ background: o.ring ? ringBg(o.ring) : '#E6E1D8', outline: dash(hl.ring), outlineOffset: 3, boxShadow: '0 0 0 4px #fff' }}>
              {me.avatar
                ? <img src={me.avatar} alt="" referrerPolicy="no-referrer" className="w-full h-full rounded-full object-cover border-[2.5px] border-white box-border" />
                : <div className="w-full h-full rounded-full border-[2.5px] border-white box-border bg-[#6D4AFF] text-white grid place-items-center font-extrabold text-lg">{handle.slice(0, 1).toUpperCase()}</div>}
            </div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="px-2.5 py-[5px] rounded-[9px] bg-[var(--ink)]" style={{ outline: dash(hl.name), outlineOffset: 2 }}>
                <span className="font-arena italic font-black text-xl leading-none" style={{ backgroundImage: o.name ? nameBg(o.name) : 'linear-gradient(90deg,#fff,#fff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>@{handle}</span>
              </span>
              {o.sticker && <StickerBit k={o.sticker} outline={dash(hl.sticker)} />}
            </div>
            {o.title && <div className="mt-2 inline-block text-[10.5px] font-extrabold tracking-[.12em] uppercase text-[var(--mute)] rounded-[3px]" style={{ outline: dash(hl.title), outlineOffset: 3 }}>{TITLE_NAME[o.title]}</div>}
            <div className="mt-4 p-3.5 rounded-[14px] bg-[var(--cream)] flex gap-3">
              <div className="w-[34px] h-[34px] flex-none rounded-full p-[3px] box-border" style={{ background: o.ring ? ringBg(o.ring) : '#E6E1D8' }}><div className="w-full h-full rounded-full border-[1.5px] border-white box-border bg-[#6D4AFF]" /></div>
              <div className="min-w-0 flex flex-col gap-[5px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-[7px] py-0.5 rounded-md bg-[var(--ink)]"><span className="font-arena italic font-black text-sm leading-none" style={{ backgroundImage: o.name ? nameBg(o.name) : 'linear-gradient(90deg,#fff,#fff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>@{handle}</span></span>
                  {o.sticker && <StickerBit k={o.sticker} small />}
                  <span className="text-[11px] font-semibold text-[var(--soft)]">· on MrBeast · 2h</span>
                </div>
                <div className="text-[13px] leading-snug text-[var(--ink)]">600M before New Year. Calling it now.</div>
                <div className="text-[11px] font-bold text-[var(--soft)]">▲ 24 · Reply</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          <div className="text-[11px] font-extrabold tracking-[.12em] text-[var(--soft)]">YOUR CARD · FRONT / BACK</div>
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 rounded-[6.4%/4.571%]" style={{ outline: dash(hl.tier), outlineOffset: 3 }}>
              <UserCardSvg me={{ ...me, level: tierLevel, into: reward.kind === 'tier' ? 0 : me.into, need: reward.kind === 'tier' ? 1 : me.need }} equippedOverride={o} still />
            </div>
            <div className="flex-1 min-w-0 self-start rounded-[10px]" style={{ outline: dash(hl.back), outlineOffset: 3 }}>
              <CardBackArt k={o.back || 'carbon'} className="w-full" />
            </div>
          </div>
          <p className="text-xs font-semibold leading-relaxed text-[var(--mute)] text-pretty">{note}</p>
        </div>
      </div>
    </div>
  );
}

const TITLE_NAME = Object.fromEntries(Object.entries(TITLES).map(([k, v]) => [k, v.name]));
function StickerBit({ k, outline, small = false }) {
  const s = STICKERS[k];
  if (!s) return null;
  return small
    ? <span className="px-1.5 py-0.5 rounded-[5px] font-arena italic font-black text-[11px] leading-[1.1] uppercase" style={{ background: s.a, color: s.t }}>{s.name}</span>
    : <span className="px-[9px] py-1 rounded-lg border-2 border-white font-arena italic font-black text-[13px] leading-none uppercase -rotate-[4deg] shadow-[0_2px_6px_rgba(20,18,30,.18)]" style={{ background: s.a, color: s.t, outline, outlineOffset: 2 }}>{s.name}</span>;
}

function Stage({ reward, scale, className = '' }) {
  const rc = RARITY_HEX[reward.rarity];
  return (
    <div className={`spx-stage ${className}`} style={{ background: `radial-gradient(circle at 50% 50%, ${rc}30, #F7F5F1 72%)` }}>
      {reward.kind === 'pack'
        ? <div style={{ width: scale > 2 ? 128 : 96 }}><PackArt packKey={reward.key} tilt idle /></div>
        : <RewardLight reward={reward} scale={scale} />}
      <span className="absolute left-3.5 top-3.5 px-2.5 py-[5px] rounded-full bg-white text-[11px] font-extrabold text-[var(--ink)]">Level {reward.level}</span>
    </div>
  );
}

function DetailText({ reward, status, p, away, demo, onOpenPack, onViewPack, onEquip, sheet = false }) {
  const toGo = Math.max(0, (p.need || 0) - (p.into || 0));
  const kindLabel = KIND_LABEL[reward.kind];
  const inventory = reward.kind === 'freeze' || reward.kind === 'boost';
  const cta = (() => {
    if (status === 'ready') return <button type="button" onClick={() => onOpenPack(reward.level)} className={`spx-btn ${sheet ? 'lg w-full' : ''}`}><span className="spx-pulse" />Tear it open</button>;
    if (status === 'claimed' && reward.kind === 'pack') return <button type="button" onClick={() => onViewPack(reward.level)} className={`spx-btn ${sheet ? 'lg w-full' : ''}`}>See what was inside</button>;
    if (status === 'claimed' && LOCKER_TAB[reward.kind] && !demo) return <button type="button" onClick={() => onEquip(LOCKER_TAB[reward.kind])} className={`spx-btn ${sheet ? 'lg w-full' : ''}`}>Equip in locker</button>;
    return null;
  })();
  return (
    <div className="flex flex-col gap-2.5 px-1.5 pb-1.5">
      <div className="flex items-center gap-2">
        <span className="px-[9px] py-[3px] rounded-full text-white text-[10px] font-extrabold tracking-[.08em] uppercase" style={{ background: RARITY_HEX[reward.rarity] }}>{RARITY_LABEL[reward.rarity]}</span>
        <span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-[var(--soft)]">{kindLabel}</span>
      </div>
      <div className={`font-arena italic font-black uppercase leading-[.95] text-[var(--ink)] ${sheet ? 'text-[32px]' : 'text-[42px]'}`}>{shortName(reward)}</div>
      <p className="text-sm leading-relaxed text-[var(--mute)] font-medium">{itemBlurb(reward)}{reward.alsoTier ? ` Also upgrades your card to ${reward.alsoTier.toLowerCase()}.` : ''}</p>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {cta}
        {status === 'claimed' && (
          <span className="inline-flex items-center gap-1.5 px-3.5 text-[13px] font-extrabold text-[var(--ink)] min-h-[44px]">
            <span className="spx-check" style={{ width: 16, height: 16 }}><Check className="w-2.5 h-2.5" strokeWidth={4} /></span>
            {inventory ? 'In your inventory' : 'Unlocked'}
          </span>
        )}
      </div>
      {status === 'next' && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex justify-between text-[13px] font-extrabold text-[var(--ink)] tabular-nums"><span>Next up · {fmt(toGo)} XP to go</span><span className="text-[var(--soft)]">{fmt(p.into)} / {fmt(p.need)}</span></div>
          <div className="h-2 rounded bg-[var(--trough)] overflow-hidden"><div className="h-full rounded bg-[var(--accent)]" style={{ width: `${Math.max(2, (p.pct || 0) * 100)}%` }} /></div>
        </div>
      )}
      {status === 'locked' && <div className="mt-1 px-3.5 py-3 rounded-xl bg-[var(--cream)] text-[13px] font-bold text-[var(--ink)]">{away} levels away</div>}
    </div>
  );
}

function Sheet({ onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-[rgba(20,18,30,.45)] flex items-end justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Reward">
      <div className="spx spx-sheet-in relative w-full max-w-xl max-h-[92dvh] overflow-y-auto overscroll-contain !bg-white rounded-t-[30px] px-[18px] pt-2.5 pb-[max(26px,env(safe-area-inset-bottom))] flex flex-col gap-3.5 shadow-[0_-10px_40px_rgba(20,18,30,.2)]" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-[5px] rounded-[3px] bg-[#DDD8CF] self-center flex-none" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

function MiniTry({ me, reward, eq }) {
  const { o, hl } = tryOnFor(reward, eq);
  const handle = me.publicHandle || (me.handle !== 'you' ? me.handle : 'yourname');
  return (
    <div className="p-3 rounded-2xl bg-[var(--cream)] flex gap-2.5 items-center">
      <div className="w-10 h-10 flex-none rounded-full p-1 box-border" style={{ background: o.ring ? ringBg(o.ring) : '#E6E1D8', outline: dash(hl.ring), outlineOffset: 2 }}><div className="w-full h-full rounded-full border-[1.5px] border-white box-border bg-[#6D4AFF]" /></div>
      <div className="min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="px-[7px] py-0.5 rounded-md bg-[var(--ink)]" style={{ outline: dash(hl.name), outlineOffset: 2 }}><span className="font-arena italic font-black text-[15px] leading-none" style={{ backgroundImage: o.name ? nameBg(o.name) : 'linear-gradient(90deg,#fff,#fff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>@{handle}</span></span>
          {o.sticker && <StickerBit k={o.sticker} small />}
        </div>
        {o.title && <div className="text-[9.5px] font-extrabold tracking-[.1em] uppercase text-[var(--soft)] self-start" style={{ outline: dash(hl.title), outlineOffset: 2 }}>{TITLE_NAME[o.title]}</div>}
      </div>
    </div>
  );
}

// ── The tab ──────────────────────────────────────────────────────────────
export default function TrackView({ me, state, demo = false, onOpenPack, onViewPack, onEquip, handleForm = null }) {
  const p = state.progress;
  const desktop = useDesktop();
  const opened = useMemo(() => new Set(state.packs.opened), [state.packs.opened]);
  const firstReady = state.packs.available[0];
  const nextReward = firstReady ? TRACK[firstReady] : TRACK[Math.min(MAX_LEVEL, p.level + 1)];
  const [chapter, setChapter] = useState(chapterOf(nextReward.level));
  const [selected, setSelected] = useState(nextReward.level);
  const [sheet, setSheet] = useState(null);
  const eq = p.equipped || {};

  const pickChapter = useCallback((i) => {
    setChapter(i);
    const { start, end } = chapterRange(i);
    const rows = TRACK.slice(start, end + 1);
    const pick = rows.find((r) => statusOf(r, p.level, opened) !== 'claimed') || rows[rows.length - 1];
    setSelected(pick.level);
  }, [p.level, opened]);

  const pickReward = useCallback((level) => {
    setSelected(level);
    if (window.innerWidth < 1024) setSheet(level);
  }, []);

  const reward = TRACK[selected];
  const status = statusOf(reward, p.level, opened);
  const act = { p, demo, onOpenPack: (l) => { setSheet(null); onOpenPack(l); }, onViewPack: (l) => { setSheet(null); onViewPack(l); }, onEquip: (t) => { setSheet(null); onEquip(t); } };
  const { start, end } = chapterRange(chapter);
  const name = PACKS[chapter].name;
  const sheetReward = sheet ? TRACK[sheet] : null;

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4">
      <Hero me={me} state={state} desktop={desktop} handleForm={handleForm} />
      <Chapters level={p.level} chapter={chapter} onPick={pickChapter} desktop={desktop} />

      {desktop ? (
        <>
          <div className="spx-card p-7 pt-[26px]">
            <div className="flex justify-between items-end mb-[18px]">
              <div>
                <div className="text-[11px] font-extrabold tracking-[.14em] text-[var(--accent)]">CHAPTER {chapter + 1} · LEVELS {start}-{end}</div>
                <h2 className="font-bric font-extrabold text-[28px] text-[var(--ink)] mt-1.5 leading-tight">The road to {name}</h2>
              </div>
              <div className="flex gap-3.5 text-[11px] font-bold text-[var(--mute)]">
                {Object.keys(RARITY_HEX).map((k) => <span key={k} className="flex items-center gap-[5px]"><i className="w-2 h-2 rounded-full" style={{ background: RARITY_HEX[k] }} />{RARITY_LABEL[k]}</span>)}
              </div>
            </div>
            <RoadDesktop chapter={chapter} level={p.level} opened={opened} selected={selected} onPick={pickReward} />
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(340px,460px) minmax(0,1fr)' }}>
            <div className="spx-card p-5 flex flex-col gap-4">
              <Stage reward={reward} scale={2.5} className="h-[270px]" />
              <DetailText reward={reward} status={status} away={reward.level - p.level} {...act} />
            </div>
            <TryOn me={me} reward={reward} eq={eq} />
          </div>
        </>
      ) : (
        <>
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[.14em] text-[var(--accent)]">CHAPTER {chapter + 1} · LV {start}-{end}</div>
            <h2 className="font-bric font-extrabold text-[22px] text-[var(--ink)] mt-1 leading-tight">The road to {name}</h2>
          </div>
          <RoadMobile chapter={chapter} level={p.level} opened={opened} onPick={pickReward} />
        </>
      )}

      {sheetReward && !desktop && (
        <Sheet onClose={() => setSheet(null)}>
          <Stage reward={sheetReward} scale={1.9} className="h-[200px] flex-none" />
          <DetailText reward={sheetReward} status={statusOf(sheetReward, p.level, opened)} away={sheetReward.level - p.level} sheet {...act} />
          <MiniTry me={me} reward={sheetReward} eq={eq} />
          <button type="button" onClick={() => setSheet(null)} aria-label="Close" className="absolute right-6 top-[22px] w-[30px] h-[30px] rounded-full bg-white grid place-items-center text-[var(--ink)] shadow-[0_1px_4px_rgba(20,18,30,.2)]"><X className="w-4 h-4" /></button>
        </Sheet>
      )}
    </div>
  );
}
