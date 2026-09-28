// ShinyPass pack artwork as an inline SVG string. Every pack (PACKS in
// src/lib/shinyPass.js) is a crimped foil pouch with its own printed
// material (cardstock, brushed chrome, holo foil, a nebula, gem facets, ice
// crystals, lava cracks, art deco platinum, a rune circle, gold filigree),
// pillow shading so it reads as a 3D pouch, an embossed level number and a
// black name band. Higher packs carry more motion. SMIL only: no filters,
// blurs or glows, so dozens of packs on one page stay cheap.

import { escapeXml } from './badgeCard.js';
import { markBarsInner } from './brandMark.js';

const DISPLAY = "'Barlow Condensed','Arial Narrow',Impact,sans-serif";
const SPARKLE = 'M0-1C.12-.28.28-.12 1 0C.28.12.12.28 0 1C-.12.28-.28.12-1 0C-.28-.12-.12-.28 0-1Z';
export const PACK_W = 220;
export const PACK_H = 352;
// The tear line. PackOpening splits the art here (top strip flies off).
export const TEAR_Y = 38;
const SEAL = 20;

export function tearClip(part) {
  const pts = [];
  for (let i = 0; i <= 22; i++) pts.push(`${((i / 22) * 100).toFixed(2)}% ${(((TEAR_Y + (i % 2 ? 3 : -3)) / PACK_H) * 100).toFixed(2)}%`);
  return part === 'top'
    ? `polygon(0 0, 100% 0, ${pts.slice().reverse().join(', ')})`
    : `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
}

// Crimped top and bottom edges.
function outline() {
  const W = PACK_W, H = PACK_H, teeth = 26, d = 5;
  let top = 'M0 ' + d;
  for (let i = 0; i < teeth; i++) top += ` L${((i + 0.5) * W / teeth).toFixed(1)} 0 L${((i + 1) * W / teeth).toFixed(1)} ${d}`;
  let bot = ` L${W} ${H - d}`;
  for (let i = teeth; i > 0; i--) bot += ` L${((i - 0.5) * W / teeth).toFixed(1)} ${H} L${((i - 1) * W / teeth).toFixed(1)} ${H - d}`;
  return `${top}${bot} Z`;
}
const OUTLINE = outline();

// Small deterministic RNG so every pack draws the same art every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f1 = (n) => n.toFixed(1);
const stops = (list) => list.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('');
const lin = (id, list, attrs = 'x1="0" y1="0" x2="0" y2="1"', extra = '') => `<linearGradient id="${id}" ${attrs}>${stops(list)}${extra}</linearGradient>`;
const rad = (id, list, attrs = '') => `<radialGradient id="${id}" ${attrs}>${stops(list)}</radialGradient>`;

const W = PACK_W, H = PACK_H, CX = W / 2, CY = 150;

// Solid level-number color per pack, drawn with a thick black outline so it
// reads at a glance on any material.
const NUM_COLOR = {
  cardstock: '#F5B942', chrome: '#FFFFFF', holo: '#FFFFFF', cosmic: '#C4B5FD', prism: '#FFFFFF',
  crystal: '#7DD3FC', obsidian: '#FB923C', platinum: '#FFFFFF', mythic: '#F0ABFC', final: '#FFFFFF',
};

/*
 * Materials. Each returns { defs, body, ink, seal } where
 *   body: the printed face (drawn inside the pouch clip)
 *   ink:  color of the small printed text (dark on light packs)
 *   seal: gradient stops for the crimped seals
 * `anim` is false for still renders.
 */
const MATERIALS = {
  cardstock(id) {
    const rings = Array.from({ length: 18 }, (_, i) => `<ellipse cx="${CX}" cy="${CY}" rx="62" ry="22" transform="rotate(${i * 10} ${CX} ${CY})"/>`).join('');
    const waves = Array.from({ length: 16 }, (_, i) => {
      const y = 40 + i * 19;
      return `<path d="M-10 ${y} q 27.5 -7 55 0 t 55 0 t 55 0 t 55 0 t 55 0"/>`;
    }).join('');
    return {
      defs: lin(`${id}m`, [[0, '#F6EFDF'], [0.5, '#E9DDC3'], [1, '#D3C29F']], 'x1="0" y1="0" x2=".4" y2="1"')
        + `<pattern id="${id}fib" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1h3M3 4h2M1 5h1" stroke="#8C7A55" stroke-opacity=".16" stroke-width=".6"/></pattern>`,
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/><rect width="${W}" height="${H}" fill="url(#${id}fib)"/>
<g fill="none" stroke="#A8966E" stroke-opacity=".32" stroke-width=".7">${waves}</g>
<g fill="none" stroke="#9C8960" stroke-opacity=".5" stroke-width=".8">${rings}</g>
<circle cx="${CX}" cy="${CY}" r="70" fill="none" stroke="#B08D57" stroke-opacity=".55" stroke-width="1.2"/>
<rect x="9" y="28" width="${W - 18}" height="${H - 56}" rx="3" fill="none" stroke="#B08D57" stroke-width="1.1" stroke-opacity=".8"/>
<rect x="13" y="32" width="${W - 26}" height="${H - 64}" rx="2" fill="none" stroke="#B08D57" stroke-width=".5" stroke-opacity=".6"/>`,
      ink: '#3B3222',
      seal: [[0, '#D9CCAE'], [0.5, '#F3EBDA'], [1, '#BFAE89']],
    };
  },

  chrome(id, anim) {
    const bands = [[0, '#F7F9FC'], [0.12, '#8E99A8'], [0.2, '#E6EBF1'], [0.33, '#4E5866'], [0.42, '#C9D1DB'], [0.5, '#FFFFFF'], [0.6, '#6B7684'], [0.72, '#DCE2E9'], [0.84, '#3F4854'], [1, '#B8C1CC']];
    return {
      defs: lin(`${id}m`, bands, 'x1="0" y1="0" x2="1" y2="1.3"', anim ? `<animateTransform attributeName="gradientTransform" type="translate" values="0 0;.08 .06;0 0" dur="6s" repeatCount="indefinite"/>` : '')
        + `<pattern id="${id}br" width="4" height="2" patternUnits="userSpaceOnUse"><rect width="4" height=".7" fill="#fff" opacity=".14"/></pattern>`,
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/><rect width="${W}" height="${H}" fill="url(#${id}br)"/>
<path d="M-20 90 L240 20 L240 44 L-20 114Z M-20 300 L240 230 L240 238 L-20 308Z" fill="#fff" opacity=".22"/>
<path d="M-20 150 L240 80 L240 120 L-20 190Z" fill="#1E242C" opacity=".18"/>`,
      ink: '#1B2129',
      seal: [[0, '#7D8896'], [0.5, '#F1F4F8'], [1, '#5E6977']],
    };
  },

  holo(id, anim) {
    const rainbow = [[0, '#7DF9FF'], [0.17, '#B69CFF'], [0.33, '#FF7AD9'], [0.5, '#FFE27A'], [0.67, '#9CFFB5'], [0.83, '#7DD3FF'], [1, '#7DF9FF']];
    return {
      defs: lin(`${id}m`, rainbow, 'x1="0" y1="0" x2="1" y2=".9" spreadMethod="reflect"', anim ? `<animateTransform attributeName="gradientTransform" type="translate" values="-.5 -.5;.5 .5;-.5 -.5" dur="8s" repeatCount="indefinite"/>` : '')
        + lin(`${id}m2`, [[0, '#fff', 0.55], [0.25, '#fff', 0], [0.5, '#5B21B6', 0.25], [0.75, '#fff', 0], [1, '#fff', 0.5]], 'x1="1" y1="0" x2="0" y2="1" spreadMethod="reflect"')
        + `<pattern id="${id}gr" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="1.4" height="5" fill="#fff" opacity=".22"/></pattern>`,
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/><rect width="${W}" height="${H}" fill="url(#${id}m2)"/><rect width="${W}" height="${H}" fill="url(#${id}gr)"/>
<g fill="none" stroke="#fff" stroke-opacity=".35">${Array.from({ length: 7 }, (_, i) => `<circle cx="${CX}" cy="${CY}" r="${16 + i * 18}"/>`).join('')}</g>`,
      ink: '#231A3D',
      seal: [[0, '#B69CFF'], [0.5, '#F5F3FF'], [1, '#7DD3FF']],
    };
  },

  cosmic(id, anim) {
    const r = rng(40);
    const stars = Array.from({ length: 46 }, (_, i) => {
      const x = r() * W, y = 20 + r() * (H - 40), s = r() < 0.15 ? 1.4 : 0.4 + r() * 0.6;
      const tw = anim && i % 4 === 0 ? `<animate attributeName="opacity" values=".2;1;.2" dur="${(1.6 + r() * 2).toFixed(1)}s" begin="-${(r() * 2).toFixed(1)}s" repeatCount="indefinite"/>` : '';
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${s.toFixed(2)}" fill="#fff" opacity="${(0.5 + r() * 0.5).toFixed(2)}">${tw}</circle>`;
    }).join('');
    const arms = Array.from({ length: 5 }, (_, i) => `<ellipse cx="${CX}" cy="${CY + 20}" rx="${70 - i * 11}" ry="${24 - i * 3.5}" transform="rotate(${-24 + i * 18} ${CX} ${CY + 20})"/>`).join('');
    return {
      defs: lin(`${id}m`, [[0, '#120C3A'], [0.5, '#24115E'], [1, '#07051A']], 'x1="0" y1="0" x2=".5" y2="1"')
        + rad(`${id}n1`, [[0, '#C026D3', 0.55], [1, '#C026D3', 0]], 'cx=".5" cy=".5" r=".5"')
        + rad(`${id}n2`, [[0, '#3B82F6', 0.5], [1, '#3B82F6', 0]], 'cx=".5" cy=".5" r=".5"')
        + rad(`${id}n3`, [[0, '#F0ABFC', 0.9], [0.3, '#A78BFA', 0.5], [1, '#A78BFA', 0]], 'cx=".5" cy=".5" r=".5"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/>
<ellipse cx="40" cy="90" rx="120" ry="70" fill="url(#${id}n1)"/><ellipse cx="190" cy="270" rx="130" ry="80" fill="url(#${id}n2)"/><ellipse cx="170" cy="60" rx="80" ry="50" fill="url(#${id}n2)"/>
<g>${anim ? `<animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${CY + 20};360 ${CX} ${CY + 20}" dur="90s" repeatCount="indefinite"/>` : ''}
<g fill="none" stroke="#DDD6FE" stroke-opacity=".3" stroke-width="1.4">${arms}</g></g>
<ellipse cx="${CX}" cy="${CY + 20}" rx="34" ry="16" fill="url(#${id}n3)"/>${stars}`,
      ink: '#E9E3FF',
      seal: [[0, '#3B2A8F'], [0.5, '#8B7BFF'], [1, '#231660']],
    };
  },

  prism() {
    const r = rng(50);
    const cols = ['#FF7AD9', '#FFE9A8', '#67E8F9', '#C084FC', '#FFFFFF', '#F9A8D4', '#A5F3FC', '#FDE68A'];
    const cw = 44, ch = 44, tris = [];
    for (let row = -1; row < H / ch + 1; row++) {
      for (let col = -1; col < W / cw + 1; col++) {
        const off = row % 2 ? cw / 2 : 0;
        const x = col * cw + off, y = row * ch;
        const p = (dx, dy) => `${f1(x + dx)} ${f1(y + dy)}`;
        tris.push(`<path d="M${p(0, 0)}L${p(cw, 0)}L${p(cw / 2, ch)}Z" fill="${cols[Math.floor(r() * cols.length)]}" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`);
        tris.push(`<path d="M${p(cw / 2, ch)}L${p(cw, 0)}L${p(cw * 1.5, ch)}Z" fill="${cols[Math.floor(r() * cols.length)]}" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`);
      }
    }
    return {
      defs: '',
      body: `<rect width="${W}" height="${H}" fill="#F5D0FE"/><g stroke="#fff" stroke-opacity=".55" stroke-width=".7">${tris.join('')}</g>`,
      ink: '#3B1747',
      seal: [[0, '#F0ABFC'], [0.5, '#FFFFFF'], [1, '#67E8F9']],
    };
  },

  crystal(id) {
    const r = rng(60);
    const cluster = (x, y, n, base, spread) => Array.from({ length: n }, () => {
      const ang = base + (r() - 0.5) * spread, len = 44 + r() * 50, w = 8 + r() * 8;
      const rot = (ang * 180) / Math.PI;
      const t = `translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})`;
      const hw = f1(w * 0.7), tip = f1(len + w * 1.4), l = f1(len);
      return `<g transform="${t}"><path d="M0 ${f1(-w)}L${l} -${hw}L${tip} 0L${l} ${hw}L0 ${f1(w)}Z" fill="#CFF1FF" stroke="#0E7490" stroke-opacity=".45" stroke-width=".8"/><path d="M0 ${f1(-w)}L${l} -${hw}L${tip} 0L0 0Z" fill="#fff" fill-opacity=".85"/><path d="M0 0L${tip} 0L${l} ${hw}L0 ${f1(w)}Z" fill="#38BDF8" fill-opacity=".55"/><path d="M0 0L${tip} 0" stroke="#fff" stroke-width=".8"/></g>`;
    }).join('');
    const frost = Array.from({ length: 70 }, () => `<circle cx="${f1(r() * W)}" cy="${f1(20 + r() * (H - 40))}" r="${(0.4 + r()).toFixed(2)}"/>`).join('');
    return {
      defs: lin(`${id}m`, [[0, '#F0FBFF'], [0.45, '#B9E6F8'], [1, '#6FB8DD']], 'x1="0" y1="0" x2=".6" y2="1"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/>
<g fill="#fff" opacity=".7">${frost}</g>
<path d="M0 60L60 30L20 130Z M220 180L150 250L220 300Z M40 260L0 320L80 330Z" fill="#fff" opacity=".25"/>
${cluster(-8, 60, 4, 0.55, 0.9)}${cluster(228, 150, 4, 3.3, 0.9)}${cluster(-8, 330, 4, -0.45, 0.7)}${cluster(228, 332, 3, 3.6, 0.6)}`,
      ink: '#0C3550',
      seal: [[0, '#8FD0EE'], [0.5, '#F4FCFF'], [1, '#6FB8DD']],
    };
  },

  obsidian(id, anim) {
    const r = rng(70);
    const cracks = [];
    const walk = (x, y, ang, len, depth) => {
      let d = `M${f1(x)} ${f1(y)}`;
      const segs = 3 + Math.floor(r() * 3);
      for (let i = 0; i < segs; i++) {
        ang += (r() - 0.5) * 1.1; x += Math.cos(ang) * len / segs; y += Math.sin(ang) * len / segs;
        d += ` L${f1(x)} ${f1(y)}`;
        if (depth < 2 && r() < 0.45) walk(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), len * 0.55, depth + 1);
      }
      cracks.push({ d, depth });
    };
    walk(-5, 70, 0.35, 170, 0); walk(225, 120, 2.7, 190, 0); walk(30, 360, -1.2, 170, 0); walk(120, -5, 1.7, 150, 0); walk(225, 300, 3.5, 150, 0);
    const outer = cracks.map((c) => `<path d="${c.d}" stroke-width="${c.depth ? 1.6 : 2.8}"/>`).join('');
    const inner = cracks.map((c) => `<path d="${c.d}" stroke-width="${c.depth ? 0.5 : 1}"/>`).join('');
    const pulse = anim ? `<animate attributeName="opacity" values="1;.55;1" dur="2.4s" repeatCount="indefinite"/>` : '';
    const embers = anim ? Array.from({ length: 9 }, (_, i) => {
      const x = 14 + r() * (W - 28), d = 3 + r() * 3;
      return `<circle cx="${f1(x)}" cy="${H}" r="${(0.8 + r()).toFixed(1)}" fill="#FDBA74"><animate attributeName="cy" values="${H - 10};60" dur="${d.toFixed(1)}s" begin="-${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="${d.toFixed(1)}s" begin="-${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></circle>`;
    }).join('') : '';
    return {
      defs: lin(`${id}m`, [[0, '#1C1C22'], [0.35, '#0B0B0E'], [0.5, '#2A2A33'], [0.62, '#09090B'], [1, '#141418']], 'x1="0" y1="0" x2="1" y2="1"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/>
<path d="M-10 40 L230 -30 L230 10 L-10 80Z" fill="#fff" opacity=".07"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">${pulse}<g stroke="#EA580C">${outer}</g><g stroke="#FDE68A">${inner}</g></g>${embers}`,
      ink: '#FDBA74',
      seal: [[0, '#18181B'], [0.5, '#3F3F46'], [1, '#09090B']],
    };
  },

  platinum(id) {
    const rays = Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2, x = CX + Math.cos(a) * 260, y = CY + Math.sin(a) * 260;
      return `<path d="M${CX} ${CY}L${f1(x)} ${f1(y)}" stroke-width="${i % 2 ? 0.6 : 1.4}"/>`;
    }).join('');
    const gems = [];
    for (let x = 18; x <= W - 18; x += 12) gems.push([x, 26], [x, H - 26]);
    for (let y = 38; y <= H - 38; y += 12) gems.push([10, y], [W - 10, y]);
    const gem = gems.map(([x, y]) => `<path d="M${x} ${y - 3}L${x + 3} ${y}L${x} ${y + 3}L${x - 3} ${y}Z"/>`).join('');
    return {
      defs: lin(`${id}m`, [[0, '#FBFBFD'], [0.3, '#E4E6EB'], [0.5, '#F7E8EF'], [0.7, '#D9E2EC'], [1, '#B8BEC8']], 'x1="0" y1="0" x2=".7" y2="1"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/>
<g stroke="#fff" stroke-opacity=".8">${rays}</g><g stroke="#8A93A2" stroke-opacity=".28" transform="rotate(5 ${CX} ${CY})">${rays}</g>
<g fill="none" stroke="#9AA3B2" stroke-width="1"><path d="M${CX} ${CY - 92}L${CX + 70} ${CY}L${CX} ${CY + 92}L${CX - 70} ${CY}Z"/><path d="M${CX} ${CY - 76}L${CX + 56} ${CY}L${CX} ${CY + 76}L${CX - 56} ${CY}Z" stroke-opacity=".6"/></g>
<g fill="#fff" stroke="#9AA3B2" stroke-width=".5">${gem}</g>`,
      ink: '#2A303A',
      seal: [[0, '#AEB5C0'], [0.5, '#FFFFFF'], [1, '#9AA3B2']],
    };
  },

  mythic(id, anim) {
    const runes = ['M0-4L0 4M0-4L3-1', 'M-3-4L3 4M3-4L-3 4', 'M0-4L0 4M-3 0L3 0', 'M-3-4L0 0L3-4M0 0L0 4', 'M-3 4L0-4L3 4', 'M0-4L0 4M0-1L3-4M0 1L3 4', 'M-3-4L3-4L-3 4L3 4', 'M-3 0L0-4L3 0L0 4Z'];
    const ring = (rr, n, size) => Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 360;
      return `<path d="${runes[i % runes.length]}" transform="rotate(${a} ${CX} ${CY}) translate(${CX} ${CY - rr}) scale(${size})"/>`;
    }).join('');
    const spin = (dur, dir) => (anim ? `<animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${CY};${dir * 360} ${CX} ${CY}" dur="${dur}s" repeatCount="indefinite"/>` : '');
    const hex = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return `${f1(CX + Math.cos(a) * 52)} ${f1(CY + Math.sin(a) * 52)}`; });
    return {
      defs: lin(`${id}m`, [[0, '#1A0B2E'], [0.5, '#2A0F45'], [1, '#062028']], 'x1="0" y1="0" x2=".6" y2="1"')
        + lin(`${id}rc`, [[0, '#F472B6'], [0.5, '#C084FC'], [1, '#22D3EE']], 'x1="0" y1="0" x2="1" y2="1"')
        + rad(`${id}core`, [[0, '#C084FC', 0.55], [1, '#C084FC', 0]], 'cx=".5" cy=".5" r=".5"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/>
<g fill="none" stroke="#C084FC" stroke-opacity=".12">${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 20 - 60} 0 Q ${i * 20} ${H / 2} ${i * 20 - 60} ${H}"/>`).join('')}</g>
<circle cx="${CX}" cy="${CY}" r="96" fill="url(#${id}core)"/>
<g fill="none" stroke="url(#${id}rc)" stroke-linecap="round">
<circle cx="${CX}" cy="${CY}" r="88" stroke-width="1.6"/><circle cx="${CX}" cy="${CY}" r="72" stroke-width="1"/><circle cx="${CX}" cy="${CY}" r="52" stroke-width="1.2"/>
<g stroke-width="1.3">${spin(60, 1)}${ring(80, 24, 1)}</g>
<g stroke-width="1">${spin(40, -1)}<path d="M${hex[0]}L${hex[2]}L${hex[4]}Z M${hex[1]}L${hex[3]}L${hex[5]}Z"/>${ring(62, 12, 0.8)}</g>
</g>`,
      ink: '#E9D5FF',
      seal: [[0, '#3B0764'], [0.5, '#7E22CE'], [1, '#155E75']],
    };
  },

  // The Final Pull: the brand pack. Black with brand-purple foil, the
  // ShinyPull bars huge behind the number, a double foil frame and violet
  // studs.
  final(id, anim) {
    const rays = Array.from({ length: 18 }, (_, i) => {
      const a0 = (i / 18) * Math.PI * 2, a1 = a0 + Math.PI / 30;
      return `<path d="M${CX} ${CY}L${f1(CX + Math.cos(a0) * 300)} ${f1(CY + Math.sin(a0) * 300)}L${f1(CX + Math.cos(a1) * 300)} ${f1(CY + Math.sin(a1) * 300)}Z"/>`;
    }).join('');
    const studs = [];
    for (let y = 70; y <= H - 70; y += 30) studs.push([12, y], [W - 12, y]);
    const stud = studs.map(([x, y]) => `<path d="M${x} ${y - 3.5}L${x + 3.5} ${y}L${x} ${y + 3.5}L${x - 3.5} ${y}Z" fill="#C4B5FD"/>`).join('');
    // Brand bars, scaled up behind the number.
    const bar = (x, y, h) => `<rect x="${x}" y="${y}" width="42" height="${h}" rx="12" fill="url(#${id}pf)"/>`;
    return {
      defs: lin(`${id}m`, [[0, '#15102A'], [0.45, '#0A0A0F'], [1, '#1B1033']], 'x1="0" y1="0" x2=".5" y2="1"')
        + lin(`${id}pf`, [[0, '#F5F3FF'], [0.35, '#C4B5FD'], [0.7, '#7C3AED'], [1, '#4C1D95']], 'x1="0" y1="0" x2="1" y2="1"', anim ? '<animateTransform attributeName="gradientTransform" type="translate" values="0 0;.25 .25;0 0" dur="6s" repeatCount="indefinite"/>' : '')
        + `<pattern id="${id}dg" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r=".8" fill="#A78BFA" opacity=".35"/></pattern>`,
      body: `<rect width="${W}" height="${H}" fill="url(#${id}m)"/>
<rect width="${W}" height="${H}" fill="url(#${id}dg)"/>
<g fill="#7C3AED" opacity=".22">${anim ? `<animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${CY};360 ${CX} ${CY}" dur="40s" repeatCount="indefinite"/>` : ''}${rays}</g>
<g opacity=".55">${bar(22, 120, 80)}${bar(89, 80, 120)}${bar(156, 40, 160)}</g>
<rect x="7" y="44" width="${W - 14}" height="${H - 71}" rx="6" fill="none" stroke="url(#${id}pf)" stroke-width="3"/>
<rect x="14" y="51" width="${W - 28}" height="${H - 85}" rx="4" fill="none" stroke="#A78BFA" stroke-opacity=".45" stroke-width="1"/>
${stud}`,
      ink: '#DDD6FE',
      seal: [[0, '#2E1065'], [0.5, '#A78BFA'], [1, '#1E0B4A']],
    };
  },
};

/**
 * @param {object} pack   an entry of PACKS
 * @param {object} [o]
 * @param {string} [o.uid]      unique id suffix
 * @param {boolean} [o.locked]  dimmed preview for packs not reached yet
 * @param {boolean} [o.still]   no animation (thumbnails, reduced motion)
 * @param {number} [o.season]
 */
export function renderPack(pack, o = {}) {
  const id = `pk${(o.uid || pack.key).replace(/[^a-z0-9]/gi, '')}`;
  const anim = !o.still;
  const m = (MATERIALS[pack.key] || MATERIALS.chrome)(id, anim);
  const { a } = pack;
  const name = escapeXml(pack.name.toUpperCase());
  const nameSize = name.length > 12 ? 30 : name.length > 8 ? 36 : 44;
  const lvl = String(pack.level);
  const season = Math.max(1, Number(o.season) || 1);
  const double = pack.fx.includes('double');

  const sheen = anim ? `<rect x="-260" y="-80" width="70" height="${H + 160}" fill="url(#${id}shine)" transform="rotate(18)"><animate id="${id}g" attributeName="x" from="-260" to="440" dur="1.4s" begin="0.8s;${id}g.end+${double ? 1.8 : 3.4}s"/></rect>`
    + (double ? `<rect x="-260" y="-80" width="18" height="${H + 160}" fill="url(#${id}shine)" transform="rotate(18)"><animate attributeName="x" from="-260" to="440" dur="1.4s" begin="${id}g.begin+0.22s"/></rect>` : '')
    : '';
  const sparkles = anim && pack.fx.includes('sparkles') ? [[30, 70, 7, 0], [190, 110, 6, .8], [40, 300, 6, 1.5], [186, 296, 7, 2.2], [150, 60, 5, 1.1]].map(([x, y, s, dl]) =>
    `<path d="${SPARKLE}" fill="#fff" transform="translate(${x} ${y})"><animateTransform attributeName="transform" type="scale" additive="sum" values="0;0;${s};0" keyTimes="0;.55;.75;1" dur="2.6s" begin="-${dl}s" repeatCount="indefinite"/></path>`).join('') : '';

  const numSize = 150;
  const numY = 190;
  // o.fit: squeeze text to the pack width (for renderers without the
  // condensed display face, like the share image).
  const numFit = o.fit ? ` textLength="${lvl.length * 62}" lengthAdjust="spacingAndGlyphs"` : '';
  const nameFit = o.fit ? ` textLength="${Math.min(W - 26, name.length * nameSize * 0.46)}" lengthAdjust="spacingAndGlyphs"` : '';
  const numAttrs = `x="${CX}" y="${numY}" text-anchor="middle" font-family="${DISPLAY}" font-style="italic" font-weight="900" font-size="${numSize}" letter-spacing="-5"${numFit}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(pack.name)} pack, level ${pack.level}">
<defs>
${m.defs}
${lin(`${id}seal`, m.seal, 'x1="0" y1="0" x2="1" y2="0"')}
${lin(`${id}name`, [[0, '#FFFFFF'], [0.55, '#FFFFFF'], [1, '#C9CED6']])}
${lin(`${id}shine`, [[0, '#fff', 0], [0.5, '#fff', 0.42], [1, '#fff', 0]], 'x1="0" y1="0" x2="1" y2="0"')}
${lin(`${id}puffx`, [[0, '#000', 0.5], [0.1, '#000', 0.12], [0.3, '#fff', 0.1], [0.45, '#fff', 0.02], [0.8, '#000', 0.05], [0.93, '#000', 0.22], [1, '#000', 0.55]], 'x1="0" y1="0" x2="1" y2="0"')}
${lin(`${id}puffy`, [[0, '#000', 0.45], [0.1, '#000', 0], [0.88, '#000', 0], [1, '#000', 0.5]])}
<pattern id="${id}rib" width="3" height="${SEAL}" patternUnits="userSpaceOnUse"><rect width="1.2" height="${SEAL}" fill="#000" opacity=".22"/><rect x="1.6" width=".6" height="${SEAL}" fill="#fff" opacity=".35"/></pattern>
<clipPath id="${id}clip"><path d="${OUTLINE}"/></clipPath>
</defs>
<g clip-path="url(#${id}clip)"${o.locked ? ' opacity=".5"' : ''}>
${m.body}
<text ${numAttrs} dx="4" dy="6" fill="#000" fill-opacity=".5" stroke="#000" stroke-opacity=".5" stroke-width="9" stroke-linejoin="round">${lvl}</text>
<text ${numAttrs} fill="${NUM_COLOR[pack.key] || '#FFFFFF'}" stroke="#0a0a0f" stroke-width="9" stroke-linejoin="round" paint-order="stroke">${lvl}</text>
<text x="14" y="33" font-family="${DISPLAY}" font-weight="900" font-style="italic" font-size="12" letter-spacing="1.4" fill="${m.ink}">SHINYPULL</text>
<text x="${W - 14}" y="33" text-anchor="end" font-family="${DISPLAY}" font-weight="800" font-style="italic" font-size="10.5" letter-spacing="1.6" fill="${m.ink}" fill-opacity=".8">TEAR HERE</text>
<line x1="0" y1="${TEAR_Y}" x2="${W}" y2="${TEAR_Y}" stroke="${m.ink}" stroke-opacity=".45" stroke-width="1.2" stroke-dasharray="5 4"/>
<rect x="0" y="206" width="${W}" height="64" fill="#0a0a0f" fill-opacity=".92"/>
<rect x="0" y="206" width="${W}" height="2" fill="${a}"/><rect x="0" y="268" width="${W}" height="2" fill="${a}"/>
<text x="${CX}" y="${238 + nameSize * 0.2}" text-anchor="middle" font-family="${DISPLAY}" font-style="italic" font-weight="900" font-size="${nameSize}" letter-spacing=".5" fill="url(#${id}name)"${nameFit}>${name}</text>
<text x="${CX}" y="262" text-anchor="middle" font-family="${DISPLAY}" font-style="italic" font-weight="800" font-size="11.5" letter-spacing="2.4" fill="#fff" fill-opacity=".8">${pack.items} ITEMS · SEASON ${season}</text>
<text x="16" y="${H - 34}" font-family="${DISPLAY}" font-style="italic" font-weight="900" font-size="15" letter-spacing="1.2" fill="${m.ink}">LV ${lvl} PACK</text>
<g transform="translate(${W - 50} ${H - 64}) scale(.36)"><rect x="4" y="4" width="92" height="92" rx="18" fill="#0a0a0f" fill-opacity=".85"/>${markBarsInner(`${id}mk`)}</g>
<rect y="0" width="${W}" height="${SEAL}" fill="url(#${id}seal)"/><rect y="0" width="${W}" height="${SEAL}" fill="url(#${id}rib)"/>
<rect y="${H - SEAL}" width="${W}" height="${SEAL}" fill="url(#${id}seal)"/><rect y="${H - SEAL}" width="${W}" height="${SEAL}" fill="url(#${id}rib)"/>
<rect y="${SEAL}" width="${W}" height="1" fill="#000" opacity=".3"/><rect y="${H - SEAL - 1}" width="${W}" height="1" fill="#000" opacity=".3"/>
<rect width="${W}" height="${H}" fill="url(#${id}puffx)"/>
<rect width="${W}" height="${H}" fill="url(#${id}puffy)"/>
<rect x="5" y="${SEAL}" width="1.2" height="${H - SEAL * 2}" fill="#fff" opacity=".35"/>
${sparkles}${sheen}
</g>
<path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity=".22"/>
</svg>`;
}

/**
 * A wide banner made from a pack's printed material (lava cracks, nebula,
 * ice and so on), tiled and mirrored so the seams match. Tops the public
 * page and the locker preview. Scale with preserveAspectRatio "slice".
 * @param {object} pack  an entry of PACKS
 * @param {object} [o]   { uid, still }
 */
export function renderBanner(pack, o = {}) {
  const id = `bn${(o.uid || pack.key).replace(/[^a-z0-9]/gi, '')}`;
  const m = (MATERIALS[pack.key] || MATERIALS.chrome)(id, !o.still);
  const BW = W * 6, BH = 240, Y = 56;
  const tiles = Array.from({ length: 6 }, (_, i) => (i % 2
    ? `<use href="#${id}t" transform="translate(${(i + 1) * W} ${-Y}) scale(-1 1)"/>`
    : `<use href="#${id}t" transform="translate(${i * W} ${-Y})"/>`)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>${m.defs}<g id="${id}t">${m.body}</g>${lin(`${id}fade`, [[0, '#0a0a0f', 0], [0.55, '#0a0a0f', 0.35], [1, '#0a0a0f', 1]])}</defs>
${tiles}
<rect width="${BW}" height="${BH}" fill="url(#${id}fade)"/>
</svg>`;
  return o.still ? svg.replace(/<animate(?:Transform)?\b[^>]*\/>/g, '') : svg;
}
