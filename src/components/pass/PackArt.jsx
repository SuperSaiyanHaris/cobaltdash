// A season pack, drawn as a foil pouch: crimped top and bottom, an illustrated
// world per pack (CSS only, see packArtHtml.js), an extruded level number and
// a name plate. Sizes use container query units, so the pack scales with the
// width of whatever box holds it. With `tilt` it leans toward the cursor and a
// holo layer follows it; `idle` lets the holo layer drift on its own (use it
// on one hero pack at a time).
import { memo, useState } from 'react';
import { PACK_ART } from './packArtHtml';

const INFO = {
  cardstock: { level: 10, name: 'Cardstock', num: '#F5B942', ext: '#7A4B12', ink: '#3B3222', sealInk: '#3B3222', seal: 'linear-gradient(90deg,#BFAE89,#F3EBDA,#BFAE89)', holo: 0.08 },
  chrome: { level: 20, name: 'Chrome', num: '#FFFFFF', ext: '#4E5866', ink: '#C9D1DB', sealInk: '#1B2129', seal: 'linear-gradient(90deg,#5E6977,#F1F4F8,#5E6977)', holo: 0.22 },
  holo: { level: 30, name: 'Holo', num: '#FFFFFF', ext: '#6D28D9', ink: '#231A3D', sealInk: '#231A3D', seal: 'linear-gradient(90deg,#B69CFF,#F5F3FF,#7DD3FF)', holo: 0.55 },
  cosmic: { level: 40, name: 'Cosmic', num: '#C4B5FD', ext: '#312E81', ink: '#E9E3FF', sealInk: '#FFFFFF', seal: 'linear-gradient(90deg,#231660,#8B7BFF,#231660)', holo: 0.3 },
  prism: { level: 50, name: 'Prism', num: '#FFFFFF', ext: '#9D174D', ink: '#3B1747', sealInk: '#3B1747', seal: 'linear-gradient(90deg,#F0ABFC,#FFFFFF,#67E8F9)', holo: 0.4 },
  crystal: { level: 60, name: 'Crystal', num: '#7DD3FC', ext: '#0C4A6E', ink: '#0C3550', sealInk: '#0C3550', seal: 'linear-gradient(90deg,#6FB8DD,#F4FCFF,#6FB8DD)', holo: 0.35 },
  obsidian: { level: 70, name: 'Obsidian', num: '#FB923C', ext: '#7C2D12', ink: '#FDBA74', sealInk: '#FDBA74', seal: 'linear-gradient(90deg,#09090B,#3F3F46,#09090B)', holo: 0.18 },
  platinum: { level: 80, name: 'Platinum', num: '#FFFFFF', ext: '#6B7280', ink: '#2A303A', sealInk: '#2A303A', seal: 'linear-gradient(90deg,#9AA3B2,#FFFFFF,#9AA3B2)', holo: 0.3 },
  mythic: { level: 90, name: 'Mythic', num: '#F0ABFC', ext: '#4A044E', ink: '#F5D0FE', sealInk: '#FFFFFF', seal: 'linear-gradient(90deg,#4A044E,#C026D3,#083344)', holo: 0.45 },
  final: { level: 99, name: 'The Final Pull', num: '#FFFFFF', ext: '#7C3AED', ink: '#E9C46A', sealInk: '#0A0A0F', seal: 'linear-gradient(90deg,#5B4208,#F5DC8F,#5B4208)', holo: 0.5 },
};

// Accent color and one-line mood per pack, for the screens around the art.
export const PACK_META = {
  cardstock: { accent: '#D9A22C', tag: 'Letterpress on kraft. Where every collection starts.' },
  chrome: { accent: '#6B7684', tag: 'Liquid metal rising over a midnight horizon.' },
  holo: { accent: '#FF7AD9', tag: 'Oil-slick foil that shifts every time you move.' },
  cosmic: { accent: '#7C3AED', tag: 'A ringed world adrift in violet nebula.' },
  prism: { accent: '#F472B6', tag: 'Kaleidoscope glass, cut twelve ways.' },
  crystal: { accent: '#0EA5E9', tag: 'A flawless gem pulled from the glacier.' },
  obsidian: { accent: '#EA580C', tag: 'Black glass, split open by magma.' },
  platinum: { accent: '#A8894F', tag: 'An art deco sunrise in polished platinum.' },
  mythic: { accent: '#C026D3', tag: 'A rune circle that never stops turning.' },
  final: { accent: '#7C3AED', tag: 'Ultraviolet and gold. The last pull of the season.' },
};

const MASK ='linear-gradient(#000 0 0) 0 50%/100% calc(100% - 4.4cqw) no-repeat,conic-gradient(from 135deg at 50% 0,#000 90deg,#0000 0) 0 0/5cqw 2.5cqw repeat-x,conic-gradient(from -45deg at 50% 100%,#000 90deg,#0000 0) 0 100%/5cqw 2.5cqw repeat-x';
const SHADE = 'linear-gradient(90deg,rgba(0,0,0,.38),rgba(0,0,0,0) 7%,rgba(255,255,255,.24) 11%,rgba(255,255,255,0) 18%,rgba(255,255,255,0) 80%,rgba(255,255,255,.14) 88%,rgba(0,0,0,0) 92%,rgba(0,0,0,.42)),radial-gradient(120% 80% at 50% 45%,rgba(0,0,0,0) 60%,rgba(0,0,0,.28))';
const RIDGE = 'repeating-linear-gradient(90deg,rgba(255,255,255,.38) 0 .5cqw,rgba(0,0,0,.16) .5cqw 1.5cqw)';
const FILL = { position: 'absolute', inset: 0 };

// The illustration never changes, so it renders once per pack.
const Art = memo(function Art({ k }) {
  return <div style={FILL} dangerouslySetInnerHTML={{ __html: PACK_ART[k] }} />;
});

function PackArt({ packKey, season = 1, tilt = false, idle = false, locked = false, shadow = true, className = '' }) {
  const k = INFO[packKey] ? packKey : 'holo';
  const d = INFO[k];
  const [s, setS] = useState({ rx: 0, ry: 0, gx: 50, gy: 30, h: false });
  const onMove = tilt ? (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setS({ rx: (0.5 - py) * 22, ry: (px - 0.5) * 26, gx: px * 100, gy: py * 100, h: true });
  } : undefined;
  const onLeave = tilt ? () => setS({ rx: 0, ry: 0, gx: 50, gy: 30, h: false }) : undefined;
  return (
    <div
      className={`pk ${locked ? 'pk-locked' : ''} ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ position: 'relative', width: '100%', aspectRatio: '220/352', containerType: 'inline-size', perspective: 900 }}
    >
      <div
        style={{
          ...FILL,
          transform: `rotateX(${s.rx}deg) rotateY(${s.ry}deg) scale(${s.h ? 1.03 : 1})`,
          transition: s.h ? 'transform .08s linear' : 'transform .5s cubic-bezier(.2,.8,.2,1)',
          filter: shadow ? 'drop-shadow(0 4cqw 5cqw rgba(20,18,30,.28)) drop-shadow(0 1cqw 1.2cqw rgba(20,18,30,.18))' : undefined,
        }}
      >
        <div style={{ ...FILL, overflow: 'hidden', background: '#111', WebkitMask: MASK, mask: MASK }}>
          <Art k={k} />
          <div style={{ ...FILL, background: SHADE, pointerEvents: 'none' }} />
          <div
            style={{
              ...FILL,
              background: 'repeating-linear-gradient(110deg,#ff7ad9 0%,#ffe27a 6%,#7df9ff 12%,#b69cff 18%,#ff7ad9 24%)',
              backgroundSize: '400% 400%',
              backgroundPosition: `${s.gx}% ${s.gy}%`,
              animation: idle && !s.h ? 'pk-holo 7s ease-in-out infinite' : 'none',
              mixBlendMode: 'color-dodge',
              opacity: s.h ? Math.min(0.9, d.holo * 1.5) : d.holo,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              ...FILL,
              background: `radial-gradient(circle at ${s.gx}% ${s.gy}%, rgba(255,255,255,.75), rgba(255,255,255,0) 45%)`,
              mixBlendMode: 'overlay',
              opacity: s.h ? 1 : 0.35,
              transition: 'opacity .3s',
              pointerEvents: 'none',
            }}
          />
          {/* Top seal */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '9%', background: `${RIDGE},${d.seal}`, boxShadow: '0 .7cqw 0 rgba(0,0,0,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.6cqw', paddingTop: '1.4cqw', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.5cqw' }}>
              <div style={{ width: '1.1cqw', height: '2.2cqw', borderRadius: '.4cqw', background: d.sealInk }} />
              <div style={{ width: '1.1cqw', height: '3.4cqw', borderRadius: '.4cqw', background: d.sealInk }} />
              <div style={{ width: '1.1cqw', height: '1.7cqw', borderRadius: '.4cqw', background: d.sealInk }} />
            </div>
            <div style={{ font: '800 3.4cqw Manrope,sans-serif', letterSpacing: '.22em', color: d.sealInk }}>SHINYPULL</div>
          </div>
          <div style={{ position: 'absolute', left: '4%', right: '4%', top: '10.6%', borderTop: `.5cqw dashed ${d.ink}`, opacity: 0.45 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '11.8%', textAlign: 'center', font: '800 3cqw Manrope,sans-serif', letterSpacing: '.26em', color: d.ink }}>SHINYPASS · SEASON {season}</div>
          {/* Level number and name plate */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: '16%', textAlign: 'center', font: "italic 900 38cqw/.8 'Barlow Condensed','Arial Narrow',Impact,sans-serif", letterSpacing: '-.5cqw', color: d.num, WebkitTextStroke: '1.6cqw #0B0B0F', paintOrder: 'stroke fill', textShadow: `.8cqw 1cqw 0 ${d.ext}, 1.6cqw 2cqw 0 ${d.ext}, 2.4cqw 3cqw 0 #0B0B0F` }}>{d.level}</div>
          <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '7.5%', height: '8.5%', background: '#0B0B0F', transform: 'skewX(-10deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `.9cqw solid ${d.num}` }}>
            <div style={{ transform: 'skewX(10deg)', font: `italic 900 ${d.name.length > 10 ? '7cqw' : '9cqw'}/1 'Barlow Condensed','Arial Narrow',Impact,sans-serif`, letterSpacing: '.08em', color: '#fff', whiteSpace: 'nowrap' }}>{d.name.toUpperCase()}</div>
          </div>
          {/* Bottom seal */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '5.5%', background: `${RIDGE},${d.seal}`, boxShadow: '0 -.7cqw 0 rgba(0,0,0,.22)' }} />
        </div>
      </div>
    </div>
  );
}

export default memo(PackArt);
