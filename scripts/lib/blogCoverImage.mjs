// Generates a branded, YouTube-thumbnail-grade blog cover entirely in-house via
// @vercel/og (Satori + resvg), the same renderer api/og.js already uses for creator
// OG cards. No stock photography, no licensing/attribution to track.
//
// Fonts are the site's real ones (Inter, Space Grotesk), fetched once and cached as
// local TTFs in scripts/assets/fonts/ so this never depends on a runtime font fetch
// succeeding (api/og.js's own comments document exactly why that's fragile).
//
// This is the LISTING-GRID / social-share design target: shown at full opacity on
// the blog listing page and in link previews, so it needs real visual weight, a big
// number, a platform logo, ideally a real creator avatar — the "whole nine yards" of
// an actual thumbnail, not a texture. (BlogPost.jsx separately renders the same
// `image` at opacity-50 with mix-blend-luminosity behind the in-content cover block
// on the article page itself — that usage is secondary and just inherits whatever
// this produces; don't design for it, design for the listing grid.)
//
// Usage:
//   import { renderBlogCover } from './lib/blogCoverImage.mjs';
//   const buf = await renderBlogCover({
//     accent: '#53fc18',        // platform/story accent color
//     platform: 'kick',         // 'youtube' | 'kick' | ... renders the official logo — optional
//     hook: 'KICK SUBS EXPLODE',// short bold caps phrase, 2-4 words
//     bigStat: '+433%',         // the single biggest real number from the post — optional
//     avatarUrl: 'https://...', // a real tracked creator's public avatar — optional
//   });

import { unstable_createNodejsStream } from '@vercel/og';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// Satori (the SVG renderer behind @vercel/og) only decodes PNG/JPEG, not the
// webp most avatar CDNs (Kick, several others) actually serve. Re-encode to
// PNG via sharp and hand satori a data URI instead of the raw remote URL.
async function avatarAsPngDataUri(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const png = await sharp(input).resize(352, 352, { fit: 'cover', position: 'top' }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

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

// Official brand mark path data, lifted directly from the live components
// (src/components/*Icon.jsx) so these render as the real logos, never a redraw.
const PLATFORM_LOGOS = {
  youtube: { viewBox: '0 0 28.5701 20', paths: [
    { d: 'M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z', fill: '#FF0000' },
    { d: 'M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z', fill: '#FFFFFF' },
  ]},
  kick: { viewBox: '0 0 24 24', paths: [
    { d: 'M2.86957 1.5h6.84782v4.56522H12V3.78261h2.2826V1.5h6.8478v6.84783h-2.2826v2.28257h-2.2826v2.7392h2.2826v2.2826h2.2826V22.5h-6.8478v-2.2826H12v-2.2826H9.71739V22.5H2.86957v-21Z', fill: '#53FC19' },
  ]},
};

function PlatformLogo({ platform, size = 96 }) {
  const logo = PLATFORM_LOGOS[platform];
  if (!logo) return null;
  const [, , vbW, vbH] = logo.viewBox.split(' ').map(Number);
  const height = size;
  const width = size * (vbW / vbH);
  return h('svg', { width, height, viewBox: logo.viewBox, style: { display: 'flex' } },
    ...logo.paths.map((p, i) => h('path', { key: i, d: p.d, fill: p.fill }))
  );
}

function BrandWordmark({ size = 30 }) {
  return h('div', { style: { display: 'flex', alignItems: 'center', fontFamily: 'Space Grotesk', fontSize: size, fontWeight: 700, letterSpacing: -0.5 } },
    h('span', { style: { color: '#f5f5f4' } }, 'Shiny'),
    h('span', { style: { color: '#a3a3a3' } }, 'Pull'),
  );
}

// The site's established dot-grid texture (.hero-dot-grid), reused here instead of
// inventing a new pattern, kept faint so it reads as texture under the bold text.
function DotGrid({ color, opacity = 0.14 }) {
  const cols = 30, rows = 16, spacing = 40;
  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(h('div', {
        key: `${r}-${c}`,
        style: { position: 'absolute', left: c * spacing, top: r * spacing, width: 3, height: 3, borderRadius: 2, backgroundColor: color, opacity, display: 'flex' },
      }));
    }
  }
  return h('div', { style: { position: 'absolute', inset: 0, display: 'flex' } }, ...dots);
}

function bigStatFontSize(stat) {
  const len = (stat || '').length;
  if (len <= 4) return 128;
  if (len <= 6) return 100;
  if (len <= 8) return 78;
  return 60;
}

function CoverElement({ accent, platform, hook, bigStat, avatarUrl }) {
  return h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'row',
      backgroundColor: '#0a0a0f',
    },
  },
    // Left panel — dark, holds the platform badge + bold hook text
    h('div', {
      style: {
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        width: 700, height: '100%', padding: '52px 56px', position: 'relative', overflow: 'hidden',
      },
    },
      h(DotGrid, { color: '#ffffff' }),
      h('div', { style: { display: 'flex', width: '100%', height: 8, backgroundColor: accent, position: 'absolute', top: 0, left: 0 } }),

      h('div', { style: { display: 'flex', flexDirection: 'column', position: 'relative', marginTop: 24 } },
        platform && PLATFORM_LOGOS[platform]
          ? h('div', {
              style: {
                display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)',
                padding: '14px 22px', borderRadius: 16, marginBottom: 32, alignSelf: 'flex-start',
              },
            }, h(PlatformLogo, { platform, size: 40 }))
          : null,
        hook
          ? h('div', {
              style: {
                fontFamily: 'Space Grotesk',
                fontWeight: 700,
                fontSize: hook.length > 22 ? 58 : 72,
                lineHeight: 1.08,
                letterSpacing: -1,
                color: '#f5f5f4',
                textTransform: 'uppercase',
                display: 'flex',
                maxWidth: 560,
              },
            }, hook)
          : null
      ),

      h('div', { style: { display: 'flex', position: 'relative' } }, h(BrandWordmark))
    ),

    // Right panel — solid accent block, the bold graphic focal point
    h('div', {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        flex: 1, height: '100%', backgroundColor: accent, position: 'relative', padding: '0 40px',
      },
    },
      avatarUrl
        ? h('img', {
            src: avatarUrl, width: 168, height: 168,
            style: { borderRadius: 999, border: '6px solid #0a0a0f', objectFit: 'cover', marginBottom: 28, display: 'flex' },
          })
        : null,
      bigStat
        ? h('div', {
            style: {
              display: 'flex',
              backgroundColor: '#0a0a0f',
              padding: '18px 32px',
              borderRadius: 20,
              maxWidth: 420,
            },
          },
            h('div', {
              style: {
                fontFamily: 'Space Grotesk',
                fontWeight: 700,
                fontSize: bigStatFontSize(bigStat),
                letterSpacing: -2,
                color: '#ffffff',
                display: 'flex',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              },
            }, bigStat)
          )
        : null,
      h('div', { style: { display: 'flex', position: 'absolute', right: 32, bottom: 28, fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'rgba(10,10,15,0.55)' } }, 'shinypull.com')
    )
  );
}

export async function renderBlogCover({ accent = '#6366f1', platform, hook, bigStat, avatarUrl }) {
  const avatarDataUri = await avatarAsPngDataUri(avatarUrl);
  const stream = await unstable_createNodejsStream(
    h(CoverElement, { accent, platform, hook, bigStat, avatarUrl: avatarDataUri }),
    { ...SIZE, fonts: FONTS }
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
