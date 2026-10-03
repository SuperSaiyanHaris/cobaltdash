// The printed face of each ShinyPass pack: ten illustrated posters, one idea
// per pack, drawn as bold flat vector shapes so they read at thumbnail size.
// (packArt.js adds the pouch, the extruded level number, the name plaque and
// the lighting on top.) No filters, blurs or glows: hard-edged shapes, and a
// little SMIL where it earns its keep. `anim` is false for still renders.
//
// Each poster returns { defs, body, ink, seal, num, ext }:
//   body: the art, drawn 220 x 352 inside the pouch clip
//   ink:  color of the small printed text
//   seal: gradient stops for the crimped seals
//   num:  fill of the level number, ext: its extrusion color

const W = 220, H = 352, CX = W / 2;
const HY = 90; // the hero art is centered here, above the level number
const f1 = (n) => n.toFixed(1);
const stops = (list) => list.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('');
const lin = (id, list, attrs = 'x1="0" y1="0" x2="0" y2="1"', extra = '') => `<linearGradient id="${id}" ${attrs}>${stops(list)}${extra}</linearGradient>`;
const SPARKLE = 'M0-1C.12-.28.28-.12 1 0C.28.12.12.28 0 1C-.12.28-.28.12-1 0C-.28-.12-.12-.28 0-1Z';
const sparkle = (x, y, s, fill = '#fff', extra = '') => `<path d="${SPARKLE}" fill="${fill}" transform="translate(${x} ${y}) scale(${s})">${extra}</path>`;
const twinkle = (anim, dur, delay) => (anim ? `<animateTransform attributeName="transform" type="scale" additive="sum" values="1;.35;1" dur="${dur}s" begin="-${delay}s" repeatCount="indefinite"/>` : '');

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const wedges = (cx, cy, n, r, phase = 0) => Array.from({ length: n }, (_, i) => {
  const a0 = phase + (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
  return `<path d="M${cx} ${cy}L${f1(cx + Math.cos(a0) * r)} ${f1(cy + Math.sin(a0) * r)}L${f1(cx + Math.cos(a1) * r)} ${f1(cy + Math.sin(a1) * r)}Z"/>`;
}).join('');

export const POSTERS = {
  // 10: the starter. Letterpress on kraft: a fan of cards over a sunburst.
  cardstock() {
    const card = (rot, fill, win, mark) => `<g transform="rotate(${rot} ${CX} 150)">
<rect x="${CX - 32}" y="${HY - 38}" width="64" height="92" rx="7" fill="#FBF6E9" stroke="#3B3222" stroke-width="2.6"/>
<rect x="${CX - 25}" y="${HY - 30}" width="50" height="52" rx="4" fill="${fill}" stroke="#3B3222" stroke-width="1.6"/>
<rect x="${CX - 25}" y="${HY + 28}" width="30" height="5" rx="2.5" fill="#3B3222"/><rect x="${CX - 25}" y="${HY + 37}" width="20" height="4" rx="2" fill="#3B3222" opacity=".5"/>
${win}${mark ? `<g fill="#3B3222"><rect x="${CX - 14}" y="${HY + 4}" width="8" height="16" rx="2"/><rect x="${CX - 4}" y="${HY - 6}" width="8" height="26" rx="2"/><rect x="${CX + 6}" y="${HY - 18}" width="8" height="38" rx="2"/></g>` : ''}</g>`;
    return {
      defs: `<pattern id="csdot" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="#7A6A48" opacity=".32"/></pattern>`,
      body: `<rect width="${W}" height="${H}" fill="#D8C69F"/>
<g fill="#C9B586" opacity=".7">${wedges(CX, 165, 26, 330)}</g>
<rect y="190" width="${W}" height="${H - 190}" fill="url(#csdot)"/>
${card(-24, '#C2410C', '', false)}${card(22, '#3B3222', '', false)}${card(0, '#F5B942', '', true)}
<g transform="rotate(-14 172 70)"><circle cx="172" cy="70" r="21" fill="none" stroke="#B91C1C" stroke-width="2.4" opacity=".85"/><circle cx="172" cy="70" r="16.5" fill="none" stroke="#B91C1C" stroke-width="1" opacity=".85"/><text x="172" y="75" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',Impact,sans-serif" font-weight="900" font-size="15" fill="#B91C1C" opacity=".85">NEW</text></g>
<rect x="10" y="46" width="${W - 20}" height="${H - 76}" rx="4" fill="none" stroke="#3B3222" stroke-opacity=".5" stroke-width="1.2" stroke-dasharray="3 3"/>`,
      ink: '#3B3222', seal: [[0, '#D9CCAE'], [0.5, '#F3EBDA'], [1, '#BFAE89']], num: '#F5B942', ext: '#7A4B12',
    };
  },

  // 20: liquid chrome. Three chrome bars on a mirror floor, horizon and grid.
  chrome(id) {
    const hz = 130;
    const bars = [[62, 40, 70], [96, 62, 84], [130, 84, 98]];
    const bar = (x, h, top) => `<rect x="${x}" y="${top}" width="30" height="${h}" rx="9" fill="url(#${id}cb)" stroke="#0B0E13" stroke-opacity=".55" stroke-width="1.4"/><rect x="${x + 4}" y="${top + 6}" width="4" height="${h - 14}" rx="2" fill="#fff" opacity=".75"/>`;
    const grid = Array.from({ length: 17 }, (_, i) => `<path d="M${CX} ${hz}L${-260 + i * 46} ${H}"/>`).join('');
    const rows = [138, 148, 162, 182, 210, 250, 300].map((y) => `<path d="M0 ${y}H${W}"/>`).join('');
    return {
      defs: lin(`${id}sky`, [[0, '#0A0D12'], [0.6, '#2A3340'], [1, '#8E9BAC']])
        + lin(`${id}fl`, [[0, '#D5DCE5'], [0.3, '#6A7584'], [1, '#0F1319']])
        + lin(`${id}cb`, [[0, '#7A8594'], [0.18, '#FFFFFF'], [0.42, '#3F4856'], [0.58, '#E6EAF0'], [0.8, '#5A6573'], [1, '#C4CCD6']], 'x1="0" y1="0" x2="1" y2="0"'),
      body: `<rect width="${W}" height="${hz}" fill="url(#${id}sky)"/><rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#${id}fl)"/>
<g stroke="#fff" stroke-opacity=".28" stroke-width=".9" fill="none">${grid}${rows}</g>
<rect y="${hz - 1}" width="${W}" height="2.4" fill="#fff"/>
<g opacity=".38" transform="translate(0 ${hz * 2}) scale(1 -1)">${bars.map(([x, h, t]) => bar(x, h, hz - h)).join('')}</g>
${bars.map(([x, h]) => bar(x, h, hz - h)).join('')}
<path d="M-10 60L120 44L120 54L-10 76Z M150 150L240 130L240 140L150 160Z" fill="#fff" opacity=".28"/>`,
      ink: '#E8EDF3', seal: [[0, '#7D8896'], [0.5, '#F1F4F8'], [1, '#5E6977']], num: '#FFFFFF', ext: '#2B3340',
    };
  },

  // 30: hologram foil. Rainbow diffraction stripes that slide, a big spark.
  holo(id, anim) {
    const cols = ['#7DF9FF', '#B69CFF', '#FF7AD9', '#FFE27A', '#9CFFB5', '#7DD3FF'];
    const bands = Array.from({ length: 24 }, (_, i) => `<rect x="-260" y="${-120 + i * 28}" width="740" height="28" fill="${cols[i % 6]}"/>`).join('');
    const slide = anim ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 168" dur="12s" repeatCount="indefinite"/>` : '';
    const pluses = Array.from({ length: 11 }, (_, r) => Array.from({ length: 9 }, (_, c) => `<path d="M${c * 26 + (r % 2 ? 13 : 0)} ${r * 30 + 40}h6M${c * 26 + (r % 2 ? 13 : 0) + 3} ${r * 30 + 37}v6"/>`).join('')).join('');
    return {
      defs: '',
      body: `<g transform="rotate(32 ${CX} 176)"><g>${slide}${bands}</g></g>
<g stroke="#fff" stroke-opacity=".55" stroke-width="1" fill="none">${pluses}</g>
<g fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2">${Array.from({ length: 5 }, (_, i) => `<circle cx="${CX}" cy="${HY}" r="${26 + i * 15}"/>`).join('')}</g>
${sparkle(CX, HY, 64, '#fff', twinkle(anim, 3.2, 0))}${sparkle(CX, HY, 36, '#5B21B6', '')}
${sparkle(38, 74, 11, '#fff', twinkle(anim, 2.2, 0.4))}${sparkle(184, 66, 9, '#fff', twinkle(anim, 2.6, 1.1))}${sparkle(178, 150, 12, '#fff', twinkle(anim, 2.4, 0.9))}${sparkle(40, 150, 8, '#fff', twinkle(anim, 2, 1.5))}`,
      ink: '#231A3D', seal: [[0, '#B69CFF'], [0.5, '#F5F3FF'], [1, '#7DD3FF']], num: '#FFFFFF', ext: '#5B21B6',
    };
  },

  // 40: a ringed planet with a moon, over a starfield.
  cosmic(id, anim) {
    const r = rng(40);
    const stars = Array.from({ length: 70 }, (_, i) => {
      const x = r() * W, y = 24 + r() * (H - 48), s = r() < 0.12 ? 1.5 : 0.45 + r() * 0.7;
      const tw = anim && i % 5 === 0 ? `<animate attributeName="opacity" values=".25;1;.25" dur="${(1.8 + r() * 2).toFixed(1)}s" begin="-${(r() * 2).toFixed(1)}s" repeatCount="indefinite"/>` : '';
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${s.toFixed(2)}" fill="#fff" opacity="${(0.45 + r() * 0.5).toFixed(2)}">${tw}</circle>`;
    }).join('');
    const bandCols = ['#5B21B6', '#7C3AED', '#C4B5FD', '#F0ABFC', '#8B5CF6', '#DDD6FE', '#6D28D9'];
    const bands = bandCols.map((c, i) => `<rect x="${CX - 60}" y="${HY - 56 + i * 16}" width="120" height="${i % 2 ? 12 : 18}" fill="${c}"/>`).join('');
    const ringBack = `<path d="M${CX - 100} ${HY} A100 24 0 0 1 ${CX + 100} ${HY}" fill="none" stroke="#E9D5FF" stroke-width="9"/><path d="M${CX - 88} ${HY} A88 20 0 0 1 ${CX + 88} ${HY}" fill="none" stroke="#A78BFA" stroke-width="4"/>`;
    const ringFront = `<path d="M${CX - 100} ${HY} A100 24 0 0 0 ${CX + 100} ${HY}" fill="none" stroke="#E9D5FF" stroke-width="9"/><path d="M${CX - 88} ${HY} A88 20 0 0 0 ${CX + 88} ${HY}" fill="none" stroke="#A78BFA" stroke-width="4"/>`;
    const moon = anim
      ? `<circle r="9" fill="#FDE68A" stroke="#0B0824" stroke-width="2"><animateMotion dur="14s" repeatCount="indefinite" path="M${CX + 70} ${HY - 38} a74 40 0 1 1 -1 0.1Z"/></circle>`
      : `<circle cx="${CX + 70}" cy="${HY - 38}" r="9" fill="#FDE68A" stroke="#0B0824" stroke-width="2"/>`;
    return {
      defs: `<clipPath id="${id}pl"><circle cx="${CX}" cy="${HY}" r="52"/></clipPath>`,
      body: `<rect width="${W}" height="${H}" fill="#0B0824"/>
<g fill="#1B1450">${wedges(CX, HY, 16, 300)}</g>${stars}
<g fill="none" stroke="#A78BFA" stroke-opacity=".4" stroke-width="1" stroke-dasharray="3 5"><ellipse cx="${CX}" cy="${HY}" rx="74" ry="40" transform="rotate(-20 ${CX} ${HY})"/></g>
<g transform="rotate(-18 ${CX} ${HY})">${ringBack}</g>
<g clip-path="url(#${id}pl)">${bands}<circle cx="${CX + 22}" cy="${HY + 16}" r="52" fill="#07051A" opacity=".42"/></g>
<circle cx="${CX}" cy="${HY}" r="52" fill="none" stroke="#0B0824" stroke-width="2.5"/>
<g transform="rotate(-18 ${CX} ${HY})">${ringFront}</g>
${moon}
<path d="M30 52L74 66M178 132L206 124" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
      ink: '#E9E3FF', seal: [[0, '#3B2A8F'], [0.5, '#8B7BFF'], [1, '#231660']], num: '#C4B5FD', ext: '#2E1B7A',
    };
  },

  // 50: a prism splitting one white beam into the spectrum.
  prism() {
    const cols = ['#EF4444', '#F97316', '#FACC15', '#22C55E', '#38BDF8', '#8B5CF6'];
    const fan = cols.map((c, k) => `<path d="M139 ${HY + 1 + k * 1.4}L139 ${HY + 2.4 + k * 1.4}L${W + 6} ${HY - 26 + k * 17}L${W + 6} ${HY - 9 + k * 17}Z" fill="${c}"/>`).join('');
    const tri = [[CX, HY - 54], [CX + 58, HY + 46], [CX - 58, HY + 46]];
    return {
      defs: '',
      body: `<rect width="${W}" height="${H}" fill="#12091F"/>
<g fill="#1E1033">${wedges(CX, HY + 20, 18, 320)}</g>
${fan}
<path d="M-4 ${HY + 12}L${CX - 30} ${HY + 2}L${CX - 30} ${HY + 8}L-4 ${HY + 18}Z" fill="#fff"/>
<path d="M${tri.map((p) => p.join(' ')).join('L')}Z" fill="#C4B5FD" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>
<path d="M${CX} ${HY - 54}L${CX + 58} ${HY + 46}L${CX} ${HY + 46}Z" fill="#8B5CF6"/>
<path d="M${CX} ${HY - 54}L${CX - 58} ${HY + 46}L${CX - 22} ${HY + 46}Z" fill="#EDE9FE"/>
<path d="M${CX} ${HY - 34}L${CX + 28} ${HY + 18}L${CX - 28} ${HY + 18}Z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>
${sparkle(CX - 6, HY - 18, 7, '#fff', '')}${sparkle(34, 66, 8, '#fff', '')}${sparkle(188, 168, 7, '#fff', '')}`,
      ink: '#EDE9FE', seal: [[0, '#F0ABFC'], [0.5, '#FFFFFF'], [1, '#67E8F9']], num: '#FFFFFF', ext: '#5B21B6',
    };
  },

  // 60: a cut gem in a frost of ice shards.
  crystal(id, anim) {
    const gx = CX, gy = HY - 4;
    const P = (dx, dy) => `${gx + dx} ${gy + dy}`;
    const facet = (pts, fill) => `<path d="M${pts.map(([x, y]) => P(x, y)).join('L')}Z" fill="${fill}"/>`;
    const spike = (x, y, rot, len, w) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 ${-w}L${len} ${-w * 0.6}L${len + w * 1.6} 0L${len} ${w * 0.6}L0 ${w}Z" fill="#CFF1FF" stroke="#0E7490" stroke-opacity=".5" stroke-width="1"/><path d="M0 ${-w}L${len} ${-w * 0.6}L${len + w * 1.6} 0L0 0Z" fill="#fff"/><path d="M0 0L${len + w * 1.6} 0L${len} ${w * 0.6}L0 ${w}Z" fill="#38BDF8" fill-opacity=".6"/></g>`;
    const r = rng(60);
    const frost = Array.from({ length: 60 }, () => `<circle cx="${f1(r() * W)}" cy="${f1(24 + r() * (H - 48))}" r="${(0.5 + r() * 1.2).toFixed(1)}"/>`).join('');
    return {
      defs: lin(`${id}bg`, [[0, '#F0FBFF'], [0.5, '#BFE7F9'], [1, '#7CC2E3']], 'x1="0" y1="0" x2=".5" y2="1"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/><g fill="#fff" opacity=".8">${frost}</g>
<path d="M0 70L50 44L24 150Z M${W} 120L160 190L${W} 230Z M0 210L30 250L-10 300Z" fill="#fff" opacity=".35"/>
${spike(-4, 58, 24, 44, 9)}${spike(W + 4, 70, 156, 44, 9)}${spike(-4, 150, -20, 38, 8)}${spike(W + 4, 150, 200, 38, 8)}
<g stroke="#0369A1" stroke-opacity=".6" stroke-width="1" stroke-linejoin="round">
${facet([[-56, 4], [-28, -28], [-14, 4]], '#BAE6FD')}${facet([[-28, -28], [0, 4], [-14, 4]], '#E0F2FE')}${facet([[-28, -28], [28, -28], [0, 4]], '#FFFFFF')}
${facet([[28, -28], [14, 4], [0, 4]], '#7DD3FC')}${facet([[28, -28], [56, 4], [14, 4]], '#38BDF8')}
${facet([[-56, 4], [-14, 4], [0, 84]], '#7DD3FC')}${facet([[-14, 4], [0, 4], [0, 84]], '#E0F2FE')}${facet([[0, 4], [14, 4], [0, 84]], '#38BDF8')}${facet([[14, 4], [56, 4], [0, 84]], '#0EA5E9')}
</g>
${sparkle(gx - 14, gy - 16, 9, '#fff', twinkle(anim, 2.4, 0))}${sparkle(gx + 36, gy + 10, 7, '#fff', twinkle(anim, 2, 0.8))}${sparkle(30, 68, 8, '#fff', twinkle(anim, 2.8, 1.4))}${sparkle(190, 56, 7, '#fff', twinkle(anim, 2.2, 0.5))}`,
      ink: '#0C3550', seal: [[0, '#8FD0EE'], [0.5, '#F4FCFF'], [1, '#6FB8DD']], num: '#7DD3FC', ext: '#075985',
    };
  },

  // 70: a volcano at night, lava running down black glass.
  obsidian(id, anim) {
    const r = rng(70);
    const embers = anim ? Array.from({ length: 10 }, (_, i) => {
      const x = 80 + r() * 60, d = 2.6 + r() * 2.4;
      return `<circle cx="${f1(x)}" cy="${HY - 30}" r="${(0.9 + r()).toFixed(1)}" fill="#FDBA74"><animate attributeName="cy" values="${HY - 22};${HY - 96}" dur="${d.toFixed(1)}s" begin="-${(i * 0.5).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="${d.toFixed(1)}s" begin="-${(i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`;
    }).join('') : '';
    const mtn = `M-6 196L22 150L40 162L62 116L82 128L100 ${HY - 24}L120 ${HY - 24}L138 126L158 112L178 150L198 138L${W + 6} 190L${W + 6} 230L-6 230Z`;
    return {
      defs: lin(`${id}bg`, [[0, '#0B0B0E'], [0.55, '#2A0D08'], [1, '#6B1D07']]),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>
<g fill="#3A3A42" opacity=".75"><circle cx="${CX - 8}" cy="${HY - 40}" r="13"/><circle cx="${CX + 8}" cy="${HY - 52}" r="16"/><circle cx="${CX - 2}" cy="${HY - 66}" r="12"/></g>
<path d="${mtn}" fill="#17171D" stroke="#5A5A66" stroke-width="2.2" stroke-linejoin="round"/>
<g fill="#2B2B35"><path d="M62 116L82 128L70 170L40 162Z"/><path d="M158 112L138 126L150 168L178 150Z"/><path d="M100 ${HY - 24}L82 128L100 172Z" fill="#383843"/><path d="M120 ${HY - 24}L138 126L120 172Z" fill="#0F0F14"/></g>
<ellipse cx="${CX}" cy="${HY - 24}" rx="14" ry="4.6" fill="#F97316"/><ellipse cx="${CX}" cy="${HY - 24.6}" rx="9" ry="2.6" fill="#FDE68A"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#EA580C" stroke-width="3.4"><path d="M${CX - 6} ${HY - 22}L96 122L102 146L88 176L94 206"/><path d="M${CX + 6} ${HY - 22}L128 126L122 152L136 180L130 206"/><path d="M${CX} ${HY - 22}L${CX - 2} 140L${CX + 6} 168L${CX - 4} 200"/></g><g stroke="#FDE68A" stroke-width="1.1"><path d="M${CX - 6} ${HY - 22}L96 122L102 146L88 176L94 206"/><path d="M${CX + 6} ${HY - 22}L128 126L122 152L136 180L130 206"/><path d="M${CX} ${HY - 22}L${CX - 2} 140L${CX + 6} 168L${CX - 4} 200"/></g></g>
${embers}`,
      ink: '#FDBA74', seal: [[0, '#18181B'], [0.5, '#52525B'], [1, '#09090B']], num: '#FB923C', ext: '#7C2D12',
    };
  },

  // 80: art deco. A sunburst, a shell fan and stepped towers, all silver.
  platinum(id) {
    const base = 150;
    const fan = [78, 60, 42, 24].map((rad, i) => `<path d="M${CX - rad} ${base}A${rad} ${rad} 0 0 1 ${CX + rad} ${base}Z" fill="${i % 2 ? '#F8FAFC' : '#C9CFD9'}" stroke="#7B8494" stroke-width="1.6"/>`).join('');
    const tower = (x, steps, flip) => Array.from({ length: steps }, (_, i) => {
      const w = 18 - i * 4, h = 30 + i * 18, xx = flip ? x - w / 2 : x - w / 2;
      return `<rect x="${xx}" y="${base - h}" width="${w}" height="${h}" fill="#1F2733" stroke="#0F141B" stroke-width="1"/>`;
    }).join('');
    return {
      defs: `<clipPath id="${id}cl"><rect width="${W}" height="${base + 4}"/></clipPath>`,
      body: `<rect width="${W}" height="${H}" fill="#E8EBF0"/>
<g clip-path="url(#${id}cl)"><g fill="#fff">${wedges(CX, base, 28, 300)}</g><g fill="#CED4DD" opacity=".7">${wedges(CX, base, 28, 300, Math.PI / 28)}</g></g>
<rect y="${base}" width="${W}" height="6" fill="#1F2733"/>
${tower(24, 3, false)}${tower(W - 24, 3, true)}${tower(54, 2, false)}${tower(W - 54, 2, true)}
${fan}
<path d="M${CX} ${base - 98}L${CX + 11} ${base - 86}L${CX} ${base - 74}L${CX - 11} ${base - 86}Z" fill="#fff" stroke="#7B8494" stroke-width="1.6"/>
<g stroke="#B08D57" stroke-width="1.4" fill="none"><path d="M10 54H${W - 10}M10 58H${W - 10}"/></g>
${sparkle(CX - 62, 66, 7, '#fff', '')}${sparkle(CX + 64, 62, 6, '#fff', '')}`,
      ink: '#2A303A', seal: [[0, '#AEB5C0'], [0.5, '#FFFFFF'], [1, '#9AA3B2']], num: '#FFFFFF', ext: '#4A5365',
    };
  },

  // 90: a mystic eye in a hex frame with a ring of runes.
  mythic(id, anim) {
    const runes = ['M0-4L0 4M0-4L3-1', 'M-3-4L3 4M3-4L-3 4', 'M0-4L0 4M-3 0L3 0', 'M-3-4L0 0L3-4M0 0L0 4', 'M-3 4L0-4L3 4', 'M0-4L0 4M0-1L3-4M0 1L3 4', 'M-3-4L3-4L-3 4L3 4', 'M-3 0L0-4L3 0L0 4Z'];
    const ring = Array.from({ length: 22 }, (_, i) => `<path d="${runes[i % runes.length]}" transform="rotate(${(i / 22) * 360} ${CX} ${HY}) translate(${CX} ${HY - 82}) scale(1.05)"/>`).join('');
    const hex = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return [CX + Math.cos(a) * 66, HY + Math.sin(a) * 66]; });
    const spin = anim ? `<animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${HY};360 ${CX} ${HY}" dur="70s" repeatCount="indefinite"/>` : '';
    return {
      defs: lin(`${id}bg`, [[0, '#1A0B2E'], [0.55, '#2A0F45'], [1, '#062028']], 'x1="0" y1="0" x2=".6" y2="1"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>
<g fill="#C084FC" opacity=".16">${wedges(CX, HY, 24, 300)}</g>
<g fill="none" stroke="#E9D5FF" stroke-width="1.2" stroke-linecap="round" stroke-opacity=".85">${spin}${ring}</g>
<path d="M${hex.map((p) => p.map(f1).join(' ')).join('L')}Z" fill="#0F0720" stroke="#F472B6" stroke-width="2.6"/>
<path d="M${hex.map((p) => p.map(f1).join(' ')).join('L')}Z" fill="none" stroke="#22D3EE" stroke-width="1" transform="translate(0 0) scale(.9) translate(${f1(CX * 0.1 / 0.9)} ${f1(HY * 0.1 / 0.9)})"/>
<path d="M${CX - 52} ${HY}Q${CX} ${HY - 52} ${CX + 52} ${HY}Q${CX} ${HY + 52} ${CX - 52} ${HY}Z" fill="#F5F3FF" stroke="#C084FC" stroke-width="3" stroke-linejoin="round"/>
<circle cx="${CX}" cy="${HY}" r="25" fill="#7C3AED" stroke="#22D3EE" stroke-width="3"/><circle cx="${CX}" cy="${HY}" r="16" fill="#A78BFA"/>
<ellipse cx="${CX}" cy="${HY}" rx="7" ry="19" fill="#0A0A0F"/><circle cx="${CX - 9}" cy="${HY - 11}" r="5" fill="#fff"/>
<path d="M${CX - 58} ${HY - 14}L${CX - 70} ${HY - 22}M${CX + 58} ${HY - 14}L${CX + 70} ${HY - 22}M${CX} ${HY - 50}L${CX} ${HY - 62}" stroke="#F0ABFC" stroke-width="2" stroke-linecap="round"/>
${sparkle(34, 60, 8, '#F0ABFC', '')}${sparkle(190, 160, 8, '#67E8F9', '')}`,
      ink: '#E9D5FF', seal: [[0, '#3B0764'], [0.5, '#7E22CE'], [1, '#155E75']], num: '#F0ABFC', ext: '#581C87',
    };
  },

  // 99: the brand pack. Three rising bars crowned with a star inside a laurel.
  final(id, anim) {
    const leaf = (cx, cy, ang, c) => `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="10" ry="4.2" transform="rotate(${f1(ang)} ${f1(cx)} ${f1(cy)})" fill="${c}"/>`;
    const branch = (mirror) => Array.from({ length: 11 }, (_, k) => {
      const th = (100 + k * 14) * Math.PI / 180;
      let x = CX + Math.cos(th) * 80, y = HY + 12 + Math.sin(th) * 74;
      if (mirror) x = 2 * CX - x;
      const left = 100 + k * 14 + 90 + (k % 2 ? 32 : -32);
      const ang = mirror ? 180 - left : left;
      return leaf(x, y, ang, k % 2 ? '#C4B5FD' : '#8B5CF6');
    }).join('');
    const bar = (x, y, h, fill) => `<rect x="${x}" y="${y}" width="28" height="${h}" rx="9" fill="${fill}" stroke="#0A0A0F" stroke-width="3"/>`;
    const r = rng(99);
    const confetti = anim ? Array.from({ length: 14 }, (_, i) => {
      const x = 14 + r() * (W - 28), d = 3 + r() * 3;
      return `<rect x="${f1(x)}" y="40" width="4" height="7" fill="${['#C4B5FD', '#fff', '#7C3AED', '#F0ABFC'][i % 4]}"><animate attributeName="y" values="40;200" dur="${d.toFixed(1)}s" begin="-${(i * 0.4).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" dur="${d.toFixed(1)}s" begin="-${(i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></rect>`;
    }).join('') : '';
    return {
      defs: lin(`${id}bg`, [[0, '#15102A'], [0.5, '#0A0A0F'], [1, '#1B1033']], 'x1="0" y1="0" x2=".5" y2="1"'),
      body: `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>
<g fill="#7C3AED" opacity=".26">${anim ? `<animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${HY};360 ${CX} ${HY}" dur="50s" repeatCount="indefinite"/>` : ''}${wedges(CX, HY, 20, 320)}</g>
${branch(false)}${branch(true)}
${bar(66, HY + 6, 52, '#C4B5FD')}${bar(96, HY - 24, 82, '#A78BFA')}${bar(126, HY - 56, 114, '#FFFFFF')}
${sparkle(140, HY - 74, 17, '#FFFFFF', twinkle(anim, 2.6, 0))}${sparkle(40, 66, 8, '#C4B5FD', '')}${sparkle(184, 70, 7, '#fff', '')}
<rect x="7" y="44" width="${W - 14}" height="${H - 71}" rx="6" fill="none" stroke="#7C3AED" stroke-width="3"/><rect x="14" y="51" width="${W - 28}" height="${H - 85}" rx="4" fill="none" stroke="#A78BFA" stroke-opacity=".5" stroke-width="1"/>
${confetti}`,
      ink: '#DDD6FE', seal: [[0, '#2E1065'], [0.5, '#A78BFA'], [1, '#1E0B4A']], num: '#FFFFFF', ext: '#4C1D95',
    };
  },
};
