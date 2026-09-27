// ShinyPass pack artwork as an inline SVG string: a crimped foil pouch with
// a tear line near the top, the ShinyPull bars in the middle and the pack's
// name. Each pack (src/lib/shinyPass.js PACKS) has its own foil stops and a
// growing list of effects, so higher packs look rarer: Cardstock is matte,
// The Final Pull runs everything. SMIL only, no filters, blurs or glows.

import { escapeXml } from './badgeCard.js';
import { markBarsInner } from './brandMark.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
const SPARKLE = 'M0-1C.12-.28.28-.12 1 0C.28.12.12.28 0 1C-.12.28-.28.12-1 0C-.28-.12-.12-.28 0-1Z';
export const PACK_W = 220;
export const PACK_H = 320;

// Crimped edge: a zigzag of `teeth` between x0 and x1 at height y (dir = +1 down).
function crimp(x0, x1, y, depth, teeth, dir) {
  const step = (x1 - x0) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) d += ` L${(x0 + step * (i + 0.5)).toFixed(1)} ${y + depth * dir} L${(x0 + step * (i + 1)).toFixed(1)} ${y}`;
  return d;
}

// The tear line sits at y = 36 of 320. A jagged CSS clip-path splits the
// pack there for the opening animation (top strip flies off, body stays).
export const TEAR_Y = 36;
export function tearClip(part) {
  const pts = [];
  for (let i = 0; i <= 22; i++) pts.push(`${((i / 22) * 100).toFixed(2)}% ${(((TEAR_Y + (i % 2 ? 3 : -3)) / PACK_H) * 100).toFixed(2)}%`);
  return part === 'top'
    ? `polygon(0 0, 100% 0, ${pts.slice().reverse().join(', ')})`
    : `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
}

/**
 * @param {object} pack   an entry of PACKS
 * @param {object} [o]
 * @param {string} [o.uid]      unique id suffix
 * @param {boolean} [o.locked]  greyed-out preview for packs not reached yet
 * @param {boolean} [o.still]   no animation (thumbnails)
 */
export function renderPack(pack, o = {}) {
  const W = PACK_W, H = PACK_H;
  const id = `pk${(o.uid || pack.key).replace(/[^a-z0-9]/gi, '')}`;
  const fx = new Set(o.still ? [] : pack.fx);
  const { a, b, c, d, base } = pack;
  const name = escapeXml(pack.name.toUpperCase());
  const nameSize = name.length > 12 ? 17 : name.length > 9 ? 21 : 26;
  const paper = pack.face === 'paper';
  const face = paper ? 0 : Number(pack.face) || 0;
  const ink = paper ? '#5B5140' : b;

  const outline = `M8 6${crimp(8, W - 8, 6, 5, 16, -1)} L${W - 8} ${H - 6}${crimp(W - 8, 8, H - 6, 5, 16, 1)} Z`;

  const foilAnim = fx.has('foil') ? `<animateTransform attributeName="gradientTransform" type="translate" values="-0.5 -0.5;0.5 0.5;-0.5 -0.5" dur="6s" repeatCount="indefinite"/>` : '';
  const sheen = fx.has('sheen') || !o.still
    ? `<rect x="-240" y="-80" width="80" height="${H + 160}" fill="url(#${id}shine)" transform="rotate(18)"><animate id="${id}g" attributeName="x" from="-240" to="420" dur="1.5s" begin="0.6s;${id}g.end+${fx.has('double') ? 1.8 : 3.4}s"/></rect>`
      + (fx.has('double') ? `<rect x="-240" y="-80" width="20" height="${H + 160}" fill="url(#${id}shine)" transform="rotate(18)"><animate attributeName="x" from="-240" to="420" dur="1.5s" begin="${id}g.begin+0.25s"/></rect>` : '')
    : '';
  const stripes = fx.has('stripes') ? `<rect x="14" y="44" width="${W - 28}" height="${H - 88}" fill="url(#${id}holo)"/>` : '';
  const stars = fx.has('stars') ? Array.from({ length: 16 }, (_, i) => {
    const x = 22 + ((i * 53) % (W - 44)), y = 50 + ((i * 97) % (H - 110));
    return `<circle cx="${x}" cy="${y}" r="${i % 3 ? .9 : 1.5}" fill="#fff"><animate attributeName="opacity" values=".15;1;.15" dur="${1.8 + (i % 5) * .5}s" begin="-${(i * .41).toFixed(2)}s" repeatCount="indefinite"/></circle>`;
  }).join('') : '';
  const facets = fx.has('facets') ? `<g opacity=".13"><path d="M14 44L110 44L60 150Z M110 44L206 44L160 130Z M14 150L60 150L14 260Z M206 130L206 260L150 220Z M60 276L110 200L160 276Z" fill="${b}"/><path d="M60 150L160 130L150 220L110 200Z" fill="${a}" opacity=".6"/></g>` : '';
  const prism = fx.has('prism') ? `<rect x="-200" y="-40" width="140" height="${H + 80}" fill="url(#${id}prism)" transform="rotate(18)"><animate attributeName="x" values="-200;400" dur="4s" repeatCount="indefinite"/></rect>` : '';
  const sparkles = fx.has('sparkles') ? [[34, 70, 8, 0], [186, 96, 6, .8], [44, 214, 6, 1.5], [180, 240, 8, 2.2], [110, 58, 5, 1.1]].map(([x, y, s, dl]) =>
    `<path d="${SPARKLE}" fill="${b}" transform="translate(${x} ${y})"><animateTransform attributeName="transform" type="scale" additive="sum" values="0;0;${s};0" keyTimes="0;.55;.75;1" dur="2.6s" begin="-${dl}s" repeatCount="indefinite"/></path>`).join('') : '';
  // Rings behind the mark: thin foil strokes, never a filled glow.
  const rings = [66, 52, 38].map((r, i) => `<circle cx="${W / 2}" cy="132" r="${r}" fill="none" stroke="url(#${id}foil)" stroke-opacity="${.18 + i * .12}" stroke-width="${i === 2 ? 1.6 : 1}"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(pack.name)} pack, level ${pack.level}">
<defs>
<linearGradient id="${id}foil" x1="0" y1="0" x2="1" y2="1" spreadMethod="reflect"><stop offset="0" stop-color="${a}"/><stop offset=".22" stop-color="${b}"/><stop offset=".42" stop-color="${d}"/><stop offset=".6" stop-color="${c}"/><stop offset=".8" stop-color="${b}"/><stop offset="1" stop-color="${a}"/>${foilAnim}</linearGradient>
<linearGradient id="${id}body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base}"/><stop offset=".5" stop-color="#0b0b12"/><stop offset="1" stop-color="${base}"/></linearGradient>
<linearGradient id="${id}shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}prism" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F472B6" stop-opacity="0"/><stop offset=".3" stop-color="#F472B6" stop-opacity=".2"/><stop offset=".5" stop-color="#FDE68A" stop-opacity=".24"/><stop offset=".7" stop-color="#67E8F9" stop-opacity=".2"/><stop offset="1" stop-color="#67E8F9" stop-opacity="0"/></linearGradient>
<pattern id="${id}holo" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3.5" height="9" fill="#fff" opacity=".07"/><animateTransform attributeName="patternTransform" type="translate" additive="sum" values="0 0;9 0" dur="3s" repeatCount="indefinite"/></pattern>
<linearGradient id="${id}shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0b12" stop-opacity="0"/><stop offset=".45" stop-color="#0b0b12" stop-opacity=".78"/><stop offset="1" stop-color="#0b0b12" stop-opacity=".9"/></linearGradient>
<pattern id="${id}grain" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${paper ? '#3b3326' : '#fff'}" opacity="${paper ? .12 : .05}"/></pattern>
<clipPath id="${id}clip"><path d="${outline}"/></clipPath>
</defs>
<g clip-path="url(#${id}clip)"${o.locked ? ' opacity=".55"' : ''}>
<rect width="${W}" height="${H}" fill="url(#${id}foil)"/>
<rect x="8" y="36" width="${W - 16}" height="${H - 72}" rx="6" fill="${paper ? '#EFE8D8' : `url(#${id}body)`}"/>
${!paper && face ? `<rect x="8" y="36" width="${W - 16}" height="${H - 72}" rx="6" fill="url(#${id}foil)" opacity="${face}"/>` : ''}
<rect x="8" y="36" width="${W - 16}" height="${H - 72}" rx="6" fill="url(#${id}grain)"/>
${stripes}${facets}${stars}
${paper ? '' : `<rect x="8" y="170" width="${W - 16}" height="${H - 206}" fill="url(#${id}shade)"/>`}
<rect x="14" y="44" width="${W - 28}" height="${H - 88}" rx="4" fill="none" stroke="${paper ? '#B5A98F' : `url(#${id}foil)`}" stroke-opacity=".7"/>
<g transform="rotate(-8 ${W / 2} 128)"><rect x="${W / 2 - 46}" y="64" width="92" height="128" rx="9" fill="${paper ? '#E4DAC4' : '#0b0b12'}" fill-opacity="${paper ? 1 : .78}" stroke="url(#${id}foil)" stroke-width="2.5"/></g>
${rings}
<g transform="translate(${W / 2 - 66} 62) scale(1.32)">${markBarsInner(`${id}m`)}</g>
<text x="${W / 2}" y="224" text-anchor="middle" font-family="${FONT}" font-size="9" font-weight="800" letter-spacing="3.2" fill="${ink}" fill-opacity=".85">SHINYPULL</text>
<text x="${W / 2}" y="${224 + nameSize + 4}" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" font-weight="900" letter-spacing="-.5" fill="${paper ? '#2A2418' : `url(#${id}foil)`}">${name}</text>
<text x="${W / 2}" y="276" text-anchor="middle" font-family="${FONT}" font-size="8.5" font-weight="800" letter-spacing="1.6" fill="${paper ? '#5B5140' : '#E4E4EA'}">LEVEL ${pack.level} · ${pack.items} ITEMS</text>
<line x1="14" y1="36" x2="${W - 14}" y2="36" stroke="#0b0b12" stroke-opacity=".55" stroke-dasharray="4 3"/>
<text x="${W - 16}" y="31" text-anchor="end" font-family="${FONT}" font-size="6.5" font-weight="800" letter-spacing="1.4" fill="#0b0b12" fill-opacity=".6">TEAR HERE</text>
<text x="16" y="31" font-family="${FONT}" font-size="7.5" font-weight="900" letter-spacing="1" fill="#0b0b12" fill-opacity=".7">LV ${pack.level}</text>
${prism}${sparkles}${sheen}
</g>
<path d="${outline}" fill="none" stroke="#fff" stroke-opacity=".3"/>
</svg>`;
}
