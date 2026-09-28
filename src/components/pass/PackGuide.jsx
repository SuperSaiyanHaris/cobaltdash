// "What's in a pack": pick a pack, see it big, and see everything it can
// hold: its set (frame, ring, name effect, card back), the set bonus effect,
// the comment flair it can carry, and the extras, with the odds per slot.
// Signed in (`state`), it also shows which packs are ready or opened and can
// open one; on phones it replaces the season packs strip.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Snowflake, LayoutGrid, Sparkles, Zap, Ticket, Check } from 'lucide-react';
import { PackSvg, ItemFace, UserCardSvg } from './PassArt';
import Nameplate from './Nameplate';
import {
  PACKS, FLAIRS, CARD_EFFECTS, SLOT_WEIGHTS, RARITY_ORDER, setPieces, flairCap, voucherChance, xpToNext,
} from '../../lib/shinyPass';

const SAMPLE_ME = { handle: 'you', level: 30, into: 10, need: 60, xp: 4000, streak: 5, equipped: {} };
const LABEL = { set: 'Set piece', xp: 'XP bonus', flair: 'Comment flair', freeze: 'Streak Freeze', showcase: 'Showcase slot', shiny: 'Shiny variant' };

function Extra({ icon: Icon, title, note, paid = false }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${paid ? 'bg-amber-400 text-neutral-950' : 'bg-neutral-900 text-white'}`}><Icon className="w-[18px] h-[18px]" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-neutral-900 leading-tight">{title}</p>
        <p className="text-[13px] text-neutral-700 leading-snug">{note}</p>
      </div>
    </div>
  );
}

function firstPick(state) {
  if (!state) return PACKS[0].key;
  const ready = state.packs.available[0];
  if (ready) return PACKS.find((p) => p.level === ready)?.key || PACKS[0].key;
  const opened = new Set(state.packs.opened);
  return (PACKS.find((p) => !opened.has(p.level) && p.level > state.progress.level) || PACKS[0]).key;
}

export default function PackGuide({ me, season, state, onOpenPack }) {
  const [sel, setSel] = useState(() => firstPick(state));
  // The season strip on the track opens a pack here.
  useEffect(() => {
    const open = (e) => { if (PACKS.some((p) => p.key === e.detail)) setSel(e.detail); };
    window.addEventListener('shinypass:guide', open);
    return () => window.removeEventListener('shinypass:guide', open);
  }, []);
  const pack = PACKS.find((p) => p.key === sel);
  const viewer = me || SAMPLE_ME;
  const pieces = setPieces(pack.key);
  const flairs = Object.keys(FLAIRS).filter((k) => RARITY_ORDER.indexOf(FLAIRS[k].rarity) <= flairCap(pack.level));
  const total = SLOT_WEIGHTS.reduce((s, e) => s + e.w, 0);
  const xpLo = Math.round(xpToNext(pack.level, season) * 0.25);
  const xpHi = Math.round(xpToNext(pack.level, season) * 0.6);
  const voucher = voucherChance(pack.level);
  const opened = new Set(state?.packs.opened || []);
  const readySet = new Set(state?.packs.available || []);
  const status = (p) => (readySet.has(p.level) ? 'ready' : opened.has(p.level) ? 'opened' : 'locked');

  const extras = (
    <>
      <Extra icon={Zap} title={`+${xpLo}-${xpHi} XP`} note="Toward your next level. Never in the last slot." />
      <Extra icon={Snowflake} title="Streak Freeze" note="Saves your streak if you miss a day." />
      <Extra icon={LayoutGrid} title="Showcase slot" note="One more creator on your public page." />
      <Extra icon={Sparkles} title="Shiny variant" note="Your own foil version of a creator you follow." />
    </>
  );
  const flairBox = (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
      <p className="text-sm font-bold text-neutral-900">Comment flair <span className="font-medium text-neutral-600">({flairs.length} possible)</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        {flairs.map((k) => <Nameplate key={k} name={FLAIRS[k].name.replace(' flair', '')} flairKey={k} />)}
      </div>
    </div>
  );
  const openBtn = state && status(pack) === 'ready' && onOpenPack
    ? <button onClick={() => onOpenPack(pack.level)} className="sp-tap mt-3 h-10 px-5 rounded-xl bg-brand hover:bg-brand-hover lg:bg-neutral-900 lg:hover:bg-neutral-700 text-white text-sm font-bold">Open pack</button>
    : null;

  return (
    <div>
      {state && <p className="mb-3 text-sm font-semibold text-neutral-700 tabular-nums">{opened.size} of {PACKS.length} opened this season</p>}
      {/* Pack picker */}
      <div className="grid grid-cols-5 lg:grid-cols-10 gap-1.5 sm:gap-2" role="tablist" aria-label="Packs">
        {PACKS.map((p) => {
          const st = status(p);
          return (
            <button
              key={p.key}
              role="tab"
              aria-selected={p.key === sel}
              aria-label={`${p.name} pack, level ${p.level}${st === 'ready' ? ', ready to open' : st === 'opened' ? ', opened' : ''}`}
              onClick={() => setSel(p.key)}
              className={`sp-tap rounded-xl p-1 sm:p-1.5 border-2 transition-colors ${p.key === sel ? 'border-neutral-900 bg-white' : 'border-transparent hover:border-neutral-300'}`}
            >
              <PackSvg pack={p} still season={season} />
              <span className={`mt-1 inline-flex items-center gap-0.5 rounded px-1.5 text-[11px] font-bold ${st === 'ready' ? 'bg-neutral-900 text-white' : 'text-neutral-800'}`}>
                {st === 'ready' ? 'Open' : st === 'opened' ? <><Check className="w-3 h-3" />Opened</> : `Lv ${p.level}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
        {/* The pack: big on larger screens, beside its name on phones */}
        <div className="flex md:block items-center gap-4 md:sticky md:top-24">
          <div className="w-[112px] sm:w-[160px] md:w-full flex-shrink-0">
            <PackSvg key={pack.key} pack={pack} season={season} />
          </div>
          <div className="md:hidden min-w-0">
            <p className="font-arena italic font-black uppercase text-[26px] leading-none text-neutral-950">{pack.name} pack</p>
            <p className="mt-1.5 text-sm text-neutral-700">Level {pack.level} · {pack.items} items</p>
            {openBtn}
          </div>
        </div>

        <div className="min-w-0">
          <div className="hidden md:block mb-5">
            <p className="font-arena italic font-black uppercase text-[28px] leading-none text-neutral-950">{pack.name} pack</p>
            <p className="mt-2 text-[15px] text-neutral-700">
              Level {pack.level} · {pack.items} items. Always its card frame, plus a {pack.name} set piece you don't have yet.
            </p>
            {openBtn}
          </div>

          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-600">The {pack.name} set</p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:gap-3">
            {pieces.map((x) => <ItemFace key={`${x.kind}:${x.key}`} item={{ ...x, rarity: x.rarity || 'rare' }} me={viewer} />)}
          </div>
          <div className="mt-3 flex items-center gap-4 rounded-2xl bg-[#0a0a0f] p-3 text-white">
            <div className="w-[76px] sm:w-[96px] flex-shrink-0"><UserCardSvg me={viewer} equippedOverride={{ ...(viewer.equipped || {}), frame: pack.key, effect: pack.key }} /></div>
            <p className="text-sm text-white/80 leading-snug">
              <b className="text-white">Set bonus: {CARD_EFFECTS[pack.key].name}.</b> Collect all four pieces and your card gets this animated effect, plus the {pack.name} Set badge.
            </p>
          </div>

          <p className="mt-6 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-600">Can also contain</p>
          <div className="mt-2">
            <Extra
              paid
              icon={Ticket}
              title="Free month: Featured Listing"
              note={voucher >= 1 ? 'Always in this pack. A Basic spot for any creator you pick, 30 days.' : `${Math.round(voucher * 100)}% chance in this pack. Always in the level 50 and 99 packs.`}
            />
          </div>
          {/* Phones: the rest folds away */}
          <details className="sm:hidden mt-2">
            <summary className="sp-tap cursor-pointer rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-bold text-neutral-900 select-none">
              {4 + flairs.length} more things it can hold
            </summary>
            <div className="mt-2 grid gap-2">{extras}{flairBox}</div>
          </details>
          <div className="hidden sm:grid mt-2 grid-cols-2 gap-2">{extras}</div>
          <div className="hidden sm:block mt-2">{flairBox}</div>

          <details className="mt-4">
            <summary className="sp-tap cursor-pointer text-sm font-bold text-neutral-900 select-none">Odds per slot</summary>
            <div className="mt-2 rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {SLOT_WEIGHTS.map((e) => (
                    <tr key={e.kind}><td className="px-4 py-2 font-semibold text-neutral-900">{LABEL[e.kind]}</td><td className="px-4 py-2 text-right tabular-nums text-neutral-800">{((e.w / total) * 100).toFixed(1)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[13px] text-neutral-700">The first slot after the frame is always a set piece you're missing, and later packs can carry pieces of earlier sets. Duplicates turn into XP. Featured Listing months end on their own unless someone starts a paid listing on <Link to="/promote" className="font-semibold text-neutral-900 underline">Promote</Link>.</p>
          </details>
        </div>
      </div>
    </div>
  );
}
