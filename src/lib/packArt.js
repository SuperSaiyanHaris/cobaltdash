// ShinyPass pack artwork (Arena style) as an inline SVG string: a tall
// crimped foil bag with diagonal stripes, the pack's level stamped huge, a
// slanted black band carrying the name, and a tear line near the top. Each
// pack (src/lib/shinyPass.js PACKS) has its own colors and a growing list of
// effects, so higher packs look rarer. SMIL only, no filters, blurs or glows.

import { escapeXml } from './badgeCard.js';
import { markBarsInner } from './brandMark.js';

const DISPLAY = "'Barlow Condensed','Arial Narrow',Impact,sans-serif";
const SPARKLE = 'M0-1C.12-.28.28-.12 1 0C.28.12.12.28 0 1C-.12.28-.28.12-1 0C-.28-.12-.12-.28 0-1Z';
export const PACK_W = 220;
export const PACK_H = 352;
// The tear line. PackOpening splits the art here (top strip flies off).
export const TEAR_Y = 34;

export function tearClip(part) {
  const pts = [];
  for (let i = 0; i <= 22; i++) pts.push(`${((i / 22) * 100).toFixed(2)}% ${(((TEAR_Y + (i % 2 ? 3 : -3)) / PACK_H) * 100).toFixed(2)}%`);
  return part === 'top'
    ? `polygon(0 0, 100% 0, ${pts.slice().reverse().join(', ')})`
    : `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
}

// Crimped top and bottom edges.
function outline() {
  const W = PACK_W, H = PACK_H, teeth = 22, d = 7;
  let top = 'M0 ' + d;
  for (let i = 0; i < teeth; i++) top += ` L${((i + 0.5) * W / teeth).toFixed(1)} 0 L${((i + 1) * W / teeth).toFixed(1)} ${d}`;
  let bot = ` L${W} ${H - d}`;
  for (let i = teeth; i > 0; i--) bot += ` L${((i - 0.5) * W / teeth).toFixed(1)} ${H} L${((i - 1) * W / teeth).toFixed(1)} ${H - d}`;
  return `${top}${bot} Z`;
}
const OUTLINE = outline();

/**
 * @param {object} pack   an entry of PACKS (a/b/c/d colors, fx, items)
 * @param {object} [o]
 * @param {string} [o.uid]      unique id suffix
 * @param {boolean} [o.locked]  dimmed preview for packs not reached yet
 * @param {boolean} [o.still]   no animation (thumbnails, reduced motion)
 * @param {number} [o.season]
 */
export function renderPack(pack, o = {}) {
  const W = PACK_W, H = PACK_H;
  const id = `pk${(o.uid || pack.key).replace(/[^a-z0-9]/gi, '')}`;
  const fx = new Set(o.still ? [] : pack.fx);
  const { a, b, c, d } = pack;
  const name = escapeXml(pack.name.toUpperCase());
  const nameSize = name.length > 12 ? 30 : name.length > 8 ? 38 : 46;
  const lvl = String(pack.level);
  const season = Math.max(1, Number(o.season) || 1);

  const foilAnim = fx.has('foil') ? `<animateTransform attributeName="gradientTransform" type="translate" values="-0.3 -0.3;0.3 0.3;-0.3 -0.3" dur="7s" repeatCount="indefinite"/>` : '';
  const sheen = o.still ? '' : `<rect x="-260" y="-80" width="70" height="${H + 160}" fill="url(#${id}shine)" transform="rotate(18)"><animate id="${id}g" attributeName="x" from="-260" to="440" dur="1.4s" begin="0.8s;${id}g.end+${fx.has('double') ? 1.6 : 3.2}s"/></rect>`
    + (fx.has('double') ? `<rect x="-260" y="-80" width="18" height="${H + 160}" fill="url(#${id}shine)" transform="rotate(18)"><animate attributeName="x" from="-260" to="440" dur="1.4s" begin="${id}g.begin+0.22s"/></rect>` : '');
  const stripeAnim = fx.has('stripes') ? `<animateTransform attributeName="patternTransform" type="translate" additive="sum" values="0 0;48 0" dur="4s" repeatCount="indefinite"/>` : '';
  const prism = fx.has('prism') ? `<rect x="-220" y="-40" width="150" height="${H + 80}" fill="url(#${id}prism)" transform="rotate(18)"><animate attributeName="x" values="-220;420" dur="4.2s" repeatCount="indefinite"/></rect>` : '';
  const stars = fx.has('stars') ? Array.from({ length: 14 }, (_, i) => {
    const x = 18 + ((i * 53) % (W - 36)), y = 46 + ((i * 89) % (H - 110));
    return `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.6}" fill="#fff"><animate attributeName="opacity" values=".15;1;.15" dur="${1.8 + (i % 5) * .5}s" begin="-${(i * .41).toFixed(2)}s" repeatCount="indefinite"/></circle>`;
  }).join('') : '';
  const facets = fx.has('facets') ? `<g opacity=".14"><path d="M0 40L110 40L50 150Z M110 40L220 40L170 130Z M0 150L50 150L0 250Z M220 130L220 260L160 220Z" fill="${b}"/><path d="M50 150L170 130L160 220L100 200Z" fill="${a}" opacity=".6"/></g>` : '';
  const sparkles = fx.has('sparkles') ? [[30, 70, 8, 0], [190, 110, 6, .8], [40, 300, 6, 1.5], [186, 290, 8, 2.2], [120, 56, 5, 1.1]].map(([x, y, s, dl]) =>
    `<path d="${SPARKLE}" fill="#fff" transform="translate(${x} ${y})"><animateTransform attributeName="transform" type="scale" additive="sum" values="0;0;${s};0" keyTimes="0;.55;.75;1" dur="2.6s" begin="-${dl}s" repeatCount="indefinite"/></path>`).join('') : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(pack.name)} pack, level ${pack.level}">
<defs>
<linearGradient id="${id}body" x1="0" y1="0" x2=".55" y2="1" spreadMethod="reflect"><stop offset="0" stop-color="${a}"/><stop offset=".45" stop-color="${d}"/><stop offset=".7" stop-color="${c}"/><stop offset="1" stop-color="#0d0b16"/>${foilAnim}</linearGradient>
<linearGradient id="${id}name" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset="1" stop-color="${a}"/></linearGradient>
<linearGradient id="${id}shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}prism" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F472B6" stop-opacity="0"/><stop offset=".3" stop-color="#F472B6" stop-opacity=".22"/><stop offset=".5" stop-color="#FDE68A" stop-opacity=".28"/><stop offset=".7" stop-color="#67E8F9" stop-opacity=".22"/><stop offset="1" stop-color="#67E8F9" stop-opacity="0"/></linearGradient>
<pattern id="${id}stripes" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(-60)"><rect width="10" height="48" fill="#fff" opacity=".16"/><rect x="24" width="6" height="48" fill="#000" opacity=".16"/>${stripeAnim}</pattern>
<clipPath id="${id}clip"><path d="${OUTLINE}"/></clipPath>
</defs>
<g clip-path="url(#${id}clip)"${o.locked ? ' opacity=".5"' : ''}>
<rect width="${W}" height="${H}" fill="url(#${id}body)"/>
<rect width="${W}" height="${H}" fill="url(#${id}stripes)"/>
${facets}${stars}
<text x="12" y="158" font-family="${DISPLAY}" font-style="italic" font-weight="900" font-size="${lvl.length > 1 ? 136 : 150}" letter-spacing="-4" fill="#0a0a0f" fill-opacity=".42">${lvl}</text>
<line x1="0" y1="${TEAR_Y}" x2="${W}" y2="${TEAR_Y}" stroke="#0a0a0f" stroke-opacity=".55" stroke-width="2" stroke-dasharray="6 4"/>
<text x="${W - 12}" y="${TEAR_Y - 9}" text-anchor="end" font-family="${DISPLAY}" font-weight="800" font-style="italic" font-size="11" letter-spacing="1.5" fill="#0a0a0f" fill-opacity=".65">TEAR HERE</text>
<text x="12" y="${TEAR_Y - 9}" font-family="${DISPLAY}" font-weight="900" font-style="italic" font-size="12" letter-spacing="1.2" fill="#0a0a0f" fill-opacity=".75">SHINYPULL</text>
<g transform="rotate(-8 ${W / 2} 222)">
<rect x="-40" y="186" width="${W + 80}" height="76" fill="#0a0a0f"/>
<rect x="-40" y="186" width="${W + 80}" height="3" fill="${a}"/>
<text x="${W / 2}" y="${226 + nameSize * 0.18}" text-anchor="middle" font-family="${DISPLAY}" font-style="italic" font-weight="900" font-size="${nameSize}" letter-spacing=".5" fill="url(#${id}name)">${name}</text>
<text x="${W / 2}" y="252" text-anchor="middle" font-family="${DISPLAY}" font-style="italic" font-weight="800" font-size="12" letter-spacing="2.4" fill="#fff" fill-opacity=".85">${pack.items} ITEMS · SEASON ${season}</text>
</g>
<g transform="translate(${W - 66} ${H - 72}) scale(.6)"><rect x="10" y="6" width="80" height="88" rx="12" fill="#0a0a0f" fill-opacity=".72"/>${markBarsInner(`${id}m`)}</g>
<text x="14" y="${H - 22}" font-family="${DISPLAY}" font-style="italic" font-weight="900" font-size="15" letter-spacing="1.2" fill="#0a0a0f" fill-opacity=".7">LV ${lvl} PACK</text>
${prism}${sparkles}${sheen}
</g>
<path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity=".28"/>
</svg>`;
}
