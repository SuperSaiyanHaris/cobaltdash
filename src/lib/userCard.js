// A signed-in user's own ShinyPass card, as an inline SVG string. Same
// 250x350 holographic layout and motion rules as the creator cards
// (src/lib/badgeCard.js): rarity comes from level (Common 1-24, Rare 25-49,
// Epic 50-74, Legendary 75-99), and an equipped frame from a pack swaps the
// foil colors and adds that pack's effects. SMIL only, no filters or blurs.
//
// Rendered inline (not as <img>), so the avatar can be a normal https URL.
// `uid` keeps gradient ids unique when several cards share a page.

import { TIERS, escapeXml, compactCount } from './badgeCard.js';
import { tierForLevel, PACK_BY_KEY, RINGS, TITLES, badgeMeta, MAX_LEVEL } from './shinyPass.js';
import { markBarsInner } from './brandMark.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
const MOTION = {
  COMMON:    { foil: 0,   sweep: 1.6, gap: 8,   shine: .22 },
  RARE:      { foil: 8,   sweep: 1.4, gap: 4.5, shine: .32 },
  EPIC:      { foil: 5,   sweep: 1.2, gap: 3.2, shine: .4, stripes: 3, ring: 7 },
  LEGENDARY: { foil: 3.5, sweep: 1.1, gap: 2.2, shine: .5, stripes: 2.2, ring: 4.5, legendary: true },
};
const SPARKLE = 'M0-1C.12-.28.28-.12 1 0C.28.12.12.28 0 1C-.12.28-.28.12-1 0C-.28-.12-.12-.28 0-1Z';
const SPARKLES = [[40, 66, 7, 0], [212, 176, 6, .7], [56, 196, 5, 1.4], [206, 62, 4.5, 2.1], [30, 262, 5, 1.05], [222, 250, 6, 1.75]];
const STARS = [[34, 60], [70, 88], [196, 70], [214, 120], [44, 150], [188, 186], [120, 64], [226, 94], [28, 110], [160, 196]];

const safeUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u)) || (typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u)) ? u : null;

/**
 * @param {object} u
 * @param {string} u.handle
 * @param {string|null} u.avatar      https URL or data: URI
 * @param {number} u.level
 * @param {number} u.into            XP into the current level
 * @param {number} u.need            XP needed for the next level (0 at 99)
 * @param {number} u.xp              lifetime XP
 * @param {number} u.streak
 * @param {object} [u.equipped]      { frame, ring, title, badge }
 * @param {string} [u.uid]
 * @param {number} [u.season]
 * @param {boolean} [u.still]     no animation (thumbnails, grids, reduced motion)
 */
export function renderUserCard(u) {
  const W = 250, H = 350;
  const id = `uc${(u.uid || 'x').replace(/[^a-z0-9]/gi, '')}`;
  const level = Math.max(1, Math.min(MAX_LEVEL, u.level || 1));
  const tierKey = tierForLevel(level);
  const tier = TIERS[tierKey];
  const eq = u.equipped || {};
  const frame = eq.frame && PACK_BY_KEY[eq.frame];
  const t = frame ? { ...tier, a: frame.a, b: frame.b, c: frame.c, d: frame.d } : tier;
  const fx = new Set(frame ? frame.fx : []);
  const m = MOTION[tierKey];
  const ring = eq.ring && RINGS[eq.ring];
  const title = eq.title && TITLES[eq.title] ? TITLES[eq.title].name : 'ShinyPass member';
  const badge = eq.badge && badgeMeta(eq.badge);
  const handle = escapeXml(String(u.handle || 'you').slice(0, 18));
  const initials = escapeXml(String(u.handle || '?').slice(0, 1).toUpperCase());
  const pct = level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (u.into || 0) / (u.need || 1)));
  const avatar = safeUrl(u.avatar);

  const foilAnim = (m.foil || fx.has('foil')) ? `<animateTransform attributeName="gradientTransform" type="translate" values="-0.5 -0.5;0.5 0.5;-0.5 -0.5" dur="${m.foil || 6}s" repeatCount="indefinite"/>` : '';
  const stripes = m.stripes || (fx.has('stripes') ? 3.4 : 0);
  const ringDur = m.ring || (fx.has('prism') ? 6 : 0);
  const legendary = m.legendary || fx.has('sparkles');
  const glint = `<animate id="${id}g" attributeName="x" from="-220" to="420" dur="${m.sweep}s" begin="1s;${id}g.end+${m.gap}s"/>`;
  const shine = `<rect x="-220" y="-60" width="90" height="${H + 120}" fill="url(#${id}shine)" transform="rotate(20)">${glint}</rect>`
    + ((m.legendary || fx.has('double')) ? `<rect x="-220" y="-60" width="22" height="${H + 120}" fill="url(#${id}shine)" transform="rotate(20)"><animate attributeName="x" from="-220" to="420" dur="${m.sweep}s" begin="${id}g.begin+0.22s"/></rect>` : '');
  const prism = (m.legendary || fx.has('prism')) ? `<g clip-path="url(#${id}win)"><rect x="-200" y="-40" width="130" height="300" fill="url(#${id}prism)" transform="rotate(20)"><animate attributeName="x" values="-200;380" dur="3.6s" repeatCount="indefinite"/></rect></g>` : '';
  const sparkles = legendary ? SPARKLES.map(([x, y, s, d]) => `<path d="${SPARKLE}" fill="${t.b}" transform="translate(${x} ${y})"><animateTransform attributeName="transform" type="scale" additive="sum" values="0;0;${s};0" keyTimes="0;.55;.75;1" dur="2.8s" begin="-${d}s" repeatCount="indefinite"/></path>`).join('') : '';
  const stars = fx.has('stars') ? `<g clip-path="url(#${id}win)">${STARS.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? .9 : 1.4}" fill="#fff"><animate attributeName="opacity" values=".2;1;.2" dur="${2 + (i % 4) * .6}s" begin="-${i * .37}s" repeatCount="indefinite"/></circle>`).join('')}</g>` : '';
  const facets = fx.has('facets') ? `<g clip-path="url(#${id}win)" opacity=".16"><path d="M18 48L90 48L50 130Z M90 48L170 48L125 120Z M170 48L232 48L232 110Z M18 130L60 208L18 208Z M200 150L232 208L150 208Z" fill="${t.b}"/><path d="M50 130L125 120L200 150L150 208L60 208Z" fill="${t.a}" opacity=".5"/></g>` : '';

  const numGrad = legendary
    ? `<linearGradient id="${id}num" x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect"><stop offset="0" stop-color="${t.a}"/><stop offset=".5" stop-color="${t.b}"/><stop offset="1" stop-color="${t.a}"/><animateTransform attributeName="gradientTransform" type="translate" values="-1 0;1 0" dur="3s" repeatCount="indefinite"/></linearGradient>`
    : `<linearGradient id="${id}num" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.b}"/><stop offset="1" stop-color="${t.a}"/></linearGradient>`;
  const ringA = ring ? ring.a : t.b, ringB = ring ? ring.b : t.c;
  const ringGrad = `<linearGradient id="${id}ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ringA}"/><stop offset=".5" stop-color="${ring ? ring.b : t.a}"/><stop offset="1" stop-color="${ringB}"/>${ringDur ? `<animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="${ringDur}s" repeatCount="indefinite"/>` : ''}</linearGradient>`;

  const art = avatar
    ? `<image href="${escapeXml(avatar)}" x="${W / 2 - 50}" y="76" width="100" height="100" clip-path="url(#${id}av)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${W / 2}" cy="126" r="50" fill="${t.c}" fill-opacity=".35"/><text x="${W / 2}" y="142" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="800" fill="${t.b}">${initials}</text>`;

  const badgeChip = badge ? (() => {
    const label = escapeXml(badge.name.toUpperCase());
    const w = label.length * 5.6 + 18;
    return `<g transform="translate(${W / 2 - w / 2} 181)"><rect width="${w}" height="16" rx="8" fill="#0B0B12" stroke="${badge.a}" stroke-opacity=".85"/><text x="${w / 2}" y="11" text-anchor="middle" font-family="${FONT}" font-size="8" font-weight="800" letter-spacing=".8" fill="${badge.a}">${label}</text></g>`;
  })() : '';

  const barW = W - 44;
  const label = `${handle}: level ${level} on ShinyPull (${tier.name} card)`;
  const tierLabel = frame ? `${frame.name.toUpperCase()}` : tier.name;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
<defs>
<linearGradient id="${id}foil" x1="0" y1="0" x2="1" y2="1" spreadMethod="reflect"><stop offset="0" stop-color="${t.a}"/><stop offset=".2" stop-color="${t.b}"/><stop offset=".38" stop-color="${t.d}"/><stop offset=".55" stop-color="${t.c}"/><stop offset=".72" stop-color="${t.b}"/><stop offset=".86" stop-color="${t.d}"/><stop offset="1" stop-color="${t.a}"/>${foilAnim}</linearGradient>
${numGrad}${ringGrad}
<radialGradient id="${id}art" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${t.c}" stop-opacity=".5"/><stop offset=".6" stop-color="${t.d}" stop-opacity=".14"/><stop offset="1" stop-color="#0B0B12" stop-opacity="0"/></radialGradient>
<pattern id="${id}holo" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="10" fill="#fff" opacity="${stripes ? .08 : .05}"/>${stripes ? `<animateTransform attributeName="patternTransform" type="translate" additive="sum" values="0 0;10 0" dur="${stripes}s" repeatCount="indefinite"/>` : ''}</pattern>
<linearGradient id="${id}shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${m.shine}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.c}"/><stop offset=".6" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>
<clipPath id="${id}clip"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<linearGradient id="${id}prism" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F472B6" stop-opacity="0"/><stop offset=".3" stop-color="#F472B6" stop-opacity=".22"/><stop offset=".5" stop-color="#FDE68A" stop-opacity=".26"/><stop offset=".7" stop-color="#67E8F9" stop-opacity=".22"/><stop offset="1" stop-color="#67E8F9" stop-opacity="0"/></linearGradient>
<clipPath id="${id}win"><rect x="18" y="48" width="${W - 36}" height="160" rx="10"/></clipPath>
<clipPath id="${id}av"><circle cx="${W / 2}" cy="126" r="50"/></clipPath>
</defs>
<g clip-path="url(#${id}clip)">
<rect width="${W}" height="${H}" fill="url(#${id}foil)"/>
<rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="11" fill="#0B0B12"/>
<rect x="18" y="18" width="${tierLabel.length * 7.6 + 32}" height="20" rx="10" fill="${t.a}" fill-opacity=".14" stroke="${t.a}" stroke-opacity=".6"/>
<path transform="translate(24 21.5) scale(.5)" d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6 5.6 21.1 7 14l-5.3-5 7.2-.9z" fill="${t.a}"/>
<text x="40" y="32.5" font-family="${FONT}" font-size="9.5" font-weight="800" letter-spacing="1.4" fill="${t.a}">${escapeXml(tierLabel)}</text>
<g transform="translate(${W - 44} 14) scale(.28)">${markBarsInner(`${id}mk`)}</g>
<rect x="18" y="48" width="${W - 36}" height="160" rx="10" fill="#12121A"/>
<rect x="18" y="48" width="${W - 36}" height="160" rx="10" fill="url(#${id}art)"/>
<rect x="18" y="48" width="${W - 36}" height="160" rx="10" fill="url(#${id}holo)"/>
${stars}${facets}${prism}
<rect x="18.5" y="48.5" width="${W - 37}" height="159" rx="9.5" fill="none" stroke="url(#${id}foil)" stroke-opacity=".7"/>
<circle cx="${W / 2}" cy="126" r="56" fill="none" stroke="url(#${id}ring)" stroke-width="4"/>
${art}
${badgeChip}
<text x="${W / 2}" y="229" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="800" fill="#FAFAFA">@${handle}</text>
<text x="${W / 2}" y="244" text-anchor="middle" font-family="${FONT}" font-size="9.5" font-weight="600" letter-spacing=".6" fill="#E4E4EA">${escapeXml(title)}</text>
<text x="${W / 2}" y="281" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="900" letter-spacing="-1" fill="url(#${id}num)">LV ${level}</text>
<rect x="22" y="291" width="${barW}" height="6" rx="3" fill="#fff" fill-opacity=".1"/>
<rect x="22" y="291" width="${Math.max(6, barW * pct).toFixed(1)}" height="6" rx="3" fill="url(#${id}bar)"/>
<text x="22" y="309" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing=".6" fill="#C4C4CE">${level >= MAX_LEVEL ? 'MAX LEVEL' : `${compactCount(u.into || 0)} / ${compactCount(u.need || 0)} XP`}</text>
<text x="${W - 22}" y="309" text-anchor="end" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing=".6" fill="#C4C4CE">${compactCount(u.xp || 0)} XP TOTAL</text>
<line x1="22" y1="317" x2="${W - 22}" y2="317" stroke="#fff" stroke-opacity=".08"/>
<text x="22" y="333" font-family="${FONT}" font-size="9.5" font-weight="700" fill="${(u.streak || 0) > 0 ? '#FDBA74' : '#C4C4CE'}">${(u.streak || 0) > 0 ? `${u.streak}-day streak` : 'No streak yet'}</text>
<text x="${W - 22}" y="333" text-anchor="end" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing="1.2" fill="#C4C4CE">${String(level).padStart(2, '0')}/${MAX_LEVEL} · SEASON ${Math.max(1, Number(u.season) || 1)}</text>
${sparkles}${shine}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="#fff" stroke-opacity=".25"/>
</svg>`;
  // Still: drop every SMIL animation. The glint and prism bars rest off-card,
  // so what remains is the card at rest.
  return u.still ? svg.replace(/<animate(?:Transform)?\b[^>]*\/>/g, '') : svg;
}
