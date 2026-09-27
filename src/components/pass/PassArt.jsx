// Inline renders of the ShinyPass SVG art (user card, pack) and the face of
// each item you can pull. The SVG strings come from pure renderers in
// src/lib; everything user-controlled in them is escaped there.
import { memo, useId } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Snowflake, LayoutGrid, Sparkles, Zap, Ticket, Copy } from 'lucide-react';
import { renderUserCard } from '../../lib/userCard';
import { renderPack } from '../../lib/packArt';
import { PACK_BY_KEY, RINGS, TITLES, itemName, itemBlurb } from '../../lib/shinyPass';
import { markBarsInner } from '../../lib/brandMark';

export const CARD_RADIUS = 'rounded-[6.4%/4.571%]';

export const RARITY = {
  common:    { label: 'Common',    a: '#D4D4D8', b: '#A1A1AA' },
  uncommon:  { label: 'Uncommon',  a: '#6EE7B7', b: '#059669' },
  rare:      { label: 'Rare',      a: '#5EC8FF', b: '#0284C7' },
  epic:      { label: 'Epic',      a: '#C084FC', b: '#9333EA' },
  legendary: { label: 'Legendary', a: '#FFD76A', b: '#E0A526' },
};

const uidOf = (s) => s.replace(/[^a-z0-9]/gi, '');

export const UserCardSvg = memo(function UserCardSvg({ me, className = '', equippedOverride, still = false }) {
  const uid = uidOf(useId());
  const reduce = useReducedMotion();
  if (!me) return null;
  const html = renderUserCard({
    uid,
    handle: me.handle || 'you',
    avatar: me.avatar,
    level: me.level,
    into: me.into,
    need: me.need,
    xp: me.xp,
    streak: me.streak,
    season: me.seasonNumber,
    equipped: equippedOverride || me.equipped,
    still: still || !!reduce,
  });
  return <div className={`${CARD_RADIUS} overflow-hidden [&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

export const PackSvg = memo(function PackSvg({ pack, locked = false, still = false, className = '' }) {
  const uid = uidOf(useId());
  const reduce = useReducedMotion();
  const html = renderPack(pack, { uid: `${pack.key}${uid}`, locked, still: still || !!reduce });
  return <div className={`[&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

const foil = (a, b, c, d) => `linear-gradient(135deg, ${a}, ${b} 30%, ${d || c} 55%, ${c} 75%, ${a})`;

function Swatch({ a, b, c, d }) {
  return (
    <div className="h-full max-w-[62%] aspect-[5/7] rounded-lg p-[3px] rotate-[-6deg]" style={{ background: foil(a, b, c, d) }}>
      <div className="w-full h-full rounded-md bg-[#0B0B12] flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-2/3" dangerouslySetInnerHTML={{ __html: markBarsInner('sw') }} />
      </div>
    </div>
  );
}

// Every size below is in cqw (percent of the item card's width) so an item
// reads the same on a 110px phone grid and a 180px desktop fan.
function Visual({ item, me }) {
  switch (item.kind) {
    case 'frame': {
      const p = PACK_BY_KEY[item.key];
      return me
        ? <div className="h-full max-w-[62%] aspect-[5/7]"><UserCardSvg me={me} equippedOverride={{ ...(me.equipped || {}), frame: item.key }} still className="shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]" /></div>
        : <Swatch {...p} />;
    }
    case 'banner': {
      const p = PACK_BY_KEY[item.key];
      return (
        <div className="w-[86%] aspect-[3/1] rounded-lg p-[2px]" style={{ background: foil(p.a, p.b, p.c, p.d) }}>
          <div className="w-full h-full rounded-md hero-dot-grid" style={{ background: `linear-gradient(120deg, ${p.base}, #0b0b12)` }} />
        </div>
      );
    }
    case 'ring': {
      const r = RINGS[item.key];
      return (
        <div className="w-[48cqw] h-[48cqw] rounded-full p-[4cqw]" style={{ background: `conic-gradient(from 20deg, ${r.a}, ${r.b}, ${r.a})` }}>
          <div className="w-full h-full rounded-full bg-[#1a1a24] flex items-center justify-center text-[16cqw] font-black text-white">
            {(me?.handle || 'S').slice(0, 1).toUpperCase()}
          </div>
        </div>
      );
    }
    case 'title':
      return <p className="px-[6cqw] text-center text-[12cqw] font-black leading-tight text-white text-balance">“{TITLES[item.key]?.name}”</p>;
    case 'xp':
    case 'dupe':
      return (
        <div className="text-center">
          <p className="text-[22cqw] font-black tracking-tight text-white tabular-nums leading-none">+{(item.amount || 0).toLocaleString('en-US')}</p>
          <p className="mt-[2cqw] text-[6cqw] font-black tracking-[0.3em] text-white/70">XP</p>
        </div>
      );
    case 'freeze': return <Snowflake className="w-[34cqw] h-[34cqw] text-sky-200" strokeWidth={1.5} />;
    case 'showcase': return <LayoutGrid className="w-[34cqw] h-[34cqw] text-emerald-200" strokeWidth={1.5} />;
    case 'shiny': return <Sparkles className="w-[34cqw] h-[34cqw] text-fuchsia-200" strokeWidth={1.5} />;
    case 'voucher':
      return (
        <div className="w-[74%] rounded-[5cqw] bg-gradient-to-br from-amber-300 via-amber-200 to-amber-400 p-[5cqw] text-neutral-950 text-center rotate-[-4deg] shadow-[0_12px_24px_-12px_rgba(0,0,0,0.9)]">
          <Ticket className="w-[14cqw] h-[14cqw] mx-auto" />
          <p className="mt-[1cqw] text-[6cqw] font-black uppercase tracking-[0.16em]">Featured</p>
          <p className="text-[12cqw] font-black leading-none">1 month</p>
        </div>
      );
    default: return <Zap className="w-[30cqw] h-[30cqw] text-white" />;
  }
}

/** The face of a pulled item: rarity-colored foil edge, visual, name. */
export function ItemFace({ item, me, className = '' }) {
  const r = RARITY[item.rarity] || RARITY.common;
  const kindLabel = item.kind === 'dupe' ? 'Duplicate' : r.label;
  return (
    <div
      className={`relative w-full aspect-[5/7] ${CARD_RADIUS} p-[3%] overflow-hidden [container-type:inline-size] ${className}`}
      style={{ background: `linear-gradient(140deg, ${r.a}, #ffffff 22%, ${r.b} 45%, ${r.a} 70%, ${r.b})` }}
    >
      <div className="relative w-full h-full rounded-[5%/3.6%] bg-[#0B0B12] flex flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid opacity-60" />
        <div className="relative flex items-center justify-between px-[6cqw] pt-[6cqw]">
          <span className="inline-flex items-center gap-[1.5cqw] rounded-full px-[4cqw] py-[1cqw] text-[5.2cqw] font-black uppercase tracking-[0.14em]" style={{ color: r.a, background: `${r.a}22`, boxShadow: `inset 0 0 0 1px ${r.a}88` }}>
            {item.kind === 'dupe' ? <Copy className="w-[5cqw] h-[5cqw]" /> : null}{kindLabel}
          </span>
          <svg viewBox="0 0 100 100" className="w-[10cqw] h-[10cqw] opacity-80" dangerouslySetInnerHTML={{ __html: markBarsInner('if') }} />
        </div>
        <div className="relative flex-1 min-h-0 flex items-center justify-center py-[4cqw]">
          <Visual item={item} me={me} />
        </div>
        <div className="relative px-[6cqw] pb-[7cqw] text-center">
          <p className="text-[7.6cqw] font-extrabold text-white leading-tight text-balance">{itemName(item)}</p>
          <p className="mt-[1.5cqw] text-[5.8cqw] font-medium text-white/70 leading-snug text-balance line-clamp-3">{itemBlurb(item)}</p>
        </div>
      </div>
    </div>
  );
}
