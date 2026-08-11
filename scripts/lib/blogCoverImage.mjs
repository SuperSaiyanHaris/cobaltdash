// Generates a branded blog cover image entirely in-house via @vercel/og (Satori + resvg),
// the same renderer api/og.js already uses for creator OG cards. No stock photography,
// no licensing/attribution to track, no risk of an off-topic or copyright-murky image.
//
// Fonts are the site's real ones (Inter, Space Grotesk), fetched once and cached as local
// TTFs in scripts/assets/fonts/ so this never depends on a runtime font fetch succeeding
// (api/og.js's own comments document exactly why a runtime font fetch is fragile).
//
// DELIBERATELY TEXT-FREE. BlogPost.jsx renders `post.image` at opacity-50 with a
// mix-blend-luminosity filter under a dark scrim (see the hero block there) — it's
// decorative texture behind the category gradient, not a legible card, and the
// in-content {{html}} cover block already renders the real headline crisply just
// below it. Baking the headline into this image too would (a) be unreadable at
// that opacity/blend and (b) duplicate the in-content headline right underneath it.
// Keep this to a flat accent-tinted gradient + top accent bar + small wordmark,
// matching the diagonal-gradient language already used inside blog cover blocks
// (e.g. `linear-gradient(160deg,#0a1a08 0%,#0a0a0f 65%)` in recent posts) — never a
// radial/blurred "glow blob", per the site's hard no-orbs rule.
//
// Usage:
//   import { renderBlogCover } from './lib/blogCoverImage.mjs';
//   const pngBuffer = await renderBlogCover({ accent: '#53fc18' }); // platform/story accent color

import { unstable_createNodejsStream } from '@vercel/og';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const h = React.createElement;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const fontData = {
  interSemiBold: fs.readFileSync(path.join(FONT_DIR, 'Inter-SemiBold.ttf')),
  interBold: fs.readFileSync(path.join(FONT_DIR, 'Inter-Bold.ttf')),
  spaceGroteskBold: fs.readFileSync(path.join(FONT_DIR, 'SpaceGrotesk-Bold.ttf')),
};

const FONTS = [
  { name: 'Inter', data: fontData.interSemiBold, weight: 600, style: 'normal' },
  { name: 'Inter', data: fontData.interBold, weight: 800, style: 'normal' },
  { name: 'Space Grotesk', data: fontData.spaceGroteskBold, weight: 700, style: 'normal' },
];

const SIZE = { width: 1200, height: 630 };

function BrandWordmark() {
  return h('div', { style: { display: 'flex', alignItems: 'center', fontFamily: 'Space Grotesk', fontSize: 34, fontWeight: 700, letterSpacing: -0.5 } },
    h('span', { style: { color: '#f5f5f4' } }, 'Shiny'),
    h('span', { style: { color: '#a3a3a3' } }, 'Pull'),
  );
}

// A grid of small dots in the accent color, echoing the site's established
// .hero-dot-grid / .hero-dot-grid-light texture (index.css) used on the home
// hero and creator-profile banners. Reusing that exact visual language here
// instead of inventing a new pattern per post.
function DotGrid({ accent }) {
  const cols = 30;
  const rows = 16;
  const spacing = 40;
  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(
        h('div', {
          key: `${r}-${c}`,
          style: {
            position: 'absolute',
            left: c * spacing,
            top: r * spacing,
            width: 3,
            height: 3,
            borderRadius: 2,
            backgroundColor: accent,
            opacity: 0.35,
            display: 'flex',
          },
        })
      );
    }
  }
  return h('div', { style: { position: 'absolute', inset: 0, display: 'flex' } }, ...dots);
}

function CoverElement({ accent }) {
  return h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: `linear-gradient(155deg, ${accent}2e 0%, #0a0a0f 60%)`,
      backgroundColor: '#0a0a0f',
      position: 'relative',
    },
  },
    h(DotGrid, { accent }),
    // Top accent bar
    h('div', { style: { display: 'flex', width: '100%', height: 8, backgroundColor: accent, position: 'relative' } }),
    // Bottom-left wordmark
    h('div', { style: { display: 'flex', position: 'absolute', left: 72, bottom: 56 } },
      h(BrandWordmark)
    )
  );
}

export async function renderBlogCover({ accent = '#6366f1' }) {
  const stream = await unstable_createNodejsStream(
    h(CoverElement, { accent }),
    { ...SIZE, fonts: FONTS }
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
