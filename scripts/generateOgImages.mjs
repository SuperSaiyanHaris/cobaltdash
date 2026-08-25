/**
 * Generates the static Open Graph share cards in public/og/.
 * Run: node scripts/generateOgImages.mjs   (also runs in `npm run build`)
 *
 * WHY STATIC, AND WHY NOT api/og.js ANY MORE:
 * every page used to share one card generated at request time by api/og.js.
 * That card had drifted out of date (it advertised six platforms when we
 * support nine) and, being generic, told a reader nothing about the page they
 * were actually being sent to. It also cost one of Vercel Hobby's 12 Node
 * function slots, which this project sits exactly at.
 *
 * Each page now gets its own card, pre-rendered here and served as a plain
 * file from the CDN. api/og.js is intentionally LEFT IN THE REPO but no longer
 * routed to (see vercel.json) so per-creator stat cards can be restored by
 * putting the rewrite back; that file carries two hard-won fixes worth keeping
 * (a .jsx-vs-.js function discovery bug and an edge-vs-node runtime bug, both
 * of which shipped zero-byte blank previews to every social scraper).
 *
 * HOW THE TEXT IS RENDERED: satori converts text into real glyph PATHS using
 * the Inter / Space Grotesk files in scripts/assets/fonts. sharp's own SVG
 * renderer ignores @font-face (even with the font inlined as a base64 data
 * URI) and silently substitutes a system font, which is how the first attempt
 * ended up rendering in monospace. Do not swap satori out for a plain SVG
 * <text> layer.
 *
 * The backgrounds in scripts/assets/og-backgrounds are generated art, already
 * downscaled to the 1200px this pipeline needs. Re-running is deterministic,
 * so copy changes only require editing CARDS below.
 */
import satori from 'satori';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const W = 1200, H = 630;
const OUT = 'public/og';
const BG = 'scripts/assets/og-backgrounds';
const F = (p) => readFileSync(`scripts/assets/fonts/${p}`);
const FONTS = [
  { name: 'Inter', data: F('Inter-Bold.ttf'), weight: 700, style: 'normal' },
  { name: 'Inter', data: F('Inter-SemiBold.ttf'), weight: 600, style: 'normal' },
  { name: 'Grotesk', data: F('SpaceGrotesk-Bold.ttf'), weight: 700, style: 'normal' },
];

// satori requires an explicit display on any div with more than one child, so
// both helpers default it in rather than relying on remembering it per node.
const d = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const t = (style, text) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children: text } });

// Our own mark, drawn from its real geometry so it is exact rather than an
// approximation of the logo.
function mark(size) {
  const u = size / 64;
  return d({
    width: size, height: size, borderRadius: 16 * u,
    background: 'linear-gradient(135deg,#6366f1 0%,#a855f7 55%,#d946ef 100%)',
    alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 16 * u, gap: 3 * u,
  }, [14, 24, 32].map((h) => d({ width: 8 * u, height: h * u, borderRadius: 2.5 * u, background: '#fff' }, [])));
}

const lockup = () => d({ alignItems: 'center', gap: 18 }, [
  mark(60),
  d({ fontFamily: 'Inter', fontSize: 40, fontWeight: 700, letterSpacing: -1.2 }, [
    t({ color: '#ffffff' }, 'ShinyPu'),
    t({
      background: 'linear-gradient(180deg,#818cf8 0%,#c084fc 55%,#e879f9 100%)',
      backgroundClip: 'text', color: 'transparent',
    }, 'll'),
  ]),
]);

async function card({ eyebrow, headline, sub, accent = '#a5b4fc' }) {
  const tree = d({ flexDirection: 'column', justifyContent: 'space-between', width: W, height: H, padding: 72 }, [
    lockup(),
    d({ flexDirection: 'column' }, [
      t({ fontFamily: 'Inter', fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: accent, marginBottom: 18 }, eyebrow),
      ...headline.map((l) => t({ fontFamily: 'Grotesk', fontSize: 74, fontWeight: 700, letterSpacing: -2.5, color: '#ffffff', lineHeight: 1.1 }, l)),
      t({ fontFamily: 'Inter', fontSize: 26, fontWeight: 600, color: '#a1a1aa', marginTop: 22 }, sub),
    ]),
    d({ alignItems: 'center', gap: 16 }, [
      d({ width: 110, height: 3, borderRadius: 2, background: 'linear-gradient(90deg,#818cf8,#e879f9)' }, []),
      t({ fontFamily: 'Inter', fontSize: 22, fontWeight: 600, color: '#71717a', letterSpacing: 0.3 }, 'shinypull.com'),
    ]),
  ]);
  return satori(tree, { width: W, height: H, fonts: FONTS });
}

// Amber on `promote` is deliberate: it is this site's one functional colour for
// the Premium tier, so the Featured Listings card breaks the family on purpose.
const CARDS = {
  home:       { eyebrow: 'Creator analytics',   headline: ['Track any creator.', 'Across 9 platforms.'], sub: 'Live subscriber and follower counts. Updated daily.' },
  rankings:   { eyebrow: 'Live rankings',       headline: ['Who’s actually #1.'],                    sub: 'Top creators on every platform, ranked daily.' },
  compare:    { eyebrow: 'Head to head',        headline: ['Two creators.', 'One scoreboard.'],          sub: 'Compare growth, reach and totals side by side.' },
  trending:   { eyebrow: 'Trending now',        headline: ['Who’s moving', 'right now.'],            sub: 'The fastest growing creators this week.' },
  milestones: { eyebrow: 'Milestones',          headline: ['Every threshold,', 'the day it broke.'],     sub: 'Follower and subscriber records as they happen.' },
  promote:    { eyebrow: 'Featured listings',   headline: ['Put your creator', 'in the rankings.'],      sub: 'Sponsored placement where people already look.', accent: '#fcd34d' },
  blog:       { eyebrow: 'The blog',            headline: ['Creator data,', 'explained.'],               sub: 'What the numbers behind the headlines actually say.' },
  calculator: { eyebrow: 'Earnings calculator', headline: ['What a channel', 'actually earns.'],         sub: 'Estimate YouTube revenue from real view counts.' },
  profile:    { eyebrow: 'Creator profile',     headline: ['Every number,', 'one page.'],                sub: 'Daily history, growth and rank for any creator.' },
};

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [key, spec] of Object.entries(CARDS)) {
  const bg = await sharp(readFileSync(`${BG}/${key}.jpg`))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer();
  // Left-side legibility scrim. A straight linear gradient, never a radial
  // one, per this project's standing no-glow-blobs rule.
  const scrim = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="#0a0a0f" stop-opacity="0.96"/>` +
    `<stop offset="48%" stop-color="#0a0a0f" stop-opacity="0.82"/>` +
    `<stop offset="100%" stop-color="#0a0a0f" stop-opacity="0.05"/>` +
    `</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/></svg>`
  );
  // JPEG, not PNG. These are photographic/gradient cards, so lossless PNG was
  // producing 2.5 MB across the set for zero visible benefit; every scraper
  // that reads og:image handles JPEG. mozjpeg + 4:4:4 chroma keeps the small
  // type and the thin 1px chart strokes crisp, which standard 4:2:0 subsampling
  // visibly muddies at this size.
  const jpg = await sharp(bg)
    .composite([{ input: scrim }, { input: Buffer.from(await card(spec)) }])
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  writeFileSync(`${OUT}/${key}.jpg`, jpg);
  total += jpg.length;
  console.log(`  ${key}.jpg  ${Math.round(jpg.length / 1024)}KB`);
}
console.log(`\nGenerated ${Object.keys(CARDS).length} OG cards, ${Math.round(total / 1024)}KB total -> ${OUT}/`);
