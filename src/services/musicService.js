// Last.fm music artist service — platform identifier: 'music'

function slugifyArtist(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<a\b[^>]*>.*?<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

// Last.fm serves this exact gray placeholder graphic for every artist it has
// no real photo for, instead of omitting the field. Treat it as "no image" so
// CreatorAvatar's own initials fallback renders instead of Last.fm's asset.
const LASTFM_PLACEHOLDER_HASH = '2a96cbd8b46e442fc41c2b86b821562f';

function getBestImage(images) {
  if (!images || !images.length) return null;
  const priority = ['extralarge', 'mega', 'large', 'medium', 'small'];
  for (const size of priority) {
    const img = images.find(i => i.size === size);
    const url = img?.['#text'];
    if (url && !url.includes(LASTFM_PLACEHOLDER_HASH)) return url;
  }
  return null;
}

function normalizeArtist(raw) {
  const name = raw.name || '';
  const listeners = parseInt(raw.stats?.listeners || raw.listeners || 0);
  const playcount = parseInt(raw.stats?.playcount || raw.playcount || 0);
  const tags = raw.tags?.tag || [];
  const tagNames = Array.isArray(tags) ? tags.slice(0, 3).map(t => t.name) : (tags.name ? [tags.name] : []);

  return {
    platform: 'music',
    platformId: raw.mbid || slugifyArtist(name),
    username: slugifyArtist(name),
    displayName: name,
    profileImage: getBestImage(raw.image),
    description: tagNames.join(', ') || null,
    category: tagNames[0] || null,
    listeners,
    subscribers: listeners,
    followers: listeners,
    totalViews: playcount,
    totalPosts: null,
    genres: tagNames,
    bio: stripHtml(raw.bio?.summary) || null,
    externalUrl: raw.url || `https://www.last.fm/music/${encodeURIComponent(name)}`,
  };
}

const BASE = '/api/lastfm';

export async function searchArtists(query, limit = 10) {
  const res = await fetch(`${BASE}?action=search&query=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Music search failed');
  const json = await res.json();
  return (json.data || []).map(normalizeArtist);
}

export async function getArtistByName(name) {
  const res = await fetch(`${BASE}?action=artist&artist=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ? normalizeArtist(json.data) : null;
}

export async function getArtistByMbid(mbid) {
  const res = await fetch(`${BASE}?action=artist&mbid=${encodeURIComponent(mbid)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ? normalizeArtist(json.data) : null;
}

export async function getArtistTopTracks(name, mbid, limit = 10) {
  const param = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}`;
  const res = await fetch(`${BASE}?action=toptracks&${param}&limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getArtistTopAlbums(name, mbid, limit = 6) {
  const param = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}`;
  const res = await fetch(`${BASE}?action=topalbums&${param}&limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}
