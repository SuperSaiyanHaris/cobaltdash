// Shared request guard for the platform proxy endpoints (youtube, twitch,
// kick, lastfm). These spend our API quota on every call, so:
//
//  1. Only our own pages may call them. Same-origin GET fetches don't send an
//     Origin header, so we accept any of Origin / Sec-Fetch-Site / Referer
//     pointing at us. A non-browser client can forge these, but it stops other
//     sites hotlinking the proxies and casual scripted use; the per-action
//     rate limits below are the second layer.
//  2. Successful GETs are cached at Vercel's CDN (s-maxage) keyed on the full
//     URL, so repeat searches and profile loads never reach the function or
//     the upstream API. Cached hits skip this guard, which is fine: they cost
//     nothing.

import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

export const ALLOWED_ORIGINS = [
  'https://shinypull.com',
  'https://www.shinypull.com',
  'http://localhost:3000',
  'http://localhost:3001',
];

function hostOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

export function isFromOurSite(req) {
  const origin = req.headers.origin;
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  if (req.headers['sec-fetch-site'] === 'same-origin') return true;
  const ref = hostOf(req.headers.referer || req.headers.referrer);
  return !!ref && ALLOWED_ORIGINS.includes(ref);
}

/**
 * CORS + method + origin + rate-limit preamble shared by the proxies.
 * Returns true when the handler should continue, false when it already responded.
 */
export function guardProxy(req, res, { name, limit = 60, windowMs = 60000 }) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  if (!isFromOurSite(req)) { res.status(403).json({ error: 'Forbidden' }); return false; }

  const rl = checkRateLimit(`${name}:${getClientIdentifier(req)}`, limit, windowMs);
  if (!rl.allowed) { res.status(429).json({ error: 'Too many requests. Please try again later.' }); return false; }
  return true;
}

/** Tighter per-IP budget for an expensive action (e.g. YouTube search = 100 quota units). */
export function allowExpensive(req, res, name, limit, windowMs = 60000) {
  const rl = checkRateLimit(`${name}:${getClientIdentifier(req)}`, limit, windowMs);
  if (!rl.allowed) { res.status(429).json({ error: 'Too many searches. Please wait a minute.' }); return false; }
  return true;
}

/** Let Vercel's CDN serve this GET response for `seconds`, then revalidate in the background. */
export function cdnCache(res, seconds, swr = seconds * 12) {
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${swr}`);
}
