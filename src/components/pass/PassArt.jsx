// Inline renders of the ShinyPass SVG art (user card, pack) and the face of
// each item you can pull. The SVG strings come from pure renderers in
// src/lib; everything user-controlled in them is escaped there.
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Snowflake, LayoutGrid, Sparkles, Zap, Ticket, Copy } from 'lucide-react';
import { renderUserCard } from '../../lib/userCard';
import { renderPack, renderBanner } from '../../lib/packArt';
import { PACK_BY_KEY, RINGS, TITLES, STICKERS, NAME_EFFECTS, CARD_BACKS, FLAIRS, itemName, itemBlurb } from '../../lib/shinyPass';
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

/**
 * Pause an animated inline SVG's SMIL clock while it's off screen, so a page
 * of cards and packs only animates what you can see.
 */
function usePauseOffscreen(ref, animated) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !animated || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      const svg = el.querySelector('svg');
      if (!svg?.pauseAnimations) return;
      if (e.isIntersecting) svg.unpauseAnimations(); else svg.pauseAnimations();
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, animated]);
}

export const UserCardSvg = memo(function UserCardSvg({ me, className = '', equippedOverride, still = false }) {
  const uid = uidOf(useId());
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const quiet = still || !!reduce;
  const eq = equippedOverride || me?.equipped;
  const eqKey = JSON.stringify(eq || {});
  // Built once per real change: hover previews and parent re-renders reuse it.
  const html = useMemo(() => (me ? renderUserCard({
    uid,
    handle: me.handle || 'you',
    avatar: me.avatar,
    level: me.level,
    into: me.into,
    need: me.need,
    xp: me.xp,
    streak: me.streak,
    season: me.seasonNumber,
    equipped: JSON.parse(eqKey),
    still: quiet,
  }) : ''), [uid, me?.handle, me?.avatar, me?.level, me?.into, me?.need, me?.xp, me?.streak, me?.seasonNumber, eqKey, quiet]); // eslint-disable-line react-hooks/exhaustive-deps
  usePauseOffscreen(ref, !quiet);
  if (!me) return null;
  return <div ref={ref} className={`${CARD_RADIUS} overflow-hidden [&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

export const PackSvg = memo(function PackSvg({ pack, locked = false, still = false, season, className = '' }) {
  const uid = uidOf(useId());
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const quiet = still || !!reduce;
  const html = useMemo(() => renderPack(pack, { uid: `${pack.key}${uid}`, locked, still: quiet, season }), [pack, uid, locked, quiet, season]);
  usePauseOffscreen(ref, !quiet);
  return <div ref={ref} className={`[&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

/** A pack-material banner (see renderBanner). Fills its box. */
export const BannerSvg = memo(function BannerSvg({ pack, still = false, className = '' }) {
  const uid = uidOf(useId());
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const quiet = still || !!reduce;
  const html = useMemo(() => renderBanner(pack, { uid: `${pack.key}${uid}`, still: quiet }), [pack, uid, quiet]);
  usePauseOffscreen(ref, !quiet);
  return <div ref={ref} className={`[&>svg]:block [&>svg]:w-full [&>svg]:h-full ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

const foil = (a, b, c, d) => `linear-gradient(135deg, ${a}, ${b} 30%, ${d || c} 55%, ${c} 75%, ${a})`;

function Swatch({ a, b, c, d }) {
  return (
    <div className="w-[44cqw] aspect-[5/7] rounded-lg p-[3px] rotate-[-6deg]" style={{ background: foil(a, b, c, d) }}>
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
        ? <div className="w-[46cqw]"><UserCardSvg me={me} equippedOverride={{ ...(me.equipped || {}), frame: item.key }} still className="shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]" /></div>
        : <Swatch {...p} />;
    }
    case 'banner': {
      const p = PACK_BY_KEY[item.key];
      return <div className="w-[86%] h-[30cqw] rounded-[3cqw] overflow-hidden border-2" style={{ borderColor: p.a }}><BannerSvg pack={p} still className="w-full h-full" /></div>;
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
    case 'sticker': {
      const s = STICKERS[item.key];
      return s ? <span className="sp-sticker text-[13cqw]" style={{ '--st-a': s.a, '--st-t': s.t }}>{s.name}</span> : null;
    }
    case 'name': {
      const n = NAME_EFFECTS[item.key];
      return n ? <span className="sp-name-fx font-arena italic font-black text-[20cqw] leading-none" style={{ backgroundImage: `linear-gradient(100deg, ${n.stops[0]}, ${n.stops[1]} 50%, ${n.stops[2]})` }}>Aa</span> : null;
    }
    case 'back': {
      const b = CARD_BACKS[item.key] || CARD_BACKS.carbon;
      return (
        <div className="sp-cardback w-[46cqw]" style={{ '--cb-a': b.a, '--cb-b': b.b, '--cb-l': b.line }}>
          <svg viewBox="0 0 100 100" className="w-[46%]" dangerouslySetInnerHTML={{ __html: markBarsInner('ib') }} />
        </div>
      );
    }
    case 'effect':
      return me
        ? <div className="w-[46cqw]"><UserCardSvg me={me} equippedOverride={{ ...(me.equipped || {}), effect: item.key }} className="shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]" /></div>
        : <Sparkles className="w-[34cqw] h-[34cqw] text-fuchsia-200" strokeWidth={1.5} />;
    case 'flair': {
      const f = FLAIRS[item.key];
      return f ? (
        <span className={`inline-flex rounded-[2cqw] px-[4cqw] py-[1.5cqw] text-[11cqw] font-bold ${f.anim ? 'sp-flair-anim' : ''}`} style={{ background: f.bg, color: f.fg, border: `2px solid ${f.edge}` }}>
          {me?.handle || 'you'}
        </span>
      ) : null;
    }
    case 'boost': return <Zap className="w-[34cqw] h-[34cqw] text-emerald-200" strokeWidth={1.5} />;
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
    // Height comes from a 140% spacer, not aspect-ratio + h-full: WebKit
    // (iPhone Safari, DuckDuckGo) let the content stretch the old box and
    // clipped the card's bottom edge.
    <div
      className={`relative w-full ${CARD_RADIUS} overflow-hidden [container-type:inline-size] ${className}`}
      style={{ background: `linear-gradient(140deg, ${r.a}, #ffffff 22%, ${r.b} 45%, ${r.a} 70%, ${r.b})` }}
    >
      <div aria-hidden="true" style={{ paddingTop: '140%' }} />
      <div className="absolute inset-[3cqw] rounded-[5%/3.6%] bg-[#0B0B12] flex flex-col overflow-hidden">
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
