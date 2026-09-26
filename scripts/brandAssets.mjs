// Generates every file that carries the ShinyPull mark (the card-frame mark:
// three rising bars inside a foil-edged card). Run after changing the mark:
//   node scripts/brandAssets.mjs [extrasDir]
// Writes public/favicon.svg, public/logo-mark.svg, public/logo.png (512,
// transparent, used as the Organization logo in structured data) and
// public/apple-touch-icon.png (180, dark full-bleed so iOS rounding looks
// right). With extrasDir it also writes a pack for use off-site: X avatar,
// transparent mark PNGs and horizontal lockups on dark and light.
//
// The header/footer wordmark ("ShinyPu" + two animated purple bars) is a
// separate asset and deliberately not touched here.
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

import { markSvgInner } from '../src/lib/brandMark.js';

const FONTS = ['Inter-Bold.ttf'].map((f) => fileURLToPath(new URL(`./assets/fonts/${f}`, import.meta.url)));

const markFile = (title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${title ? ' role="img" aria-label="ShinyPull"' : ''}>${title ? '<title>ShinyPull</title>' : ''}
${markSvgInner()}
</svg>
`;

function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
}

// Mark centered on a square, `scale` = mark height as a share of the side.
function squareSvg(size, scale, bg) {
  const m = size * scale;
  const off = (size - m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}<g transform="translate(${off} ${off}) scale(${m / 100})">${markSvgInner()}</g></svg>`;
}

// Mark + the site wordmark ("ShinyPu" + two purple bars), like the header.
function lockupSvg(dark) {
  const W = 1200, H = 300;
  const ink = dark ? '#ffffff' : '#171717';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
${dark ? `<rect width="${W}" height="${H}" fill="#0a0a0f"/>` : ''}
<defs><linearGradient id="bars" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#a855f7"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs>
<g transform="translate(90 60) scale(1.8)">${markSvgInner('lk')}</g>
<g transform="translate(300 64)">
<text x="0" y="132" font-family="Inter" font-size="136" font-weight="700" letter-spacing="-6" fill="${ink}">ShinyPu</text>
<rect x="532" y="52" width="26" height="80" rx="8" fill="url(#bars)"/>
<rect x="570" y="28" width="26" height="104" rx="8" fill="url(#bars)"/>
</g>
</svg>`;
}

writeFileSync('public/favicon.svg', markFile(false));
writeFileSync('public/logo-mark.svg', markFile(true));
writeFileSync('public/logo.png', await sharp(png(squareSvg(512, 0.86), 512)).png().toBuffer());
writeFileSync('public/apple-touch-icon.png', await sharp(png(squareSvg(180, 0.72, '#0a0a0f'), 180)).png().toBuffer());
// The card back (flip animations on Home, sign-in, 404) embeds the mark
// between <!--brand-mark--> markers; swap it in place.
const back = readFileSync('public/card-back.svg', 'utf8');
writeFileSync('public/card-back.svg', back.replace(
  /(<!--brand-mark--><g transform="[^"]*">)[\s\S]*?(<\/g><!--\/brand-mark-->)/,
  (_, open, close) => `${open}${markSvgInner('bk')}${close}`,
));
console.log('public/: favicon.svg, logo-mark.svg, logo.png, apple-touch-icon.png, card-back.svg');

const extras = process.argv[2];
if (extras) {
  mkdirSync(extras, { recursive: true });
  writeFileSync(`${extras}/shinypull-mark.svg`, markFile(true));
  writeFileSync(`${extras}/shinypull-mark-1024.png`, png(squareSvg(1024, 0.9), 1024));
  // Circle-safe: X and most platforms crop avatars to a circle.
  writeFileSync(`${extras}/shinypull-avatar-1000.png`, png(squareSvg(1000, 0.62, '#0a0a0f'), 1000));
  writeFileSync(`${extras}/shinypull-lockup-dark.png`, png(lockupSvg(true), 1200));
  writeFileSync(`${extras}/shinypull-lockup-light.png`, png(lockupSvg(false), 1200));
  console.log(`${extras}/: mark svg + 1024 png, avatar 1000, lockups dark/light`);
}
