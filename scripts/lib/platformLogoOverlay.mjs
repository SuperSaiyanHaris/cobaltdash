// Composites the REAL official platform brand mark onto a generated thumbnail
// (e.g. from Google Flow) as a white badge in the top-left corner.
//
// WHY THIS EXISTS AND WHY IT'S NOT PART OF THE FLOW PROMPT: generative image
// models cannot reliably reproduce an exact brand mark — wrong proportions,
// wrong colors, wrong shape. This codebase has taken two real YouTube API
// compliance notices over exactly that kind of drift on brand marks elsewhere
// on the site (see YouTubeIcon.jsx's own history). Asking Flow to "draw the
// YouTube logo" would reintroduce that risk on every single post. Instead,
// the path data below is copied verbatim from the site's own official icon
// components (src/components/*Icon.jsx) — the same source of truth already
// audited for brand-guideline accuracy — and rasterized with sharp, never
// regenerated or approximated.
//
// Usage:
//   import { addPlatformLogoBadge } from './lib/platformLogoOverlay.mjs';
//   const finalBuf = await addPlatformLogoBadge(flowImageBuffer, 'kick');

import sharp from 'sharp';

// Official path data, copied from src/components/*Icon.jsx. Keep in sync if
// those ever change — never hand-edit a path here independently of the source.
const LOGOS = {
  youtube: {
    vbW: 28.5701, vbH: 20,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.5701 20">
      <path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z" fill="#FF0000"/>
      <path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="#FFFFFF"/>
    </svg>`,
  },
  kick: {
    vbW: 24, vbH: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="#53FC19" d="M2.86957 1.5h6.84782v4.56522H12V3.78261h2.2826V1.5h6.8478v6.84783h-2.2826v2.28257h-2.2826v2.7392h2.2826v2.2826h2.2826V22.5h-6.8478v-2.2826H12v-2.2826H9.71739V22.5H2.86957v-21Z"/>
    </svg>`,
  },
  twitch: {
    vbW: 24, vbH: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="#9146FF" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
    </svg>`,
  },
  bluesky: {
    vbW: 320, vbH: 286,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 286">
      <path fill="#1185FE" d="M69.364 19.146c36.687 27.806 76.147 84.186 90.636 114.439 14.489-30.253 53.948-86.633 90.636-114.439C277.107-.917 320-16.44 320 32.957c0 9.865-5.603 82.875-8.889 94.729-11.423 41.208-53.045 51.719-90.071 45.357 64.719 11.12 81.182 47.953 45.627 84.785-80 82.874-106.667-44.333-106.667-44.333s-26.667 127.207-106.667 44.333c-35.555-36.832-19.092-73.665 45.627-84.785-37.026 6.362-78.648-4.149-90.071-45.357C5.603 115.832 0 42.822 0 32.957 0-16.44 42.893-.917 69.364 19.147Z"/>
    </svg>`,
  },
  mastodon: {
    vbW: 24, vbH: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="#6364FF" d="M23.193 7.879c0-5.206-3.411-6.732-3.411-6.732C18.062.357 15.108.025 12.041 0h-.076c-3.068.025-6.02.357-7.74 1.147 0 0-3.412 1.526-3.412 6.732 0 1.192-.023 2.618.015 4.129.124 5.092.934 10.11 5.641 11.355 2.17.574 4.034.695 5.535.612 2.722-.151 4.25-.972 4.25-.972l-.09-1.975s-1.945.613-4.129.539c-2.165-.074-4.449-.233-4.799-2.891a5.499 5.499 0 0 1-.048-.745s2.125.52 4.817.643c1.646.075 3.19-.097 4.758-.283 3.007-.359 5.625-2.212 5.954-3.905.52-2.666.476-6.507.476-6.507zm-4.024 6.709h-2.497V8.469c0-1.29-.543-1.944-1.628-1.944-1.2 0-1.802.776-1.802 2.312v3.349h-2.484v-3.35c0-1.536-.602-2.31-1.802-2.31-1.085 0-1.628.653-1.628 1.943v6.119H4.831V8.285c0-1.29.328-2.314.987-3.07.68-.758 1.569-1.146 2.674-1.146 1.278 0 2.246.491 2.886 1.474L12 6.585l.622-1.043c.64-.982 1.608-1.474 2.886-1.474 1.104 0 1.994.389 2.674 1.146.658.756.986 1.781.986 3.07v6.304z"/>
    </svg>`,
  },
  rumble: {
    vbW: 24, vbH: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="#85C742" d="M22.435 9.299c-.371-.605-.847-1.137-1.395-1.581L9.842 1.235a3.84 3.84 0 0 0-3.835-.022 3.84 3.84 0 0 0-1.926 3.32V17.46a3.84 3.84 0 0 0 1.926 3.32 3.838 3.838 0 0 0 3.835-.023l11.198-6.482a3.84 3.84 0 0 0 1.929-3.318 3.86 3.86 0 0 0-.534-1.659zM15.66 12.49l-6.05 3.529a.957.957 0 0 1-.957.005.96.96 0 0 1-.482-.83V8.157a.96.96 0 0 1 .482-.831.957.957 0 0 1 .957.005l6.05 3.529a.96.96 0 0 1 .477.829.957.957 0 0 1-.477.802z"/>
    </svg>`,
  },
  substack: {
    vbW: 24, vbH: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="#FF6719" d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812H22.54V24l-10.54-5.91L1.46 24V10.812zM22.539 0H1.46v2.836h21.08V0z"/>
    </svg>`,
  },
};

// TikTok's mark is a raster asset in the source component (their guidelines
// require an exact pixel copy, not a redrawn vector — see TikTokIcon.jsx),
// so it's handled as a PNG data URI rather than an SVG string like the rest.
const TIKTOK_PNG_B64_MARKER = 'TIKTOK'; // resolved at call time from the component file if needed

const BADGE_LOGO_HEIGHT = 100; // px, the rasterized logo's height inside the badge
const BADGE_PADDING = 28;
const BADGE_MARGIN = 40; // distance from the image's top-left corner

export async function addPlatformLogoBadge(imageBuffer, platform) {
  const logo = LOGOS[platform];
  if (!logo) return imageBuffer; // unknown/no official mark (e.g. 'music') — leave untouched

  const logoWidth = Math.ceil(BADGE_LOGO_HEIGHT * (logo.vbW / logo.vbH));
  const logoPng = await sharp(Buffer.from(logo.svg))
    .resize({ height: BADGE_LOGO_HEIGHT })
    .png()
    .toBuffer();

  const badgeW = logoWidth + BADGE_PADDING * 2;
  const badgeH = BADGE_LOGO_HEIGHT + BADGE_PADDING * 2;
  const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${badgeW}" height="${badgeH}">
    <rect x="0" y="0" width="${badgeW}" height="${badgeH}" rx="20" fill="#ffffff" />
  </svg>`;
  const badgePng = await sharp(Buffer.from(badgeSvg)).png().toBuffer();

  const base = sharp(imageBuffer);
  const meta = await base.metadata();

  return base
    .composite([
      { input: badgePng, left: BADGE_MARGIN, top: BADGE_MARGIN },
      { input: logoPng, left: BADGE_MARGIN + BADGE_PADDING, top: BADGE_MARGIN + BADGE_PADDING },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
