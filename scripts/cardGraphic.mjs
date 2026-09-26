// Social / blog-cover graphics built from creators' live holographic cards.
//
//   node scripts/cardGraphic.mjs --creator kick/odablock \
//     --kicker "KICK RECORD" --headline "100K PAID|SUBS" --sub "#1 of 3,621 on Kick" \
//     --layout wide --out cover.jpg
//
// Layouts:
//   wide   1600x900, text left, card(s) right. Blog covers and X posts.
//   square 1080x1080, text top, card(s) below. X replies on mobile-heavy threads.
//   card   just the card, 1000x1400 PNG.
//
// One creator: upright card with its platform logo. Two or three: a fanned
// hand, rendered markless (?mark=0) because rotated brand marks are not allowed.
// Background matches the site's dark bands: flat #0a0a0f plus a faint
// monochrome dot grid. No glows, no colored shadows.
//
// Headline: use "|" for a line break. Accent the line containing the big
// number with --accent (defaults to the card's rarity gold).

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { CARD_DESIGN_VERSION } from '../src/lib/cardUrl.js';

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const creators = args.flatMap((a, i) => (a === '--creator' ? [args[i + 1]] : []));
// No --creator is allowed for a text-only graphic (platform-trend stories).
if (!creators.length && !args.includes('--headline')) {
  console.error('Usage: node scripts/cardGraphic.mjs --creator platform/username [--creator ...] --headline "A|B" [--kicker K] [--sub S] [--layout wide|square|card] [--out file]');
  process.exit(1);
}
const layout = opt('layout', 'wide');
const out = opt('out', `${(creators[0] || 'graphic').replace('/', '-')}-${layout}.${layout === 'card' ? 'png' : 'jpg'}`);
const kicker = opt('kicker', '');
const headline = opt('headline', '');
const sub = opt('sub', '');
const accent = opt('accent', '#fcd34d');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The card embeds its avatar as a data: URI. librsvg (inside sharp) cannot
// decode WebP, which is what Kick and some others serve, so the photo would
// render blank. Re-encode every embedded WebP as PNG first.
async function fixEmbeddedWebp(svg) {
  const re = /data:image\/webp;base64,([A-Za-z0-9+/=]+)/g;
  const found = [...svg.matchAll(re)];
  for (const m of found) {
    const png = await sharp(Buffer.from(m[1], 'base64')).png().toBuffer();
    svg = svg.replace(m[0], `data:image/png;base64,${png.toString('base64')}`);
  }
  return svg;
}

async function cardPng(slug, { mark, height }) {
  const [platform, ...rest] = slug.split('/');
  const username = rest.join('/');
  const url = `https://shinypull.com/card/${platform}/${encodeURIComponent(username)}?v=${CARD_DESIGN_VERSION}${mark ? '' : '&mark=0'}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`card ${slug}: HTTP ${res.status}`);
  const svg = await fixEmbeddedWebp(await res.text());
  const png = await sharp(Buffer.from(svg), { density: 300 }).png().toBuffer();
  return sharp(png).resize({ height }).png().toBuffer();
}

function background(w, h) {
  // Flat base + faint dot grid, fading toward the bottom like hero-dot-grid.
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <pattern id="d" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="14" cy="14" r="1.3" fill="#ffffff" fill-opacity="0.10"/>
      </pattern>
      <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0.25"/>
      </linearGradient>
      <mask id="m"><rect width="${w}" height="${h}" fill="url(#f)"/></mask>
    </defs>
    <rect width="${w}" height="${h}" fill="#0a0a0f"/>
    <rect width="${w}" height="${h}" fill="url(#d)" mask="url(#m)"/>
  </svg>`);
}

// Neutral black depth shadow under a card (never colored).
async function shadow(cardW, cardH) {
  const pad = 40;
  const r = Math.round(cardW * 0.064);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW + pad * 2}" height="${cardH + pad * 2}">
    <rect x="${pad}" y="${pad + 14}" width="${cardW}" height="${cardH}" rx="${r}" fill="#000" fill-opacity="0.7"/></svg>`;
  return sharp(Buffer.from(svg)).blur(18).png().toBuffer();
}

function textBlock({ x, y, width, align = 'start', headlineSize }) {
  const lines = headline ? headline.split('|') : [];
  const anchor = align === 'middle' ? 'middle' : 'start';
  const tx = align === 'middle' ? x + width / 2 : x;
  let cy = y;
  let svg = '';
  if (kicker) {
    svg += `<text x="${tx}" y="${cy}" text-anchor="${anchor}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="26" letter-spacing="5" fill="#a3a3a3">${esc(kicker.toUpperCase())}</text>`;
    cy += 30 + headlineSize * 0.95;
  } else {
    cy += headlineSize * 0.95;
  }
  // The line with a digit in it carries the number, so it gets the accent.
  lines.forEach((line, i) => {
    const fill = /\d/.test(line) ? accent : '#ffffff';
    svg += `<text x="${tx}" y="${cy}" text-anchor="${anchor}" font-family="Segoe UI Black, Segoe UI, Arial Black, Arial, sans-serif" font-weight="900" font-size="${headlineSize}" letter-spacing="-1" fill="${fill}">${esc(line.toUpperCase())}</text>`;
    if (i < lines.length - 1) cy += headlineSize * 1.02;
  });
  if (sub) {
    cy += 64;
    svg += `<text x="${tx}" y="${cy}" text-anchor="${anchor}" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="34" fill="#d4d4d4">${esc(sub)}</text>`;
  }
  return svg;
}

function wordmark(x, y) {
  return `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="24" letter-spacing="2" fill="#737373">SHINYPULL.COM</text>`;
}

// The first creator is the headliner: dead center and on top in a
// three-card hand, front card in a two-card hand. Slots run left to right.
function handSlots(count) {
  if (count === 1) return [{ slot: 0, angle: 0 }];
  if (count === 2) return [{ slot: 1, angle: 7 }, { slot: 0, angle: -7 }];
  return [{ slot: 1, angle: 0 }, { slot: 0, angle: -10 }, { slot: 2, angle: 10 }];
}

async function placeCards(slugs, { cx, cy, height }) {
  const layers = [];
  const single = slugs.length === 1;
  const slots = handSlots(slugs.length);
  const spread = single ? 0 : height * 0.3;
  // Paint back to front: every supporting card first, the headliner last.
  const order = slugs.map((_, i) => i).slice(1).concat(0);
  for (const i of order) {
    const { slot, angle } = slots[i];
    // Upright cards keep the platform logo; rotated ones must be markless.
    let png = await cardPng(slugs[i], { mark: angle === 0, height });
    const meta = await sharp(png).metadata();
    const sh = await shadow(meta.width, meta.height);
    let shPng = sh;
    if (angle) {
      png = await sharp(png).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      shPng = await sharp(sh).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
    const m = await sharp(png).metadata();
    const s = await sharp(shPng).metadata();
    const offsetX = (slot - (slugs.length - 1) / 2) * spread;
    const offsetY = angle ? Math.abs(angle) * 2 : 0;
    layers.push({ input: shPng, left: Math.round(cx + offsetX - s.width / 2), top: Math.round(cy + offsetY - s.height / 2) });
    layers.push({ input: png, left: Math.round(cx + offsetX - m.width / 2), top: Math.round(cy + offsetY - m.height / 2) });
  }
  return layers;
}

async function main() {
  if (layout === 'card') {
    const png = await cardPng(creators[0], { mark: true, height: 1400 });
    writeFileSync(out, png);
    console.log(`wrote ${out}`);
    return;
  }

  const W = layout === 'square' || layout === 'pull' ? 1080 : 1600;
  const H = layout === 'square' || layout === 'pull' ? 1080 : 900;
  let text;
  let cards = [];
  if (layout === 'pull') {
    // Reply image: the card is the whole point, big and centered, like a
    // pull you just opened. Optional small kicker on top, no headline.
    text = kicker ? `<text x="${W / 2}" y="78" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="30" letter-spacing="6" fill="#a3a3a3">${esc(kicker.toUpperCase())}</text>` : '';
    cards = await placeCards(creators, { cx: W / 2, cy: H / 2 + 22, height: creators.length === 1 ? 900 : 820 });
  } else if (!creators.length) {
    text = textBlock({ x: 80, y: layout === 'square' ? 330 : 250, width: W - 160, align: 'middle', headlineSize: layout === 'square' ? 110 : 132 });
  } else if (layout === 'square') {
    text = textBlock({ x: 60, y: 70, width: W - 120, align: 'middle', headlineSize: 92 });
    cards = await placeCards(creators, { cx: W / 2, cy: 720, height: 540 });
  } else {
    text = textBlock({ x: 96, y: 250, width: 800, align: 'start', headlineSize: 118 });
    const single = creators.length === 1;
    cards = await placeCards(creators, { cx: single ? 1210 : 1110, cy: H / 2 + 10, height: single ? 700 : 640 });
  }
  const mark = layout === 'pull' ? '' : wordmark(layout === 'square' ? 60 : 96, H - 56);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${text}${mark}</svg>`);

  const img = await sharp(background(W, H))
    .composite([...cards, { input: overlay, left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
  writeFileSync(out, img);
  console.log(`wrote ${out} (${W}x${H}, ${Math.round(img.length / 1024)} KB)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
