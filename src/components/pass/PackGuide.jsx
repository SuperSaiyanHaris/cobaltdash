// "What's in a pack": pick a pack, see it big, and see everything it can
// hold: its set (frame, ring, name effect, card back), the set bonus effect,
// the comment flair it can carry, and the extras, with the odds per slot.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Snowflake, LayoutGrid, Sparkles, Zap, Ticket } from 'lucide-react';
import { PackSvg, ItemFace, UserCardSvg } from './PassArt';
import Nameplate from './Nameplate';
import {
  PACKS, FLAIRS, CARD_EFFECTS, SLOT_WEIGHTS, RARITY_ORDER, setPieces, flairCap, voucherChance, xpToNext,
} from '../../lib/shinyPass';

const SAMPLE_ME = { handle: 'you', level: 30, into: 10, need: 60, xp: 4000, streak: 5, equipped: {} };
const LABEL = { set: 'Set piece', xp: 'XP bonus', flair: 'Comment flair', freeze: 'Streak Freeze', showcase: 'Showcase slot', shiny: 'Shiny variant' };

function Extra({ icon: Icon, title, note }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
      <span className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0"><Icon className="w-[18px] h-[18px]" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-neutral-900 leading-tight">{title}</p>
        <p className="text-[13px] text-neutral-700 leading-snug">{note}</p>
      </div>
    </div>
  );
}

export default function PackGuide({ me, season }) {
  const [sel, setSel] = useState(PACKS[0].key);
  const pack = PACKS.find((p) => p.key === sel);
  const viewer = me || SAMPLE_ME;
  const pieces = setPieces(pack.key);
  const flairs = Object.keys(FLAIRS).filter((k) => RARITY_ORDER.indexOf(FLAIRS[k].rarity) <= flairCap(pack.level));
  const total = SLOT_WEIGHTS.reduce((s, e) => s + e.w, 0);
  const xpLo = Math.round(xpToNext(pack.level, season) * 0.25);
  const xpHi = Math.round(xpToNext(pack.level, season) * 0.6);
  const voucher = voucherChance(pack.level);

  return (
    <div>
      {/* Pack picker */}
      <div className="grid grid-cols-5 lg:grid-cols-10 gap-2" role="tablist" aria-label="Packs">
        {PACKS.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={p.key === sel}
            onClick={() => setSel(p.key)}
            className={`rounded-xl p-1.5 border-2 transition-colors ${p.key === sel ? 'border-neutral-900 bg-white' : 'border-transparent hover:border-neutral-300'}`}
          >
            <PackSvg pack={p} still season={season} />
            <span className="mt-1 block text-[11px] font-bold text-neutral-800">Lv {p.level}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
        {/* The pack, big */}
        <div className="w-[200px] sm:w-[240px] md:w-full mx-auto md:mx-0 md:sticky md:top-24">
          <PackSvg key={pack.key} pack={pack} season={season} className="drop-shadow-[0_26px_30px_rgba(0,0,0,0.35)]" />
        </div>

        <div className="min-w-0">
          <p className="font-arena italic font-black uppercase text-[28px] leading-none text-neutral-950">{pack.name} pack</p>
          <p className="mt-2 text-[15px] text-neutral-700">
            Level {pack.level} · {pack.items} items. Always its card frame, plus a {pack.name} set piece you don't have yet.
          </p>

          <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-600">The {pack.name} set</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {pieces.map((x) => <ItemFace key={`${x.kind}:${x.key}`} item={{ ...x, rarity: x.rarity || 'rare' }} me={viewer} />)}
          </div>
          <div className="mt-3 flex items-center gap-4 rounded-2xl bg-[#0a0a0f] p-3 text-white">
            <div className="w-[96px] flex-shrink-0"><UserCardSvg me={viewer} equippedOverride={{ ...(viewer.equipped || {}), frame: pack.key, effect: pack.key }} /></div>
            <p className="text-sm text-white/80 leading-snug">
              <b className="text-white">Set bonus: {CARD_EFFECTS[pack.key].name}.</b> Collect all four pieces and your card gets this animated effect, plus the {pack.name} Set badge. Missing pieces can also turn up in later packs.
            </p>
          </div>

          <p className="mt-6 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-600">Can also contain</p>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            <Extra icon={Zap} title={`+${xpLo}-${xpHi} XP`} note="Toward your next level. Never in the last slot." />
            <Extra icon={Snowflake} title="Streak Freeze" note="Saves your streak if you miss a day." />
            <Extra icon={LayoutGrid} title="Showcase slot" note="One more creator on your public page." />
            <Extra icon={Sparkles} title="Shiny variant" note="Your own foil version of a creator you follow." />
            <Extra
              icon={Ticket}
              title="Free month: Featured Listing"
              note={voucher >= 1 ? 'Always in this pack.' : `${Math.round(voucher * 100)}% chance. A Basic spot for any creator, 30 days.`}
            />
          </div>
          <div className="mt-2 rounded-xl border border-neutral-200 bg-white px-3 py-3">
            <p className="text-sm font-bold text-neutral-900">Comment flair <span className="font-medium text-neutral-600">({flairs.length} possible)</span></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {flairs.map((k) => <Nameplate key={k} name={FLAIRS[k].name.replace(' flair', '')} flairKey={k} />)}
            </div>
          </div>

          <details className="mt-4 group">
            <summary className="cursor-pointer text-sm font-bold text-neutral-900 select-none">Odds per slot</summary>
            <div className="mt-2 rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {SLOT_WEIGHTS.map((e) => (
                    <tr key={e.kind}><td className="px-4 py-2 font-semibold text-neutral-900">{LABEL[e.kind]}</td><td className="px-4 py-2 text-right tabular-nums text-neutral-800">{((e.w / total) * 100).toFixed(1)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[13px] text-neutral-700">The first slot after the frame is always a set piece you're missing. Duplicates turn into XP. Featured Listing months end on their own unless someone starts a paid listing on <Link to="/promote" className="font-semibold text-neutral-900 underline">Promote</Link>.</p>
          </details>
        </div>
      </div>
    </div>
  );
}
