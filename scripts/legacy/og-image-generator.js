// RETIRED 2026-08-25. NOT DEPLOYED. Kept for reference, not dead weight.
//
// This generated the site's Open Graph share cards at request time: one
// generic brand card for every page, plus a per-creator card carrying that
// creator's live stats. Both were replaced by static per-page cards built by
// scripts/generateOgImages.mjs and served from public/og/.
//
// It lives outside api/ so Vercel stops building it as a serverless function.
// Hobby caps Node functions at 12 and this project sat exactly at that cap, so
// leaving it in api/ would have kept consuming a slot for code nothing calls.
//
// To bring per-creator stat cards back: move this file to api/og.js, restore
// the two /og-image rewrites in vercel.json, and point CreatorProfile.jsx's
// SEO image back at /og-image/:platform/:username. Read the comment block
// below first, it documents two failure modes that each shipped blank
// previews to every social scraper.

// Vercel Edge Function — generates Open Graph preview images.
// Two modes:
//   /api/og                                          → default brand card
//   /api/og?platform=youtube&username=mrbeast        → per-creator card with stats
//
// Per-creator cards are aggressively cached at the edge (1 hour). Stats change
// daily at most, so the cache is generous and keeps the function cheap.
//
// Written with React.createElement instead of JSX (see api/og.jsx, now removed):
// requests to the old .jsx file were silently falling through vercel.json's
// catch-all SPA rewrite to index.html instead of ever reaching this function —
// Vercel's zero-config function discovery for this project's build never
// picked up a .jsx file under /api. Every social share of a shinypull.com
// link (X, Discord, iMessage, Slack) got a blank/broken preview image as a
// result. Plain .js with createElement sidesteps the extension issue entirely.
//
// RUNS ON THE NODE RUNTIME, DELIBERATELY. DO NOT PUT IT BACK ON EDGE.
// @vercel/og's edge build ends with:
//
//   var fallbackFont = fetch(new URL("./noto-sans-v27-latin-regular.ttf",
//                                    import.meta.url)).then(r => r.arrayBuffer());
//   ...
//   const [fontData] = await Promise.all([fallbackFont, initializedResvg]);
//
// That font fetch is awaited unconditionally inside `new ReadableStream({start})`,
// even if you pass your own `fonts` option — there is no way to opt out. Vercel's
// edge builder only co-locates that .ttf (and resolves the `./resvg.wasm?module`
// import) for Next.js projects; this is a Vite project, so the fetch rejects,
// start() throws, and the Response ships with its headers already sent and a
// ZERO-BYTE body. The symptom is a 200 + `content-type: image/png` +
// `content-length: 0`, which every social scraper renders as a blank preview.
// It is silent: no 5xx, nothing obviously wrong in the response line.
//
// The node build instead does `fs.readFileSync` for both the font and the wasm,
// which Vercel's Node bundler traces correctly, and `unstable_createNodejsStream`
// awaits the render in OUR call frame so a failure is a catchable error rather
// than an empty stream. Moving to Node cost a serverless function slot (Hobby
// caps Node functions at 12 and we were exactly at 12), which is why
// api/image-proxy.js was converted to the edge runtime in the same change.

import { unstable_createNodejsStream } from '@vercel/og';
import React from 'react';

const h = React.createElement;

export const config = { runtime: 'nodejs' };

const PLATFORM_LABELS = {
  youtube:  'YouTube',
  tiktok:   'TikTok',
  twitch:   'Twitch',
  kick:     'Kick',
  bluesky:  'Bluesky',
  music:    'Music',
  mastodon: 'Mastodon',
  rumble:   'Rumble',
  substack: 'Substack',
};

const PLATFORM_COLORS = {
  youtube:  '#ef4444',
  tiktok:   '#ec4899',
  twitch:   '#a855f7',
  kick:     '#22c55e',
  bluesky:  '#0ea5e9',
  music:    '#f59e0b',
  mastodon: '#7c3aed',
  rumble:   '#65a30d',
  substack: '#ea580c',
};

function formatNumber(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Lightweight Supabase REST fetch — avoids pulling the full SDK into edge runtime
async function fetchCreator(platform, username) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const r = await fetch(
      `${url}/rest/v1/rankings_cache?platform=eq.${encodeURIComponent(platform)}&username=eq.${encodeURIComponent(username)}&rank_type=eq.subscribers&select=display_name,username,profile_image,subscribers,total_views,growth_30d&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return null;
    const arr = await r.json();
    return arr[0] || null;
  } catch {
    return null;
  }
}

function BrandLogo({ scale = 1 }) {
  return h('div', { style: { display: 'flex', alignItems: 'center' } },
    h('div', {
      style: {
        width: 56 * scale,
        height: 56 * scale,
        backgroundColor: '#4f46e5',
        borderRadius: 14 * scale,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 10 * scale,
        marginRight: 16 * scale,
      },
    },
      h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 5 * scale } },
        h('div', { style: { width: 9 * scale, height: 18 * scale, backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 2 } }),
        h('div', { style: { width: 9 * scale, height: 32 * scale, backgroundColor: 'white', borderRadius: 2 } }),
        h('div', { style: { width: 9 * scale, height: 24 * scale, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 2 } }),
      )
    ),
    h('div', { style: { display: 'flex', fontSize: 44 * scale, fontWeight: 800, letterSpacing: -1.5 * scale } },
      h('span', { style: { color: '#f1f5f9' } }, 'Shiny'),
      h('span', { style: { color: '#6366f1' } }, 'Pull'),
    )
  );
}

function CreatorCard({ creator, platform }) {
  const platformLabel = PLATFORM_LABELS[platform] || platform;
  const platformColor = PLATFORM_COLORS[platform] || '#6366f1';
  const followerLabel =
    platform === 'youtube' ? 'Subscribers' :
    platform === 'music'   ? 'Monthly Listeners' :
    platform === 'kick'    ? 'Paid Subscribers' :
    'Followers';

  const growth = creator.growth_30d;
  const growthPositive = typeof growth === 'number' && growth > 0;

  return h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(145deg, #0a0a0f 0%, #1e1b4b 60%, #0a0a0f 100%)',
      padding: '56px 64px',
      position: 'relative',
    },
  },
    // Top row: brand + platform pill
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 } },
      h(BrandLogo, { scale: 0.9 }),
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: `2px solid ${platformColor}`,
          color: platformColor,
          padding: '10px 22px',
          borderRadius: 999,
          fontSize: 22,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
        },
      }, platformLabel)
    ),

    // Main row: avatar + name
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 32, marginBottom: 36 } },
      creator.profile_image
        ? h('img', {
            src: creator.profile_image,
            width: 140,
            height: 140,
            style: { borderRadius: 28, border: '4px solid rgba(255,255,255,0.1)', objectFit: 'cover' },
          })
        : h('div', {
            style: {
              width: 140,
              height: 140,
              borderRadius: 28,
              backgroundColor: platformColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 60,
              fontWeight: 800,
              color: 'white',
            },
          }, (creator.display_name || '?')[0]?.toUpperCase()),
      h('div', { style: { display: 'flex', flexDirection: 'column', maxWidth: 800 } },
        h('div', { style: { color: '#94a3b8', fontSize: 22, fontWeight: 500, marginBottom: 6 } }, `@${creator.username}`),
        h('div', {
          style: {
            color: '#f8fafc',
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1.05,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }, creator.display_name || creator.username)
      )
    ),

    // Stats row
    h('div', { style: { display: 'flex', gap: 18, marginTop: 'auto' } },
      h('div', {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          padding: '20px 24px',
        },
      },
        h('div', { style: { color: '#64748b', fontSize: 17, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 } }, followerLabel),
        h('div', { style: { color: '#f8fafc', fontSize: 46, fontWeight: 800, letterSpacing: -1 } }, formatNumber(creator.subscribers))
      ),

      typeof creator.total_views === 'number' && creator.total_views > 0 &&
        h('div', {
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 18,
            padding: '20px 24px',
          },
        },
          h('div', { style: { color: '#64748b', fontSize: 17, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 } }, platform === 'tiktok' ? 'Likes' : 'Total Views'),
          h('div', { style: { color: '#f8fafc', fontSize: 46, fontWeight: 800, letterSpacing: -1 } }, formatNumber(creator.total_views))
        ),

      h('div', {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          padding: '20px 24px',
        },
      },
        h('div', { style: { color: '#64748b', fontSize: 17, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 } }, '30-Day Growth'),
        h('div', {
          style: {
            color: growthPositive ? '#34d399' : growth < 0 ? '#f87171' : '#94a3b8',
            fontSize: 46,
            fontWeight: 800,
            letterSpacing: -1,
          },
        }, `${growthPositive ? '+' : ''}${formatNumber(growth)}`)
      )
    ),

    // Footer
    h('div', {
      style: {
        marginTop: 32,
        color: '#475569',
        fontSize: 20,
        fontWeight: 500,
        letterSpacing: 0.5,
        display: 'flex',
        justifyContent: 'space-between',
      },
    },
      h('span', null, 'shinypull.com'),
      h('span', null, 'Live creator analytics')
    )
  );
}

function DefaultCard() {
  return h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 52%, #0f172a 100%)',
      fontFamily: 'sans-serif',
      padding: 60,
    },
  },
    h('div', { style: { display: 'flex', marginBottom: 32 } }, h(BrandLogo, { scale: 1.5 })),
    h('div', {
      style: {
        color: '#94a3b8',
        fontSize: 30,
        textAlign: 'center',
        maxWidth: 860,
        lineHeight: 1.5,
        marginBottom: 52,
        fontWeight: 400,
      },
    }, 'Creator analytics for YouTube, TikTok, Twitch, Kick, Bluesky, and Music.'),
    h('div', { style: { display: 'flex', gap: 14 } },
      ['YouTube', 'TikTok', 'Twitch', 'Kick', 'Bluesky', 'Music'].map((name, i) =>
        h('div', {
          key: i,
          style: {
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: '#cbd5e1',
            padding: '10px 24px',
            borderRadius: 999,
            fontSize: 20,
            fontWeight: 500,
            border: '1px solid rgba(255,255,255,0.12)',
          },
        }, name)
      )
    ),
    h('div', {
      style: {
        color: '#475569',
        fontSize: 22,
        marginTop: 52,
        fontWeight: 500,
        letterSpacing: 0.5,
      },
    }, 'shinypull.com')
  );
}

const SIZE = { width: 1200, height: 630 };

export default async function handler(req, res) {
  const { platform, username } = req.query || {};

  let creator = null;
  if (platform && username && PLATFORM_LABELS[platform]) {
    creator = await fetchCreator(platform, username);
  }

  // Ordered fallbacks. satori fetches `creator.profile_image` over the network
  // while rendering, so a dead or slow avatar CDN would otherwise take the whole
  // card down. Dropping the avatar still produces a correct, on-brand card with
  // the real stats on it, which beats no preview image at all. A returned
  // preview is the entire point of this endpoint, so it degrades rather than
  // fails.
  const attempts = [];
  if (creator) {
    attempts.push(['creator card', () => h(CreatorCard, { creator, platform })]);
    if (creator.profile_image) {
      attempts.push(['creator card (no avatar)', () =>
        h(CreatorCard, { creator: { ...creator, profile_image: null }, platform })]);
    }
  }
  attempts.push(['default card', () => h(DefaultCard)]);

  for (const [label, build] of attempts) {
    try {
      const stream = await unstable_createNodejsStream(build(), SIZE);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/png');
      res.setHeader(
        'Cache-Control',
        'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400'
      );
      stream.pipe(res);
      return;
    } catch (err) {
      // Loud on purpose. The whole reason this endpoint was broken for so long
      // is that the previous failure mode was a silent 200 with an empty body.
      console.error(`[og] ${label} failed:`, err?.stack || err?.message || err);
    }
  }

  // Every card failed to render, which means the renderer itself is broken
  // rather than the data. Return a real error so it shows up as a 500 instead
  // of masquerading as a valid but empty image.
  res.statusCode = 500;
  res.setHeader('Content-Type', 'text/plain');
  res.end('OG image render failed');
}
