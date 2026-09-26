// Link-preview images (og:image / twitter:image) built from the holographic
// creator cards. Used by api/share-card.js (one per creator, rendered on
// request) and scripts/generateOgImages.mjs (the static per-page previews).
//
// Everything is drawn as ONE vector SVG and rasterized by resvg with our own
// font files: Vercel's Node runtime has no system fonts, and sharp's SVG
// renderer silently substitutes one (the first OG pipeline shipped monospace
// that way). resvg is told to load no system fonts at all, so what renders
// locally is exactly what renders in production.
//
// Design: the site's dark band (flat #0a0a0f + faint dot grid fading down),
// text on the left, the card on the right with a neutral black shadow. No
// glows, no colored shadows. The upright headliner card keeps its platform
// logo; rotated cards are drawn markless (brand rules).

import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { renderCard, cardTier, CARD_PLATFORMS, compactCount, escapeXml as esc } from '../src/lib/badgeCard.js';

export const SHARE_W = 1200;
export const SHARE_H = 630;
const W = SHARE_W, H = SHARE_H;

const FONT_FILES = ['Inter-Bold.ttf', 'Inter-SemiBold.ttf', 'SpaceGrotesk-Bold.ttf']
  .map((f) => fileURLToPath(new URL(`../scripts/assets/fonts/${f}`, import.meta.url)));

const DISPLAY = "'Space Grotesk', Inter";
const BODY = 'Inter';

// Our fonts cover Latin, Cyrillic and Greek. Anything else (CJK, Arabic,
// emoji...) would render as nothing, so a name outside that falls back to the
// handle, which is ASCII on every platform we track.
const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;
const RENDERABLE = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Common}\p{Script=Inherited}]+$/u;
export function displayName(name, username) {
  const n = String(name || '').replace(EMOJI, '').replace(/\s+/g, ' ').trim();
  return n && RENDERABLE.test(n) ? n : String(username || '');
}

// resvg can decode WebP, but not every build agrees; PNG is the safe common
// ground (Kick and some others serve WebP avatars).
async function normalizeAvatar(avatar) {
  const m = avatar && avatar.match(/^data:image\/webp;base64,(.+)$/);
  if (!m) return avatar;
  try {
    const png = await sharp(Buffer.from(m[1], 'base64')).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Card data made safe for rendering here (fonts, avatar format). */
export async function prepCard(data) {
  return { ...data, name: displayName(data.name, data.username), avatar: await normalizeAvatar(data.avatar) };
}

// Each card SVG defines ids prefixed "sp"; several cards in one document
// would share (and so steal) each other's gradients. Namespace them.
function cardMarkup(data, i, showMark) {
  return renderCard({ ...data, showMark })
    .replace(/(id="|url\(#)sp/g, `$1c${i}sp`)
    .replace(/<title>[\s\S]*?<\/title>/, '')
    // Our fonts have no ▲/▼; the green or red already says which way.
    .replace(/▲ \+/g, '+').replace(/▼ −/g, '−');
}

function background() {
  return `<defs>
  <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.3" fill="#fff" fill-opacity=".10"/></pattern>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient>
  <mask id="dotmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
  <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="16"/></filter>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#a855f7"/><stop offset="1" stop-color="#d946ef"/></linearGradient>
  <linearGradient id="brandtext" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset=".55" stop-color="#c084fc"/><stop offset="1" stop-color="#e879f9"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#0a0a0f"/>
<rect width="${W}" height="${H}" fill="url(#dots)" mask="url(#dotmask)"/>`;
}

// The ShinyPull mark (from its real geometry) plus the wordmark.
function lockup(x, y) {
  const s = 44, u = s / 64;
  const bars = [14, 24, 32].map((h, i) => {
    const bx = x + (64 - 3 * 8 - 2 * 3) / 2 * u + i * (8 + 3) * u;
    return `<rect x="${bx.toFixed(1)}" y="${(y + s - 16 * u - h * u).toFixed(1)}" width="${(8 * u).toFixed(1)}" height="${(h * u).toFixed(1)}" rx="${(2.5 * u).toFixed(1)}" fill="#fff"/>`;
  }).join('');
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${16 * u}" fill="url(#brand)"/>${bars}
<text x="${x + s + 14}" y="${y + s / 2 + 11}" font-family="${BODY}" font-size="30" font-weight="700" letter-spacing="-0.8" fill="#fff">ShinyPu<tspan fill="url(#brandtext)">ll</tspan></text>`;
}

// Place a card (250x350 native) centered at cx,cy with the given height and
// rotation, with a soft neutral shadow underneath.
function placeCard(markup, { cx, cy, height, angle = 0 }) {
  const k = height / 350;
  const w = 250 * k;
  const x = cx - w / 2, y = cy - height / 2;
  const rot = angle ? ` rotate(${angle} ${cx} ${cy})` : '';
  return `<g transform="${rot.trim()}">
<rect x="${(x + 6).toFixed(1)}" y="${(y + 22).toFixed(1)}" width="${(w - 12).toFixed(1)}" height="${height.toFixed(1)}" rx="${(16 * k).toFixed(1)}" fill="#000" fill-opacity=".75" filter="url(#shadow)"/>
<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)})">${markup}</g>
</g>`;
}

// Rough glyph width for Space Grotesk Bold, used to shrink long names so they
// stay inside the text column. Conservative on purpose.
function fitSize(text, maxWidth, maxSize, minSize, perChar = 0.58) {
  const size = Math.floor(maxWidth / (Math.max(1, [...text].length) * perChar));
  return Math.max(minSize, Math.min(maxSize, size));
}

function truncate(s, max) {
  const a = [...s];
  return a.length > max ? a.slice(0, max - 1).join('') + '…' : s;
}

async function rasterize(svg) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter', sansSerifFamily: 'Inter' },
    shapeRendering: 2,
    textRendering: 1,
  }).render().asPng();
  return sharp(png).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
}

/**
 * One creator: identity and headline number on the left, their card on the
 * right. `data` is loadCardData() output.
 */
export async function renderCreatorShare(raw) {
  const data = await prepCard(raw);
  const p = CARD_PLATFORMS[data.platform] || CARD_PLATFORMS.youtube;
  const tier = cardTier(data.rank, data.total);
  const left = 72, colW = 600;

  const eyebrow = data.rank && data.total
    ? `${tier.name} · #${data.rank.toLocaleString('en-US')} of ${data.total.toLocaleString('en-US')} on ${p.name}`
    : `${tier.name} · ${p.name}`;
  const name = truncate(data.name, 26);
  const nameSize = fitSize(name, colW, 78, 44);
  // Under 10M the exact figure fits and lands harder (103,430 beats 103K).
  const count = data.count === null || data.count === undefined ? null
    : data.count < 10_000_000 ? Math.round(data.count).toLocaleString('en-US') : compactCount(data.count);
  const countSize = count ? fitSize(count, colW, 112, 64, 0.6) : 0;
  const unit = p.unit.toUpperCase();
  const delta = typeof data.delta30 === 'number' && data.delta30 !== 0
    ? `${data.delta30 > 0 ? '+' : '−'}${compactCount(data.delta30)} in the last 30 days`
    : null;
  const deltaColor = (data.delta30 ?? 0) >= 0 ? '#34D399' : '#F87171';
  const path = `shinypull.com/${data.platform}/${data.username}`;

  // Vertical rhythm, anchored so the block sits centered whether or not the
  // delta line is present.
  let y = delta ? 190 : 214;
  let text = `<text x="${left}" y="${y}" font-family="${BODY}" font-size="19" font-weight="700" letter-spacing="3.2" fill="${tier.a}">${esc(eyebrow.toUpperCase())}</text>`;
  y += 26 + nameSize * 0.9;
  text += `<text x="${left - 3}" y="${y.toFixed(0)}" font-family="${DISPLAY}" font-size="${nameSize}" font-weight="700" letter-spacing="-1.5" fill="#fff">${esc(name)}</text>`;
  if (count) {
    y += Math.round(countSize * 1.08);
    text += `<defs><linearGradient id="num" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tier.b}"/><stop offset="1" stop-color="${tier.a}"/></linearGradient></defs>`;
    text += `<text x="${left - 4}" y="${y}" font-family="${BODY}" font-size="${countSize}" font-weight="700" letter-spacing="-4" fill="url(#num)">${esc(count)}</text>`;
    y += 42;
    text += `<text x="${left}" y="${y}" font-family="${BODY}" font-size="21" font-weight="700" letter-spacing="3.5" fill="#d4d4d8">${esc(unit)}</text>`;
  }
  if (delta) {
    y += 52;
    // Drawn arrow: the fonts have no triangle glyph.
    const tri = data.delta30 > 0
      ? `${left},${y - 4} ${left + 20},${y - 4} ${left + 10},${y - 21}`
      : `${left},${y - 21} ${left + 20},${y - 21} ${left + 10},${y - 4}`;
    text += `<polygon points="${tri}" fill="${deltaColor}"/><text x="${left + 32}" y="${y}" font-family="${BODY}" font-size="26" font-weight="600" fill="${deltaColor}">${esc(delta)}</text>`;
  }
  const footer = `<text x="${left}" y="${H - 58}" font-family="${BODY}" font-size="21" font-weight="600" fill="#8a8a93">${esc(truncate(path, 52))}</text>`;

  const card = placeCard(cardMarkup(data, 0, true), { cx: 948, cy: H / 2, height: 520 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${background()}
${lockup(left, 58)}
${text}
${footer}
${card}
</svg>`;
  return rasterize(svg);
}

// Hand layouts, left-to-right slots. The first card passed is the headliner:
// center and on top when there are three, front when there are two.
function hand(count) {
  if (count === 1) return [{ dx: 0, angle: 0, top: true }];
  if (count === 2) return [{ dx: 70, angle: 7, top: true }, { dx: -80, angle: -7 }];
  if (count === 3) return [{ dx: 0, angle: 0, top: true }, { dx: -128, angle: -10 }, { dx: 128, angle: 10 }];
  // Four (the rarity fan): no headliner, drawn left to right, all tilted.
  return [{ dx: -162, angle: -14 }, { dx: -54, angle: -5 }, { dx: 54, angle: 5 }, { dx: 162, angle: 14 }];
}

/**
 * A page preview: eyebrow, headline lines and a subline on the left, a fanned
 * hand of cards on the right.
 */
export async function renderPageShare({ eyebrow, headline, sub, accent = '#a5b4fc', cards = [], footer = 'shinypull.com' }) {
  const prepared = await Promise.all(cards.map(prepCard));
  const left = 72;
  const slots = hand(prepared.length);
  const cx = prepared.length === 1 ? 930 : prepared.length === 4 ? 880 : 872;
  const height = prepared.length === 1 ? 500 : prepared.length === 4 ? 330 : 420;

  // Paint back to front: supporting cards, then the headliner.
  const order = prepared.map((_, i) => i).sort((a, b) => (slots[a].top ? 1 : 0) - (slots[b].top ? 1 : 0));
  const hands = order.map((i) => {
    const s = slots[i];
    return placeCard(cardMarkup(prepared[i], i, s.angle === 0), { cx: cx + s.dx, cy: H / 2 + 12 + Math.abs(s.angle) * 1.5, height, angle: s.angle });
  }).join('\n');

  const lines = headline.map((l) => truncate(l, 22));
  const size = Math.min(...lines.map((l) => fitSize(l, 560, 70, 44)));
  let y = 316 - (lines.length - 1) * size * 0.55;
  let text = `<text x="${left}" y="${y - size - 12}" font-family="${BODY}" font-size="19" font-weight="700" letter-spacing="3.2" fill="${accent}">${esc(eyebrow.toUpperCase())}</text>`;
  lines.forEach((l, i) => {
    text += `<text x="${left - 3}" y="${(y + i * size * 1.08).toFixed(0)}" font-family="${DISPLAY}" font-size="${size}" font-weight="700" letter-spacing="-1.8" fill="#fff">${esc(l)}</text>`;
  });
  y += (lines.length - 1) * size * 1.08 + 58;
  // The subline shrinks to stay clear of the hand (which starts near x=560).
  if (sub) text += `<text x="${left}" y="${y.toFixed(0)}" font-family="${BODY}" font-size="${fitSize(sub, 460, 25, 19, 0.52)}" font-weight="600" fill="#b4b4bc">${esc(truncate(sub, 46))}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${background()}
${hands}
${lockup(left, 58)}
${text}
<text x="${left}" y="${H - 58}" font-family="${BODY}" font-size="21" font-weight="600" fill="#8a8a93">${esc(footer)}</text>
</svg>`;
  return rasterize(svg);
}
