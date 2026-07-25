/**
 * Image proxy — fetches remote images server-side so the browser doesn't get blocked
 * by referrer-based hotlink protection. YouTube's `yt3.googleusercontent.com` thumbnails
 * for very large channels (MrBeast, T-Series, etc.) sometimes 403 when loaded from
 * non-google.com origins. We proxy through this endpoint when that happens.
 *
 * GET /api/image-proxy?url=<encoded-url>
 *
 * Restrictions:
 *   - Only allows specific hostnames (creator avatar CDNs)
 *   - Caches aggressively at the edge (1 day)
 *   - Strips referrer + UA before forwarding
 *
 * Runs on the EDGE runtime. It is a pure fetch pass-through with no Node built-ins,
 * so edge is both a better fit (cheaper, closer to the user, streams the upstream
 * body straight through instead of buffering it) and it keeps a Node function slot
 * free. Hobby caps Node serverless functions at 12 and we sit exactly at that line;
 * `api/og.js` needs the Node runtime because @vercel/og's edge build cannot load its
 * own font in a non-Next project. Do not convert this back to Node without moving
 * something else off first, or the deploy fails with only "Deployment has failed".
 */

export const config = { runtime: 'edge' };

const ALLOWED_HOSTS = new Set([
  'yt3.googleusercontent.com',
  'yt3.ggpht.com',
  'i.ytimg.com',
  'lh3.googleusercontent.com',
  'p16-sign-va.tiktokcdn.com',
  'p16-sign-sg.tiktokcdn.com',
  'p77-sign-va.tiktokcdn.com',
  'p77-sign-sg.tiktokcdn.com',
  'static-cdn.jtvnw.net',                // Twitch
  'files.kick.com',
  'cdn.bsky.app',
  'video.bsky.app',
  'i.scdn.co',                           // Spotify
  'lastfm.freetls.fastly.net',           // Last.fm
]);

const text = (body, status) => new Response(body, { status });

export default async function handler(req) {
  try {
    const url = new URL(req.url).searchParams.get('url');
    if (!url) return text('Missing url parameter', 400);

    let target;
    try { target = new URL(url); }
    catch { return text('Invalid url', 400); }

    if (target.protocol !== 'https:') {
      return text('Only https URLs are allowed', 400);
    }
    if (!ALLOWED_HOSTS.has(target.hostname)) {
      return text('Host not allowed', 400);
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShinyPull/1.0)',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) return text('Upstream error', upstream.status);

    // Stream the upstream body straight through — no buffering.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch (err) {
    console.error('Image proxy error:', err.message);
    return text('Proxy error', 500);
  }
}
