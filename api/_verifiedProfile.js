// Server-side profile lookup for /api/update-creator.
//
// The client tells us WHICH creator it just viewed ({platform, platformId,
// username}); everything written to the creators table comes from the
// platform itself, fetched here. Client-sent display names, bios, avatars,
// countries and categories are never trusted, so a forged request can at most
// ask us to refresh a real creator with that creator's real data.
//
// Every fetcher returns the normalized shape below, or null when the platform
// says the account doesn't exist / doesn't match the requested id.
//   { platformId, username, displayName, profileImage, description, country, category }

import { getChannel as getYouTubeChannel } from './youtube.js';
import { getAccessToken as getTwitchToken } from './twitch.js';
import { getChannelBySlug as getKickChannel } from './kick.js';
import { getArtist as getLastfmArtist } from './lastfm.js';

const TIMEOUT_MS = 8000;
const DESCRIPTION_MAX = 5000;

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

function clip(s, max = DESCRIPTION_MAX) {
  if (s === null || s === undefined) return null;
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

// Public hostnames only: blocks IP literals, localhost and single-label hosts
// so a forged Mastodon/Substack id can't point our server at internal addresses.
function isPublicHostname(host) {
  if (!host || host.length > 253) return false;
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  if (!host.includes('.')) return false;
  if (/^[0-9.]+$/.test(host)) return false;
  if (/(^|\.)localhost$/i.test(host) || /\.(local|internal)$/i.test(host)) return false;
  return true;
}

async function youtube({ platformId }) {
  if (!/^UC[\w-]{22}$/.test(platformId || '')) return null;
  try {
    const c = await getYouTubeChannel(platformId);
    return { platformId: c.platformId, username: c.username, displayName: c.displayName, profileImage: c.profileImage, description: c.description, country: c.country || null, category: null };
  } catch (err) {
    if (/not found/i.test(err.message)) return null;
    throw err;
  }
}

async function twitch({ platformId }) {
  if (!/^\d{1,20}$/.test(platformId || '')) return null;
  const token = await getTwitchToken();
  const headers = { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` };
  const users = await fetchJson(`https://api.twitch.tv/helix/users?id=${platformId}`, { headers });
  const u = users?.data?.[0];
  if (!u) return null;
  let category = null;
  try {
    const ch = await fetchJson(`https://api.twitch.tv/helix/channels?broadcaster_id=${platformId}`, { headers });
    category = ch?.data?.[0]?.game_name || null;
  } catch { /* category is optional */ }
  return { platformId: u.id, username: u.login, displayName: u.display_name, profileImage: u.profile_image_url, description: u.description, country: null, category };
}

async function kick({ platformId, username }) {
  if (!username || !/^[\w-]{1,64}$/.test(username)) return null;
  const c = await getKickChannel(username);
  if (!c || String(c.platformId) !== String(platformId)) return null;
  return { platformId: c.platformId, username: c.username, displayName: c.displayName, profileImage: c.profileImage, description: c.description, country: null, category: c.category };
}

async function bluesky({ platformId }) {
  if (!/^did:[a-z]+:[\w.:%-]{1,200}$/.test(platformId || '')) return null;
  const a = await fetchJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(platformId)}`);
  if (!a?.did || a.did !== platformId) return null;
  return { platformId: a.did, username: a.handle, displayName: a.displayName || a.handle, profileImage: a.avatar || null, description: a.description || null, country: null, category: null };
}

function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() || null;
}

async function mastodon({ platformId }) {
  const m = /^([a-z0-9.-]+):(\d{1,24})$/i.exec(platformId || '');
  if (!m || !isPublicHostname(m[1])) return null;
  const [, instance, id] = m;
  const a = await fetchJson(`https://${instance}/api/v1/accounts/${id}`, { headers: { Accept: 'application/json' }, redirect: 'error' });
  if (!a?.id || String(a.id) !== id) return null;
  return { platformId: `${instance}:${a.id}`, username: `${a.username}@${instance}`, displayName: a.display_name || a.username, profileImage: a.avatar || a.avatar_static || null, description: stripHtml(a.note), country: null, category: null };
}

function slugifyArtist(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
}
const LASTFM_PLACEHOLDER_HASH = '2a96cbd8b46e442fc41c2b86b821562f';
function bestLastfmImage(images) {
  for (const size of ['extralarge', 'mega', 'large', 'medium', 'small']) {
    const url = images?.find((i) => i.size === size)?.['#text'];
    if (url && !url.includes(LASTFM_PLACEHOLDER_HASH)) return url;
  }
  return null;
}

async function music({ platformId, username, displayName }) {
  const isMbid = /^[0-9a-f-]{36}$/i.test(platformId || '');
  // Non-MBID artists are keyed by slug, so the lookup has to go by name; the
  // result only counts if Last.fm's canonical name slugifies back to the id.
  const name = isMbid ? null : String(displayName || username || '').slice(0, 200);
  if (!isMbid && !name) return null;
  const a = await getLastfmArtist(name, isMbid ? platformId : null);
  if (!a?.name) return null;
  const slug = slugifyArtist(a.name);
  if (isMbid ? a.mbid !== platformId : slug !== platformId) return null;
  const tags = a.tags?.tag || [];
  const tagNames = (Array.isArray(tags) ? tags : [tags]).slice(0, 3).map((t) => t.name).filter(Boolean);
  return { platformId, username: slug, displayName: a.name, profileImage: bestLastfmImage(a.image), description: tagNames.join(', ') || null, country: null, category: tagNames[0] || null };
}

async function substack({ platformId, username }) {
  if (!/^\d{1,20}$/.test(platformId || '') || !/^[a-z0-9-]{1,63}$/i.test(username || '')) return null;
  const data = await fetchJson(`https://${username}.substack.com/api/v1/homepage_data`, { headers: { Accept: 'application/json' } });
  const pub = data?.pub || data?.publication;
  if (!pub?.id || String(pub.id) !== platformId) return null;
  return { platformId: String(pub.id), username: pub.subdomain || username, displayName: pub.name || pub.subdomain, profileImage: pub.logo_url || pub.author_photo_url || null, description: pub.hero_text || pub.author_bio || null, country: null, category: null };
}

const FETCHERS = { youtube, twitch, kick, bluesky, mastodon, music, substack };

export const VERIFIABLE_PLATFORMS = Object.keys(FETCHERS);

/**
 * Fetch the real profile for a creator from its platform.
 * Returns null when the account doesn't exist or doesn't match the id.
 * Throws on upstream/network errors (caller decides how to degrade).
 */
export async function fetchVerifiedProfile(platform, ids) {
  const fetcher = FETCHERS[platform];
  if (!fetcher) return null;
  const p = await fetcher(ids);
  if (!p) return null;
  return {
    ...p,
    platformId: String(p.platformId),
    username: clip(p.username, 200),
    displayName: clip(p.displayName, 200),
    description: clip(p.description),
  };
}
