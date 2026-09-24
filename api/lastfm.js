// Vercel Serverless Function for Last.fm API
// Keeps API key secure on server-side

import { guardProxy, cdnCache } from './_guard.js';

const LASTFM_API_KEY = process.env.LASTFM_CLIENT_ID;
const BASE = 'https://ws.audioscrobbler.com/2.0/';

async function searchArtists(query, limit = 10) {
  const url = `${BASE}?method=artist.search&artist=${encodeURIComponent(query)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm search failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm: ${data.message}`);
  const matches = data.results?.artistmatches?.artist || [];
  return Array.isArray(matches) ? matches : [matches];
}

export async function getArtist(name, mbid) {
  const param = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}&autocorrect=1`;
  const url = `${BASE}?method=artist.getinfo&${param}&api_key=${LASTFM_API_KEY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm artist fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.error) return null;
  return data.artist || null;
}

async function getTopArtists(page = 1, limit = 50) {
  const url = `${BASE}?method=chart.gettopartists&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm chart failed: ${res.status}`);
  const data = await res.json();
  return data.artists?.artist || [];
}

async function getTopTracks(name, mbid, limit = 10) {
  const param = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}&autocorrect=1`;
  const url = `${BASE}?method=artist.gettoptracks&${param}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm top tracks failed: ${res.status}`);
  const data = await res.json();
  if (data.error) return [];
  return data.toptracks?.track || [];
}

async function getTopAlbums(name, mbid, limit = 6) {
  const param = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}&autocorrect=1`;
  const url = `${BASE}?method=artist.gettopalbums&${param}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm top albums failed: ${res.status}`);
  const data = await res.json();
  if (data.error) return [];
  return data.topalbums?.album || [];
}

export default async function handler(req, res) {
  if (!guardProxy(req, res, { name: 'lastfm', limit: 60 })) return;

  if (!LASTFM_API_KEY) {
    return res.status(500).json({ error: 'Last.fm API key not configured' });
  }

  const { action, query, artist, mbid, page, limit } = req.query;

  // Artist metadata and charts change slowly; let the CDN absorb repeat views.
  cdnCache(res, 3600);

  try {
    if (action === 'search' && query) {
      const results = await searchArtists(query, limit ? parseInt(limit, 10) : 10);
      return res.status(200).json({ data: results });
    }

    if (action === 'artist' && (artist || mbid)) {
      const result = await getArtist(artist, mbid);
      if (!result) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).json({ error: 'Artist not found' }); }
      return res.status(200).json({ data: result });
    }

    if (action === 'top') {
      const results = await getTopArtists(
        page ? parseInt(page, 10) : 1,
        limit ? parseInt(limit, 10) : 50
      );
      return res.status(200).json({ data: results });
    }

    if (action === 'toptracks' && (artist || mbid)) {
      const results = await getTopTracks(artist, mbid, limit ? parseInt(limit, 10) : 10);
      return res.status(200).json({ data: results });
    }

    if (action === 'topalbums' && (artist || mbid)) {
      const results = await getTopAlbums(artist, mbid, limit ? parseInt(limit, 10) : 6);
      return res.status(200).json({ data: results });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=search&query=..., ?action=artist&artist=..., ?action=top, ?action=toptracks&artist=..., or ?action=topalbums&artist=...' });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    console.error('Last.fm API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
