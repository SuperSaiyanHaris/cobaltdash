// Home page ShinyPass promo art: a straight, product-screenshot style panel
// of the /pass screen (your card, level, XP bar, track tiles, next pack and a
// level-up toast), written as static SVGs at build so the home page loads no
// pass code. Desktop and phone versions, each with a still twin for reduced
// motion. Called by scripts/generateOgImages.mjs.
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { renderUserCard } from '../src/lib/userCard.js';
import { renderPack } from '../src/lib/packArt.js';
import { PACK_BY_KEY } from '../src/lib/shinyPass.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
const FOIL = ['#7DF9FF', '#B69CFF', '#FF7AD9'];

const nest = (svg, x, y, w, h) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
const text = (x, y, size, weight, fill, str, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${str}</text>`;

function card(uid, still) {
  return renderUserCard({
    uid, still, level: 76, handle: 'you', into: 120, need: 197, xp: 9120, streak: 23, season: 1,
    equipped: { frame: 'holo', effect: 'holo', ring: 'prism', title: 'bigpull', sticker: 'onfire', name: 'prism' },
  });
}

function panel(w, h, r, id) {
  return `<defs>
<clipPath id="${id}clip"><rect width="${w}" height="${h}" rx="${r}"/></clipPath>
<pattern id="${id}dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#fff" fill-opacity=".07"/></pattern>
</defs>
<rect width="${w}" height="${h}" rx="${r}" fill="#0a0a0f"/>
<rect width="${w}" height="${h}" rx="${r}" fill="url(#${id}dots)" clip-path="url(#${id}clip)"/>`;
}

// Level box + tier title row.
function levelRow(x, y) {
  return `<rect x="${x}" y="${y}" width="64" height="64" rx="12" fill="#fff"/>
${text(x + 32, y + 20, 11, 800, '#0a0a0f', 'LV', ' text-anchor="middle" letter-spacing="1.5"')}
${text(x + 32, y + 54, 30, 900, '#0a0a0f', '76', ' text-anchor="middle" font-style="italic"')}
${text(x + 80, y + 20, 11, 800, '#ffffff', 'SEASON 1', ' fill-opacity=".55" letter-spacing="2"')}
${text(x + 80, y + 46, 22, 800, '#ffffff', 'Legendary card')}
${text(x + 80, y + 64, 12, 600, '#ffffff', '23-day streak', ' fill-opacity=".6"')}`;
}

// Ten-segment XP bar, 6.1 of 10 filled.
function xpBar(id, x, y, w) {
  const gap = 3, seg = (w - gap * 9) / 10;
  let out = `<defs><linearGradient id="${id}xp" gradientUnits="userSpaceOnUse" x1="${x}" y1="0" x2="${x + w}" y2="0"><stop offset="0" stop-color="${FOIL[0]}"/><stop offset=".5" stop-color="${FOIL[1]}"/><stop offset="1" stop-color="${FOIL[2]}"/></linearGradient></defs>`;
  for (let i = 0; i < 10; i++) {
    const sx = x + i * (seg + gap);
    out += `<rect x="${sx.toFixed(1)}" y="${y}" width="${seg.toFixed(1)}" height="10" rx="2" fill="#fff" fill-opacity=".12"/>`;
    const fill = i < 6 ? 1 : i === 6 ? 0.1 : 0;
    if (fill) out += `<rect x="${sx.toFixed(1)}" y="${y}" width="${(seg * fill).toFixed(1)}" height="10" rx="2" fill="url(#${id}xp)"/>`;
  }
  out += text(x, y + 28, 12, 600, '#ffffff', '120 / 197 XP', ' fill-opacity=".7"');
  out += text(x + w, y + 28, 12, 600, '#ffffff', 'Level 77', ' fill-opacity=".5" text-anchor="end"');
  return out;
}

function tiles(id, x, y) {
  const check = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="8" fill="#22C55E"/><path d="M${cx - 3.5} ${cy}l2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const glyphs = [
    (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="url(#${id}xp)" stroke-width="5"/>`,
    (cx, cy) => `<rect x="${cx - 16}" y="${cy - 9}" width="32" height="18" rx="6" fill="#E4E4E7"/>${text(cx, cy + 5, 11, 900, '#18181B', 'GG', ' text-anchor="middle"')}`,
    (cx, cy) => text(cx, cy + 8, 22, 900, '#ffffff', 'Aa', ' text-anchor="middle" font-style="italic"'),
    (cx, cy) => `<rect x="${cx - 11}" y="${cy - 15}" width="22" height="30" rx="3" fill="#FFD76A"/><rect x="${cx - 7}" y="${cy - 11}" width="14" height="22" rx="2" fill="#0a0a0f"/>`,
    (cx, cy) => `<rect x="${cx - 11}" y="${cy - 15}" width="22" height="30" rx="3" fill="url(#${id}xp)"/>`,
  ];
  let out = '';
  [72, 73, 74, 75, 76].forEach((lv, i) => {
    const tx = x + i * 68, cx = tx + 29, now = lv === 76;
    out += `<rect x="${tx}" y="${y}" width="58" height="84" rx="10" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity="${now ? 1 : 0.1}" stroke-width="${now ? 2 : 1}"/>`;
    out += glyphs[i](cx, y + 36);
    out += text(cx, y + 74, 10, 800, '#ffffff', String(lv), ' text-anchor="middle" fill-opacity=".75"');
    if (now) out += `<rect x="${cx - 18}" y="${y - 9}" width="36" height="16" rx="4" fill="#fff"/>${text(cx, y + 3, 9, 900, '#0a0a0f', 'NOW', ' text-anchor="middle" letter-spacing="1"')}`;
    else out += check(tx + 52, y + 6);
  });
  return out;
}

function nextPack(x, y, w) {
  const pack = nest(renderPack(PACK_BY_KEY.mythic, { still: true, fit: true, uid: 'promomy' }), x + 16, y + 7, 66, 106);
  return `<rect x="${x}" y="${y}" width="${w}" height="120" rx="16" fill="#fff" fill-opacity=".04" stroke="#fff" stroke-opacity=".1"/>
${pack}
${text(x + 100, y + 36, 11, 800, '#ffffff', 'NEXT PACK', ' fill-opacity=".55" letter-spacing="2"')}
${text(x + 100, y + 68, 28, 900, '#ffffff', 'Mythic')}
${text(x + 100, y + 92, 13, 600, '#ffffff', '4 items · level 90', ' fill-opacity=".7"')}
${text(x + 100, y + 110, 12, 700, '#B69CFF', '14 levels to go')}`;
}

function toast(id, x, y, w, h) {
  const r = h / 2, cy = y + r;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff"/>
<circle cx="${x + r}" cy="${cy}" r="${r - 8}" fill="url(#${id}xp)"/>
<path d="M${x + r - 5} ${cy + 2}l5-5 5 5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
${text(x + h + 4, cy + 5, 14, 800, '#0a0a0f', 'Level 75! Your card turned Legendary')}`;
}

function desktop(still) {
  const id = still ? 'pds' : 'pd';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 540" width="760" height="540">
${panel(760, 540, 28, id)}
${nest(card(`${id}c`, still), 40, 60, 300, 420)}
${levelRow(388, 60)}
${xpBar(id, 388, 146, 332)}
${tiles(id, 388, 206)}
${nextPack(388, 306, 332)}
${toast(id, 388, 436, 332, 44)}
</svg>`;
}

function mobile(still) {
  const id = still ? 'pms' : 'pm';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" width="400" height="560">
${panel(400, 560, 24, id)}
${nest(card(`${id}c`, still), 75, 28, 250, 350)}
${levelRow(24, 396)}
${xpBar(id, 24, 472, 352)}
${toast(id, 24, 506, 352, 40)}
</svg>`;
}

export function writePassPromo() {
  mkdirSync('public/pass', { recursive: true });
  writeFileSync('public/pass/promo-pass.svg', desktop(false));
  writeFileSync('public/pass/promo-pass-still.svg', desktop(true));
  writeFileSync('public/pass/promo-pass-m.svg', mobile(false));
  writeFileSync('public/pass/promo-pass-m-still.svg', mobile(true));
  rmSync('public/pass/promo-packs.svg', { force: true });
  console.log('  public/pass/promo-pass*.svg');
}
