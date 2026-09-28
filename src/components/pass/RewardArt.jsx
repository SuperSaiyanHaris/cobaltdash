// Artwork for ShinyPass rewards: small bold glyphs for the tier tiles, and
// a large preview of what each reward actually looks like (the sticker, the
// name effect, the card back, the pack, your card at its new rarity).
import { PACK_BY_KEY, STICKERS, NAME_EFFECTS, CARD_BACKS, RINGS, TITLES } from '../../lib/shinyPass';
import { markBarsInner } from '../../lib/brandMark';
import { PackSvg, UserCardSvg, BannerSvg } from './PassArt';

export const RARITY_COLORS = {
  common:    { a: '#A1A1AA', b: '#52525B', text: '#E4E4E7' },
  uncommon:  { a: '#34D399', b: '#047857', text: '#A7F3D0' },
  rare:      { a: '#5EC8FF', b: '#0369A1', text: '#BAE6FD' },
  epic:      { a: '#C084FC', b: '#6D28D9', text: '#E9D5FF' },
  legendary: { a: '#FFD76A', b: '#B45309', text: '#FEF3C7' },
};

const G = {
  pack: (c) => <><path d="M14 8h36l-3 4 3 4v36l-3 4 3 4H14l3-4-3-4V16l3-4z" fill={c} /><path d="M14 16h36" stroke="#0a0a0f" strokeWidth="3" strokeDasharray="4 3" /><rect x="24" y="30" width="5" height="12" rx="1.5" fill="#0a0a0f" /><rect x="30.5" y="25" width="5" height="17" rx="1.5" fill="#0a0a0f" /><rect x="37" y="20" width="5" height="22" rx="1.5" fill="#0a0a0f" /></>,
  frame: (c) => <><rect x="14" y="6" width="36" height="52" rx="5" fill={c} /><rect x="19" y="11" width="26" height="42" rx="3" fill="#0a0a0f" /><circle cx="32" cy="26" r="7" fill={c} /><rect x="23" y="38" width="18" height="4" rx="2" fill={c} /></>,
  ring: (c) => <><circle cx="32" cy="32" r="22" fill="none" stroke={c} strokeWidth="8" /><circle cx="32" cy="32" r="13" fill="#fff" opacity=".9" /><circle cx="32" cy="28" r="5" fill="#0a0a0f" /><path d="M23 41c3-5 15-5 18 0" fill="#0a0a0f" /></>,
  title: (c) => <><rect x="6" y="20" width="52" height="24" rx="5" fill={c} /><path d="M14 28h36M14 36h24" stroke="#0a0a0f" strokeWidth="4" strokeLinecap="round" /></>,
  banner: (c) => <><path d="M8 14h48v28L32 54 8 42z" fill={c} /><path d="M8 22h48" stroke="#0a0a0f" strokeWidth="3" /></>,
  sticker: (c) => <><path d="M32 6l7 14 15 2-11 11 3 15-14-7-14 7 3-15L10 22l15-2z" fill={c} /><circle cx="27" cy="28" r="2.5" fill="#0a0a0f" /><circle cx="37" cy="28" r="2.5" fill="#0a0a0f" /><path d="M26 35c3 3 9 3 12 0" stroke="#0a0a0f" strokeWidth="3" fill="none" strokeLinecap="round" /></>,
  name: (c) => <><text x="32" y="40" textAnchor="middle" fontFamily="'Barlow Condensed',Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="28" fill={c}>Aa</text><path d="M10 48h44" stroke={c} strokeWidth="4" strokeLinecap="round" /><path d="M50 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" /></>,
  back: (c) => <><rect x="14" y="6" width="36" height="52" rx="5" fill={c} /><path d="M14 20l36 24M14 32l36 24M14 8l36 24" stroke="#0a0a0f" strokeWidth="3" opacity=".5" /><rect x="26" y="26" width="12" height="12" rx="2" fill="#0a0a0f" /></>,
  freeze: (c) => <g stroke={c} strokeWidth="5" strokeLinecap="round" fill="none"><path d="M32 6v52M9 19l46 26M9 45l46-26" /><path d="M26 10l6 6 6-6M26 54l6-6 6 6" /></g>,
  boost: (c) => <path d="M36 4L12 36h16l-4 24 26-34H34z" fill={c} />,
  xp: (c) => <path d="M36 4L12 36h16l-4 24 26-34H34z" fill={c} />,
  dupe: (c) => <path d="M36 4L12 36h16l-4 24 26-34H34z" fill={c} />,
  tier: (c) => <><path d="M32 4l24 10v18c0 14-10 24-24 28C18 56 8 46 8 32V14z" fill={c} /><path d="M32 16l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#0a0a0f" /></>,
  voucher: (c) => <><path d="M6 18h52v8a6 6 0 000 12v8H6v-8a6 6 0 000-12z" fill={c} /><path d="M40 18v28" stroke="#0a0a0f" strokeWidth="3" strokeDasharray="3 3" /><path d="M18 32l4 4 8-9" stroke="#0a0a0f" strokeWidth="4" fill="none" strokeLinecap="round" /></>,
  showcase: (c) => <><rect x="8" y="10" width="20" height="20" rx="3" fill={c} /><rect x="36" y="10" width="20" height="20" rx="3" fill={c} /><rect x="8" y="36" width="20" height="20" rx="3" fill={c} /><rect x="36" y="36" width="20" height="20" rx="3" fill={c} opacity=".5" /></>,
  shiny: (c) => <><path d="M32 4l6 20 20 8-20 8-6 20-6-20-20-8 20-8z" fill={c} /></>,
  effect: (c) => <><rect x="14" y="6" width="36" height="52" rx="5" fill={c} /><rect x="19" y="11" width="26" height="42" rx="3" fill="#0a0a0f" /><path d="M32 18l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={c} /><circle cx="24" cy="46" r="2" fill={c} /><circle cx="40" cy="44" r="1.5" fill={c} /></>,
  flair: (c) => <><rect x="6" y="20" width="52" height="24" rx="6" fill={c} /><text x="32" y="38" textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontWeight="900" fontSize="14" fill="#0a0a0f">you</text></>,
};

/** Small bold glyph for a reward kind. */
export function RewardGlyph({ kind, color = '#fff', className = 'w-full h-full' }) {
  const draw = G[kind] || G.sticker;
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true">{draw(color)}</svg>;
}

export function StickerArt({ k, className = '' }) {
  const s = STICKERS[k];
  if (!s) return null;
  return (
    <span className={`sp-sticker ${className}`} style={{ '--st-a': s.a, '--st-t': s.t }}>
      {s.name}
    </span>
  );
}

export function NameEffectText({ k, children, className = '' }) {
  const n = NAME_EFFECTS[k];
  if (!n) return <span className={className}>{children}</span>;
  return <span className={`sp-name-fx anim ${className}`} style={{ backgroundImage: `linear-gradient(100deg, ${n.stops[0]}, ${n.stops[1]} 50%, ${n.stops[2]})` }}>{children}</span>;
}

export function CardBackArt({ k, className = '' }) {
  const b = CARD_BACKS[k] || CARD_BACKS.carbon;
  return (
    <div className={`sp-cardback ${className}`} style={{ '--cb-a': b.a, '--cb-b': b.b, '--cb-l': b.line }}>
      <svg viewBox="0 0 100 100" className="w-[46%]" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markBarsInner(`cb${k}`) }} />
    </div>
  );
}

/**
 * Large preview of a reward: the real thing where it can be shown (a pack,
 * your card at a new tier, a sticker, a name effect, a card back), a glyph
 * otherwise.
 */
export function RewardVisual({ reward, me }) {
  const rc = RARITY_COLORS[reward.rarity] || RARITY_COLORS.common;
  switch (reward.kind) {
    case 'pack': {
      const p = PACK_BY_KEY[reward.key];
      return p ? <PackSvg pack={p} season={me?.seasonNumber} className="sp-fit-pack drop-shadow-[0_22px_28px_rgba(0,0,0,0.75)]" /> : null;
    }
    case 'tier':
      return me ? <UserCardSvg me={{ ...me, level: reward.level, into: 0, need: 1 }} className="sp-fit-card shadow-[0_22px_40px_-14px_rgba(0,0,0,0.9)]" /> : <RewardGlyph kind="tier" color={rc.a} className="w-1/2" />;
    case 'sticker':
      return <StickerArt k={reward.key} className="text-[clamp(26px,5vw,44px)]" />;
    case 'name':
      return <NameEffectText k={reward.key} className="font-arena italic font-black text-[clamp(38px,7vw,64px)] leading-none">@{me?.handle && me.handle !== 'you' ? me.handle : 'yourname'}</NameEffectText>;
    case 'back':
      return <CardBackArt k={reward.key} className="w-[42%] max-w-[150px]" />;
    case 'ring': {
      const r = RINGS[reward.key];
      return (
        <span className="block w-[44%] max-w-[170px] aspect-square rounded-full p-[7%]" style={{ background: `conic-gradient(from 20deg, ${r.a}, ${r.b}, ${r.a})` }}>
          <span className="flex w-full h-full rounded-full bg-[#1a1a24] items-center justify-center font-arena italic font-black text-white text-[clamp(34px,6vw,60px)]">
            {(me?.handle || 'S').slice(0, 1).toUpperCase()}
          </span>
        </span>
      );
    }
    case 'title':
      return <span className="font-arena italic font-black uppercase text-white text-[clamp(30px,6vw,56px)] leading-[.95] text-center px-4 text-balance">“{TITLES[reward.key]?.name}”</span>;
    case 'banner': {
      const p = PACK_BY_KEY[reward.key];
      return <span className="block w-[82%] aspect-[3/1] rounded-xl border-2 overflow-hidden" style={{ borderColor: p.a }}><BannerSvg pack={p} className="w-full h-full" /></span>;
    }
    default:
      return <RewardGlyph kind={reward.kind} color={rc.a} className="w-[46%] max-w-[180px]" />;
  }
}
