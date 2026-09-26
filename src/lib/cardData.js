// Data behind a creator's holographic card: latest count, 30-day change,
// platform rank and total (for rarity), and the avatar inlined as a data: URI
// (an SVG shown through <img> can't load external images).
//
// Shared by middleware.js (the /card SVG, edge runtime) and the share-image
// function (api/share-card.js, Node), so a link preview can never disagree
// with the card itself. Fetch-only, no Node or edge specifics.

import { pickCreatorRow } from './seoRules.js';

const AVATAR_HOSTS = ['yt3.ggpht.com', 'yt3.googleusercontent.com', 'static-cdn.jtvnw.net', 'files.kick.com', 'cdn.bsky.app', 'lastfm.freetls.fastly.net', 'i.scdn.co', 'substackcdn.com'];
const AVATAR_SUFFIXES = ['.tiktokcdn.com', '.tiktokcdn-us.com', '.googleusercontent.com', '.ggpht.com'];
const AVATAR_MAX_BYTES = 150_000;

/** Fetch JSON from Supabase PostgREST with the anon key. Null on any failure. */
export async function restGet(path, timeoutMs = 2500) {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Ask each CDN for a small (~150px) version of the avatar. */
export function smallAvatarUrl(src) {
  return src
    .replace(/=s\d+(-)/, '=s176$1')                 // YouTube
    .replace(/-(300x300|600x600)\./, '-150x150.') // Twitch
    .replace('/img/avatar/', '/img/avatar_thumbnail/'); // Bluesky
}

export async function inlineAvatar(src) {
  if (!src) return null;
  let u;
  try { u = new URL(smallAvatarUrl(src)); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || !(AVATAR_HOSTS.includes(host) || AVATAR_SUFFIXES.some((x) => host.endsWith(x)))) return null;
  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(2500) });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!res.ok || !/^image\/(png|jpe?g|webp|gif)$/.test(type)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > AVATAR_MAX_BYTES) return null;
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

// Creators tracked per platform (the "of N" on the card and the rarity math).
// Cached per instance; the number moves slowly.
const platformTotals = new Map();
export async function platformTotal(platform) {
  const hit = platformTotals.get(platform);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.n;
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/creators?platform=eq.${platform}&select=id`, {
      method: 'HEAD',
      headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact', range: '0-0' },
      signal: AbortSignal.timeout(2500),
    });
    const n = Number((res.headers.get('content-range') || '').split('/')[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    platformTotals.set(platform, { n, at: Date.now() });
    return n;
  } catch {
    return null;
  }
}

/**
 * Everything renderCard() needs for one creator, or null when the creator
 * isn't tracked (or the lookup is ambiguous or failed).
 */
export async function loadCardData(platform, username) {
  const select = 'username,display_name,profile_image,creator_stats(subscribers,recorded_at),rankings_cache(rank_type,rank_position)';
  const [rows, total] = await Promise.all([
    restGet(
      `creators?platform=eq.${platform}&username=ilike.${encodeURIComponent(username)}` +
      `&select=${encodeURIComponent(select)}` +
      `&creator_stats.order=recorded_at.desc&creator_stats.limit=31` +
      `&order=updated_at.desc&limit=5`
    ),
    platformTotal(platform),
  ]);
  const c = pickCreatorRow(rows);
  if (!c) return null;
  const stats = c.creator_stats || [];
  const latest = stats[0] || null;
  const cutoff = Date.now() - 30 * 86400000;
  const inWindow = stats.filter((s) => new Date(s.recorded_at).getTime() >= cutoff);
  const oldest = inWindow.length >= 2 ? inWindow[inWindow.length - 1] : null;
  const rank = (c.rankings_cache || []).find((r) => r.rank_type === 'subscribers')?.rank_position ?? null;
  return {
    platform,
    name: c.display_name || c.username,
    username: c.username,
    count: latest ? latest.subscribers : null,
    delta30: latest && oldest ? latest.subscribers - oldest.subscribers : null,
    rank,
    total,
    avatar: await inlineAvatar(c.profile_image),
  };
}
