// ShinyPass Packs tab (and the signed-out "what's in a pack"): ten season
// packs as foil pouches. Desktop shows one big stage (the pack, what it can
// hold, how to open it) and the whole collection on a shelf; phones swipe a
// carousel with the same details underneath. Below that, everything a pack
// can hold, with the odds per slot.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Sparkles, Ticket } from 'lucide-react';
import PackArt, { PACK_META } from './PackArt';
import { ItemFace, UserCardSvg } from './PassArt';
import Nameplate from './Nameplate';
import { RARITY_HEX, RARITY_LABEL } from './RewardLight';
import useDesktop from './useDesktop';
import {
  PACKS, FLAIRS, CARD_EFFECTS, SLOT_WEIGHTS, RARITY_ORDER, setPieces, flairCap, voucherChance, xpToNext, itemName,
} from '../../lib/shinyPass';

const SAMPLE_ME = { handle: 'you', level: 30, into: 10, need: 60, xp: 4000, streak: 5, equipped: {} };
const SLOT_LABEL = { set: 'Set piece', xp: 'XP bonus', flair: 'Comment flair', freeze: 'Streak Freeze', showcase: 'Showcase slot', shiny: 'Shiny variant' };
const PACK_RARITY = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary'];
const BONUS = ['Comment flair', 'XP bonus', 'Streak Freeze', 'Showcase slot', 'Shiny variant'];

function Chip({ children }) {
  return <span className="px-2.5 py-1.5 rounded-[9px] bg-white text-xs font-bold text-[var(--ink)]">{children}</span>;
}

function Inside({ pack, compact = false }) {
  const pieces = setPieces(pack.key).filter((x) => x.kind !== 'frame');
  const voucher = voucherChance(pack.level);
  const meta = PACK_META[pack.key];
  const effect = CARD_EFFECTS[pack.key]?.name;
  if (compact) {
    return (
      <div className="p-4 rounded-[20px] bg-white flex flex-col gap-3">
        <h3 className="font-bric font-extrabold text-[15px] text-[var(--ink)]">What's inside</h3>
        <div className="flex items-center gap-3"><span className="w-[34px] h-[34px] rounded-[10px] bg-[var(--ink)] text-white grid place-items-center font-extrabold text-[13px]">▣</span><span className="flex-1 font-extrabold text-[13px] text-[var(--ink)]">{pack.name} card frame</span><span className="text-[10px] font-extrabold tracking-[.06em] text-[var(--soft)]">ALWAYS</span></div>
        <div className="flex items-center gap-3"><span className="w-[34px] h-[34px] rounded-[10px] text-white grid place-items-center font-extrabold text-[13px]" style={{ background: meta.accent }}>◆</span><div className="flex-1 min-w-0"><div className="font-extrabold text-[13px] text-[var(--ink)]">One set piece</div><div className="text-[11.5px] font-semibold text-[var(--soft)]">{pieces.map((x) => itemName(x).replace(/^Card effect: /, '')).join(' · ')}</div></div></div>
        <div className="flex items-center gap-3"><span className="w-[34px] h-[34px] rounded-[10px] bg-[var(--cream)] text-[var(--ink)] grid place-items-center font-extrabold text-[15px]">+</span><div className="flex-1 min-w-0"><div className="font-extrabold text-[13px] text-[var(--ink)]">Bonus slots</div><div className="text-[11.5px] font-semibold text-[var(--soft)]">{BONUS.join(', ')}</div></div></div>
        <div className="flex items-center gap-3"><span className="w-[34px] h-[34px] rounded-[10px] bg-amber-400 text-neutral-950 grid place-items-center"><Ticket className="w-[17px] h-[17px]" /></span><div className="flex-1 min-w-0"><div className="font-extrabold text-[13px] text-[var(--ink)]">Free month: Featured Listing</div><div className="text-[11.5px] font-semibold text-[var(--soft)]">{voucher >= 1 ? 'Always in this pack' : `${Math.round(voucher * 100)}% chance`}</div></div></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-baseline"><h3 className="font-bric font-extrabold text-lg text-[var(--ink)]">What's inside</h3><span className="text-xs font-bold text-[var(--soft)]">{pack.items} items</span></div>
      <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[var(--cream)]">
        <span className="w-10 h-10 rounded-xl bg-[var(--ink)] text-white grid place-items-center font-extrabold text-[15px]">▣</span>
        <div className="flex-1 min-w-0"><div className="font-extrabold text-sm text-[var(--ink)]">{pack.name} card frame</div><div className="text-xs font-semibold text-[var(--soft)]">Every time</div></div>
        <span className="px-[9px] py-[3px] rounded-full bg-white text-[10px] font-extrabold tracking-[.06em] text-[var(--ink)] border border-[rgba(20,18,30,.1)]">GUARANTEED</span>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-[var(--cream)]">
        <div className="flex items-center gap-3.5"><span className="w-10 h-10 rounded-xl text-white grid place-items-center font-extrabold text-[15px]" style={{ background: meta.accent }}>◆</span><div><div className="font-extrabold text-sm text-[var(--ink)]">One set piece</div><div className="text-xs font-semibold text-[var(--soft)]">One you don't have yet</div></div></div>
        <div className="flex flex-wrap gap-1.5">{pieces.map((x) => <Chip key={`${x.kind}:${x.key}`}>{itemName(x)}</Chip>)}</div>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-[var(--cream)]">
        <div className="flex items-center gap-3.5"><span className="w-10 h-10 rounded-xl bg-white border border-[rgba(20,18,30,.1)] text-[var(--ink)] grid place-items-center font-extrabold text-[15px]">+</span><div><div className="font-extrabold text-sm text-[var(--ink)]">Bonus slots</div><div className="text-xs font-semibold text-[var(--soft)]">Flair, XP and extras</div></div></div>
        <div className="flex flex-wrap gap-1.5">{BONUS.map((b) => <Chip key={b}>{b}</Chip>)}</div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--cream)]">
        <span className="w-10 h-10 rounded-xl bg-amber-400 text-neutral-950 grid place-items-center"><Ticket className="w-[18px] h-[18px]" /></span>
        <div className="min-w-0"><div className="font-extrabold text-sm text-[var(--ink)]">Free month: Featured Listing</div><div className="text-xs font-semibold text-[var(--soft)]">{voucher >= 1 ? 'Always in this pack.' : `${Math.round(voucher * 100)}% chance in this pack.`}</div></div>
      </div>
      <div className="p-0.5 rounded-2xl" style={{ background: 'linear-gradient(120deg,#6D4AFF,#D9A22C)' }}>
        <div className="px-3.5 py-3 rounded-[14px] bg-white flex items-center gap-3"><Sparkles className="w-4 h-4 text-[#C9982A] flex-none" /><p className="text-[12.5px] leading-snug font-semibold text-[#403e46]">Complete the set to unlock the <b className="text-[var(--ink)]">{effect}</b> card effect.</p></div>
      </div>
    </div>
  );
}

function Cta({ pack, status, state, onOpenPack, onViewPack, full = false }) {
  const toGo = Math.max(0, pack.level - (state?.progress.level || 0));
  const prog = state ? Math.min(100, Math.round(((state.progress.level || 0) / pack.level) * 100)) : 0;
  if (status === 'ready') return <button type="button" onClick={() => onOpenPack(pack.level)} className={`spx-btn lg ${full ? 'w-full' : ''}`}><span className="spx-pulse" />Tear it open</button>;
  if (status === 'opened') return <button type="button" onClick={() => onViewPack(pack.level)} className={`spx-btn line lg ${full ? 'w-full' : ''}`}>View your pulls</button>;
  if (!state) return <p className="text-[13px] font-bold text-[var(--ink)]">Unlocks at level {pack.level}</p>;
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between text-[13px] font-extrabold text-[var(--ink)]"><span>{toGo} {toGo === 1 ? 'level' : 'levels'} to unlock</span><span className="text-[var(--soft)]">Level {pack.level}</span></div>
      <div className="h-2 rounded bg-[var(--trough)] overflow-hidden"><div className="h-full rounded bg-[var(--ink)]" style={{ width: `${prog}%` }} /></div>
    </div>
  );
}

function firstPick(state) {
  if (!state) return 0;
  const ready = state.packs.available[0];
  if (ready) return Math.max(0, PACKS.findIndex((p) => p.level === ready));
  const opened = new Set(state.packs.opened);
  const i = PACKS.findIndex((p) => !opened.has(p.level) && p.level > state.progress.level);
  return i < 0 ? 0 : i;
}

export default function PacksView({ me, season, state, onOpenPack = () => {}, onViewPack = () => {} }) {
  const desktop = useDesktop();
  const [sel, setSel] = useState(() => firstPick(state));
  const scroller = useRef(null);
  const pack = PACKS[sel];
  const meta = PACK_META[pack.key];
  const viewer = me || SAMPLE_ME;
  const opened = useMemo(() => new Set(state?.packs.opened || []), [state]);
  const ready = useMemo(() => new Set(state?.packs.available || []), [state]);
  const statusOf = useCallback((p) => (ready.has(p.level) ? 'ready' : opened.has(p.level) ? 'opened' : 'locked'), [ready, opened]);
  const status = statusOf(pack);
  const level = state?.progress.level || 0;
  const rarity = PACK_RARITY[sel];

  // Phones: the carousel and the selection follow each other.
  const centerOn = useCallback((i, smooth) => {
    const el = scroller.current;
    const child = el?.children[i];
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useEffect(() => { if (!desktop) centerOn(sel, false); }, [desktop]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0; let bd = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
      if (d < bd) { bd = d; best = i; }
    }
    if (best !== sel) setSel(best);
  };
  const pick = (i) => { setSel(i); if (!desktop) centerOn(i, true); };

  const extras = <MoreAbout pack={pack} season={season} viewer={viewer} />;

  const pill = (p) => {
    const st = statusOf(p);
    return st === 'ready'
      ? <span className="spx-pill bg-[var(--accent)] text-white">● Ready</span>
      : st === 'opened'
        ? <span className="spx-pill bg-white text-[var(--ink)]"><Check className="w-3 h-3" strokeWidth={3.5} />Opened</span>
        : <span className="spx-pill text-[var(--soft)]">Lv {p.level}</span>;
  };

  if (desktop) {
    return (
      <div className="flex flex-col gap-6">
        <div className="spx-card grid items-center gap-8 p-10 min-h-[560px]" style={{ gridTemplateColumns: '360px minmax(0,1fr) 380px' }}>
          <div className="flex flex-col gap-[18px]">
            <div className="text-[11px] font-bold tracking-[.14em] text-[var(--accent)] uppercase">ShinyPass · Season {season}</div>
            <h2 className="font-bric font-extrabold text-[56px] leading-none tracking-[-.02em] text-[var(--ink)]">Season Packs</h2>
            <p className="text-[15px] leading-relaxed text-[var(--mute)] font-medium text-pretty">Ten packs, one every ten levels. Each holds its card frame and a piece of its set. Earned, never sold.</p>
            <div className="flex flex-col gap-2 mt-1.5">
              <div className="flex justify-between text-xs font-bold text-[var(--ink)]"><span>{opened.size} of {PACKS.length} opened</span>{state && <span className="text-[var(--soft)]">Level {level}</span>}</div>
              <div className="spx-seg10">{PACKS.map((p) => <i key={p.key} className={statusOf(p) === 'opened' ? 'on' : statusOf(p) === 'ready' ? 'cur' : ''} />)}</div>
            </div>
            <div className="h-px bg-[var(--line)] my-1.5" />
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-[.06em] uppercase text-white" style={{ background: RARITY_HEX[rarity] }}>{RARITY_LABEL[rarity]}</span>
              <span className="text-[13px] font-bold text-[var(--soft)]">Level {pack.level} · {pack.items} items</span>
            </div>
            <div className="font-arena italic font-black uppercase text-[46px] leading-[.95] tracking-[.01em] text-[var(--ink)]">{pack.name} pack</div>
            <p className="text-sm leading-relaxed text-[var(--mute)] font-medium">{meta.tag}</p>
            <div className="mt-1"><Cta pack={pack} status={status} state={state} onOpenPack={onOpenPack} onViewPack={onViewPack} /></div>
          </div>
          <div className="relative h-[520px] flex items-center justify-center">
            <div className="absolute -inset-2.5 rounded-3xl transition-[background] duration-500" style={{ background: `radial-gradient(50% 55% at 50% 48%, ${meta.accent}38, ${meta.accent}00 75%)` }} />
            <div className="absolute left-1/2 bottom-[22px] w-60 h-7 -translate-x-1/2 rounded-[50%]" style={{ background: 'radial-gradient(closest-side,rgba(20,18,30,.28),rgba(20,18,30,0))' }} />
            <div className="relative w-[280px] spx-floaty"><PackArt key={pack.key} packKey={pack.key} season={season} tilt idle locked={status === 'locked'} /></div>
          </div>
          <Inside pack={pack} />
        </div>

        <div className="px-1">
          <div className="flex justify-between items-baseline mb-[22px]"><h3 className="font-bric font-extrabold text-2xl text-[var(--ink)]">The collection</h3><span className="text-[13px] font-bold text-[var(--soft)]">Hover to preview · click to inspect</span></div>
          <div className="spx-shelf pt-2.5">
            {PACKS.map((p, i) => (
              <button key={p.key} type="button" aria-pressed={i === sel} onClick={() => pick(i)} className={`spx-shelf-item ${statusOf(p) === 'locked' ? 'locked' : ''}`} aria-label={`${p.name} pack, level ${p.level}`}>
                <span className="pk-wrap"><PackArt packKey={p.key} season={season} tilt locked={false} /></span>
                <span className="flex flex-col items-center gap-1"><span className="font-extrabold text-[13px] text-[var(--ink)] whitespace-nowrap">{p.name}</span>{pill(p)}</span>
                <span className="w-6 h-[3px] rounded-sm" style={{ background: i === sel ? 'var(--ink)' : 'transparent' }} />
              </button>
            ))}
          </div>
        </div>
        {extras}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <div>
        <h2 className="font-bric font-extrabold text-[32px] leading-none tracking-[-.02em] text-[var(--ink)]">Season Packs</h2>
        <div className="spx-seg10 mt-3.5 !gap-[3px]">{PACKS.map((p) => <i key={p.key} className={statusOf(p) === 'opened' ? 'on' : statusOf(p) === 'ready' ? 'cur' : ''} style={{ height: 5 }} />)}</div>
        <p className="text-xs font-bold text-[var(--soft)] mt-2">{opened.size} of {PACKS.length} opened{state && (PACKS.find((p) => !opened.has(p.level) && !ready.has(p.level)) ? ` · next pack at Lv ${PACKS.find((p) => !opened.has(p.level) && !ready.has(p.level)).level}` : '')}</p>
      </div>

      <div ref={scroller} onScroll={onScroll} className="spx-snap -mx-4 py-6" style={{ paddingInline: 'calc(50% - 110px)' }}>
        {PACKS.map((p, i) => (
          <button key={p.key} type="button" onClick={() => pick(i)} aria-label={`${p.name} pack, level ${p.level}`} className="flex-none w-[220px] snap-center [scroll-snap-align:center] transition-[transform,opacity] duration-300" style={{ transform: i === sel ? 'scale(1)' : 'scale(.86)', opacity: i === sel ? 1 : 0.55 }}>
            <PackArt packKey={p.key} season={season} tilt locked={statusOf(p) === 'locked' && i !== sel} />
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className="flex items-center gap-2"><span className="px-[9px] py-[3px] rounded-full text-[10px] font-extrabold tracking-[.06em] uppercase text-white" style={{ background: RARITY_HEX[rarity] }}>{RARITY_LABEL[rarity]}</span><span className="text-xs font-bold text-[var(--soft)]">Level {pack.level} · {pack.items} items</span></div>
        <div className="font-arena italic font-black uppercase text-[36px] leading-[.95] text-[var(--ink)]">{pack.name} pack</div>
        <p className="text-sm leading-relaxed text-[var(--mute)] font-medium max-w-[300px]">{meta.tag}</p>
      </div>
      <div className="pt-[18px]"><Cta pack={pack} status={status} state={state} onOpenPack={onOpenPack} onViewPack={onViewPack} full /></div>

      <div className="mt-[18px]"><Inside pack={pack} compact /></div>

      <div className="pt-[26px]">
        <h3 className="font-bric font-extrabold text-[17px] text-[var(--ink)] mb-3.5">The collection</h3>
        <div className="grid grid-cols-5 gap-x-2 gap-y-2.5">
          {PACKS.map((p, i) => {
            const st = statusOf(p);
            return (
              <button key={p.key} type="button" onClick={() => pick(i)} aria-label={`${p.name} pack, level ${p.level}`} className="flex flex-col items-center gap-1.5">
                <span className="block w-full p-1 box-border rounded-xl border-2" style={{ borderColor: i === sel ? 'var(--ink)' : 'transparent', opacity: st === 'locked' && i !== sel ? 0.6 : 1 }}><PackArt packKey={p.key} season={season} shadow={false} /></span>
                <span className="text-[10px] font-extrabold" style={{ color: st === 'ready' ? 'var(--accent)' : st === 'opened' ? 'var(--ink)' : 'var(--soft)' }}>{st === 'ready' ? 'Open' : st === 'opened' ? 'Opened' : `Lv ${p.level}`}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-6">{extras}</div>
    </div>
  );
}

// The detail under the stage: the whole set as cards, the set bonus, every
// slot and its odds.
function MoreAbout({ pack, season, viewer }) {
  const pieces = setPieces(pack.key);
  const flairs = Object.keys(FLAIRS).filter((k) => RARITY_ORDER.indexOf(FLAIRS[k].rarity) <= flairCap(pack.level));
  const total = SLOT_WEIGHTS.reduce((s, e) => s + e.w, 0);
  const xpLo = Math.round(xpToNext(pack.level, season) * 0.25);
  const xpHi = Math.round(xpToNext(pack.level, season) * 0.6);
  return (
    <div className="spx-card p-5 sm:p-7 flex flex-col gap-5">
      <div>
        <h3 className="font-bric font-extrabold text-xl text-[var(--ink)]">The {pack.name} set</h3>
        <p className="mt-1 text-sm text-[var(--mute)] font-medium">Packs are earned, never sold, and nothing inside is on the level track. Levels and packs reset every January 1; everything you collect stays yours.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 max-w-4xl">
        {pieces.map((x) => <ItemFace key={`${x.kind}:${x.key}`} item={{ ...x, rarity: x.rarity || 'rare' }} me={viewer} />)}
      </div>
      <div className="flex items-center gap-4 rounded-2xl bg-[#0a0a0f] p-3 text-white">
        <div className="w-[76px] sm:w-[96px] flex-shrink-0"><UserCardSvg me={viewer} equippedOverride={{ ...(viewer.equipped || {}), frame: pack.key, effect: pack.key }} still /></div>
        <p className="text-sm text-white/80 leading-snug"><b className="text-white">Set bonus: {CARD_EFFECTS[pack.key].name}.</b> Collect all four pieces and your card gets this animated effect, plus the {pack.name} Set badge.</p>
      </div>
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[var(--soft)]">Can also contain</p>
        <ul className="mt-2 grid sm:grid-cols-2 gap-2 text-sm font-semibold text-[var(--ink)]">
          <li className="rounded-xl bg-[var(--cream)] px-3.5 py-2.5"><b>+{xpLo}-{xpHi} XP</b><span className="block text-[13px] font-medium text-[var(--mute)]">Toward your next level. Never in the last slot.</span></li>
          <li className="rounded-xl bg-[var(--cream)] px-3.5 py-2.5"><b>Streak Freeze</b><span className="block text-[13px] font-medium text-[var(--mute)]">Saves your streak if you miss a day.</span></li>
          <li className="rounded-xl bg-[var(--cream)] px-3.5 py-2.5"><b>Showcase slot</b><span className="block text-[13px] font-medium text-[var(--mute)]">One more creator on your public page.</span></li>
          <li className="rounded-xl bg-[var(--cream)] px-3.5 py-2.5"><b>Shiny variant</b><span className="block text-[13px] font-medium text-[var(--mute)]">Your own foil version of a creator you follow.</span></li>
        </ul>
        <div className="mt-2 rounded-xl bg-[var(--cream)] px-3.5 py-3">
          <p className="text-sm font-bold text-[var(--ink)]">Comment flair <span className="font-medium text-[var(--mute)]">({flairs.length} possible)</span></p>
          <div className="mt-2 flex flex-wrap gap-2">{flairs.map((k) => <Nameplate key={k} name={FLAIRS[k].name.replace(' flair', '')} flairKey={k} />)}</div>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-extrabold text-[var(--ink)] select-none">Odds per slot</summary>
        <div className="mt-2 rounded-xl border border-[var(--line)] overflow-hidden">
          <table className="w-full text-sm"><tbody className="divide-y divide-neutral-100">
            {SLOT_WEIGHTS.map((e) => <tr key={e.kind}><td className="px-4 py-2 font-semibold text-[var(--ink)]">{SLOT_LABEL[e.kind]}</td><td className="px-4 py-2 text-right tabular-nums text-neutral-800">{((e.w / total) * 100).toFixed(1)}%</td></tr>)}
          </tbody></table>
        </div>
        <p className="mt-2 text-[13px] text-[var(--mute)]">The first slot after the frame is always a set piece you're missing, and later packs can carry pieces of earlier sets. Duplicates turn into XP. Featured Listing months end on their own unless someone starts a paid listing on <Link to="/promote" className="font-bold text-[var(--ink)] underline">Promote</Link>.</p>
      </details>
    </div>
  );
}
