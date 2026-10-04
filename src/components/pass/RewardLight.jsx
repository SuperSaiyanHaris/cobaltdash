// Reward artwork for the light ShinyPass screens: each reward drawn as the
// small object it is (a sticker, a ring, a name plate, a card back, a banner,
// a pack...). Built from the same catalogs the locker uses, so what you see
// on the road is what you equip.
import { memo } from 'react';
import { PACK_BY_KEY, STICKERS, NAME_EFFECTS, CARD_BACKS, RINGS, TITLES } from '../../lib/shinyPass';
import PackArt from './PackArt';

export const RARITY_HEX = { common: '#77747F', uncommon: '#1F8F63', rare: '#1F6FEB', epic: '#8E5FD9', legendary: '#B7871F' };
export const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
export const KIND_LABEL = { sticker: 'Sticker', title: 'Title', ring: 'Avatar ring', name: 'Name effect', back: 'Card back', banner: 'Banner', freeze: 'Freeze', boost: 'XP Boost', tier: 'Upgrade', pack: 'Season pack', frame: 'Card frame' };
export const TIER_HEX = { RARE: '#1F6FEB', EPIC: '#8E5FD9', LEGENDARY: '#D9A22C' };

export const ringBg = (k) => { const r = RINGS[k] || RINGS.silver; return `conic-gradient(from 210deg, ${r.a}, ${r.b}, ${r.a})`; };
export const nameBg = (k) => { const n = NAME_EFFECTS[k] || NAME_EFFECTS.chrome; return `linear-gradient(90deg, ${n.stops.join(', ')})`; };
export const backBg = (k) => { const b = CARD_BACKS[k] || CARD_BACKS.carbon; return `repeating-linear-gradient(45deg, ${b.line}66 0 2px, transparent 2px 9px), linear-gradient(160deg, ${b.a}, ${b.b})`; };
export const bannerBg = (k) => { const p = PACK_BY_KEY[k] || PACK_BY_KEY.cardstock; return `linear-gradient(120deg, ${p.c}, ${p.d} 50%, ${p.a})`; };

const BARS = (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, padding: 5, borderRadius: 6, background: 'rgba(0,0,0,.35)' }}>
    <div style={{ width: 3, height: 7, borderRadius: 1, background: '#fff' }} />
    <div style={{ width: 3, height: 11, borderRadius: 1, background: '#fff' }} />
    <div style={{ width: 3, height: 5, borderRadius: 1, background: '#fff' }} />
  </div>
);

function Body({ reward }) {
  const { kind, key } = reward;
  switch (kind) {
    case 'sticker': {
      const s = STICKERS[key];
      if (!s) return null;
      return <div style={{ padding: '6px 12px', borderRadius: 11, border: '3px solid #fff', background: s.a, color: s.t, font: "italic 900 " + (s.name.length > 8 ? 13 : 17) + "px/1 'Barlow Condensed','Arial Narrow',sans-serif", letterSpacing: '.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', transform: 'rotate(-7deg)', boxShadow: '0 4px 10px rgba(20,18,30,.18),0 0 0 1px rgba(20,18,30,.08)' }}>{s.name}</div>;
    }
    case 'title':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{ font: '800 8px Manrope,sans-serif', letterSpacing: '.2em', color: '#8a8790' }}>TITLE</div>
          <div style={{ maxWidth: 92, padding: '7px 9px', borderRadius: 7, background: '#16151A', color: '#fff', font: '800 10px/1.15 Manrope,sans-serif', letterSpacing: '.08em', textTransform: 'uppercase', textAlign: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12),0 3px 8px rgba(20,18,30,.15)' }}>{TITLES[key]?.name}</div>
        </div>
      );
    case 'ring':
      return (
        <div style={{ width: 60, height: 60, borderRadius: '50%', padding: 5, boxSizing: 'border-box', background: ringBg(key), boxShadow: '0 4px 12px rgba(20,18,30,.18)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2.5px solid #fff', boxSizing: 'border-box', background: '#6D4AFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px Manrope,sans-serif' }}>SH</div>
        </div>
      );
    case 'name':
      return (
        <div style={{ padding: '7px 11px', borderRadius: 10, background: '#16151A', boxShadow: '0 3px 8px rgba(20,18,30,.18)' }}>
          <div style={{ font: "italic 900 21px/1 'Barlow Condensed','Arial Narrow',sans-serif", backgroundImage: nameBg(key), WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', whiteSpace: 'nowrap' }}>@shiny</div>
        </div>
      );
    case 'back':
      return <div style={{ width: 48, height: 68, borderRadius: 7, border: '2.5px solid #16151A', background: backBg(key), transform: 'rotate(7deg)', boxShadow: '0 5px 12px rgba(20,18,30,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{BARS}</div>;
    case 'banner': {
      const p = PACK_BY_KEY[key];
      return (
        <div style={{ width: 92, height: 48, borderRadius: 9, background: bannerBg(key), position: 'relative', overflow: 'hidden', boxShadow: '0 4px 10px rgba(20,18,30,.16),inset 0 0 0 1px rgba(20,18,30,.08)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(115deg,rgba(255,255,255,.25) 0 2px,rgba(255,255,255,0) 2px 9px)' }} />
          <div style={{ position: 'absolute', left: 6, bottom: 6, padding: '2px 6px', borderRadius: 4, background: '#16151A', color: '#fff', font: "italic 900 10px/1.1 'Barlow Condensed',sans-serif", letterSpacing: '.06em' }}>{(p?.name || '').toUpperCase()}</div>
        </div>
      );
    }
    case 'freeze': {
      const bar = { position: 'absolute', left: '50%', top: '50%', width: 30, height: 3.5, margin: '-1.75px 0 0 -15px', borderRadius: 2, background: '#fff' };
      return (
        <div style={{ width: 58, height: 58, borderRadius: '50%', border: '3px solid #fff', background: 'radial-gradient(circle at 35% 30%,#F0FDFF,#7DD3FC 55%,#0369A1)', boxShadow: '0 4px 12px rgba(3,105,161,.3)', position: 'relative' }}>
          <div style={bar} /><div style={{ ...bar, transform: 'rotate(60deg)' }} /><div style={{ ...bar, transform: 'rotate(-60deg)' }} />
        </div>
      );
    }
    case 'boost':
      return (
        <div style={{ width: 58, height: 58, borderRadius: '50%', border: '3px solid #fff', background: 'radial-gradient(circle at 35% 30%,#ECFCCB,#4ADE80 55%,#15803D)', boxShadow: '0 4px 12px rgba(21,128,61,.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <div style={{ font: "italic 900 17px/1 'Barlow Condensed',sans-serif", textShadow: '0 1px 0 rgba(0,0,0,.25)' }}>+25%</div>
          <div style={{ font: '800 7.5px Manrope,sans-serif', letterSpacing: '.14em' }}>XP · 3D</div>
        </div>
      );
    case 'tier': {
      const c = TIER_HEX[key] || '#1F6FEB';
      return (
        <div style={{ width: 52, height: 72, borderRadius: 8, border: `3.5px solid ${c}`, background: 'linear-gradient(160deg,#fff,#EEEEF2)', boxShadow: '0 5px 14px rgba(20,18,30,.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, transform: 'rotate(-5deg)' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#6D4AFF', boxShadow: `0 0 0 2px ${c}` }} />
          <div style={{ padding: '1px 4px', borderRadius: 3, background: c, color: '#fff', font: "italic 900 8.5px/1.2 'Barlow Condensed',sans-serif", letterSpacing: '.06em' }}>{key}</div>
        </div>
      );
    }
    case 'pack':
      return <div style={{ width: 50 }}><PackArt packKey={key} shadow={false} /></div>;
    default:
      return null;
  }
}

/** One reward as a small object on a 96 x 84 stage; `scale` enlarges it. */
function RewardLight({ reward, scale = 1, className = '' }) {
  const isPack = reward.kind === 'pack';
  const w = 96 * scale;
  const h = (isPack ? 80 : 84) * scale;
  return (
    <div className={className} style={{ width: w, height: h, position: 'relative', flex: 'none' }}>
      <div style={{ width: 96, height: isPack ? 80 : 84, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <Body reward={reward} />
      </div>
    </div>
  );
}

export default memo(RewardLight);
