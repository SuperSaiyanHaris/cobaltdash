/**
 * Discover Music Artists
 *
 * Pulls fresh top artists from Last.fm and adds any not yet in our DB.
 * Unlike the one-time seed, this runs on a schedule so the chart updates
 * naturally surface newly-trending artists over time.
 *
 * Strategy:
 *   1. Hit Last.fm chart.gettopartists across multiple pages
 *   2. Also hit a rotating set of genre tags via tag.gettopartists for breadth
 *   3. Insert anything new with 10K+ listeners; skip duplicates
 *
 * Usage: node scripts/discoverMusicArtists.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const LASTFM_API_KEY = process.env.LASTFM_CLIENT_ID;
const BASE = 'https://ws.audioscrobbler.com/2.0/';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const MIN_LISTENERS = 10_000;
const MAX_PER_RUN = 100;

// Rotate through these tags so we surface artists outside the global top chart.
// Picked at random per run; over a week we cover most of the list.
const GENRE_TAGS = [
  'rock', 'pop', 'hip-hop', 'rap', 'electronic', 'indie', 'metal',
  'jazz', 'classical', 'rnb', 'soul', 'country', 'folk', 'punk',
  'alternative', 'dance', 'house', 'techno', 'reggae', 'latin',
  'k-pop', 'lo-fi', 'ambient', 'experimental', 'singer-songwriter',
];

function slugifyArtist(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

// Last.fm serves this exact gray placeholder graphic for every artist it has
// no real photo for, instead of omitting the field. Treat it as "no image" so
// CreatorAvatar's own initials fallback renders instead of Last.fm's asset.
const LASTFM_PLACEHOLDER_HASH = '2a96cbd8b46e442fc41c2b86b821562f';

function getBestImage(images) {
  if (!images || !images.length) return null;
  for (const size of ['extralarge', 'mega', 'large']) {
    const img = images.find(i => i.size === size);
    const url = img?.['#text'];
    if (url && !url.includes(LASTFM_PLACEHOLDER_HASH)) return url;
  }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTopArtistsByChart(page, limit = 50) {
  const url = `${BASE}?method=chart.gettopartists&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.artists?.artist || [];
}

async function getTopArtistsByTag(tag, limit = 50) {
  const url = `${BASE}?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.topartists?.artist || [];
}

async function getArtistInfo(name) {
  const url = `${BASE}?method=artist.getinfo&artist=${encodeURIComponent(name)}&api_key=${LASTFM_API_KEY}&format=json&autocorrect=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.artist || null;
}

async function existingArtists() {
  const slugs = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('username,platform_id')
      .eq('platform', 'music')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this existing-id set would be
      // incomplete and we'd re-insert duplicate creators.
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => {
      if (r.username) slugs.add(r.username);
      if (r.platform_id) slugs.add(r.platform_id);
    });
    if (data.length < 1000) break;
    from += 1000;
  }
  return slugs;
}

async function main() {
  if (!LASTFM_API_KEY) {
    console.error('❌ Missing LASTFM_CLIENT_ID — set in env');
    process.exit(1);
  }

  console.log('🎵 Music artist discovery starting...\n');

  const existing = await existingArtists();
  console.log(`📊 Already tracking ${existing.size} artists\n`);

  // Pull global chart pages 1-6 (top 300) + 3 random genre tags
  const candidates = new Map(); // slug -> raw artist
  for (let page = 1; page <= 6; page++) {
    const artists = await getTopArtistsByChart(page);
    for (const a of artists) {
      const slug = slugifyArtist(a.name);
      const key = a.mbid || slug;
      if (!existing.has(slug) && !existing.has(key) && !candidates.has(key)) {
        candidates.set(key, a);
      }
    }
    await sleep(200);
  }

  // Pick 3 random genres for breadth
  const shuffled = [...GENRE_TAGS].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const tag of shuffled) {
    const artists = await getTopArtistsByTag(tag, 50);
    for (const a of artists) {
      const slug = slugifyArtist(a.name);
      const key = a.mbid || slug;
      if (!existing.has(slug) && !existing.has(key) && !candidates.has(key)) {
        candidates.set(key, a);
      }
    }
    await sleep(200);
  }

  console.log(`🔎 ${candidates.size} candidates not yet in DB\n`);

  const todayISO = new Date().toISOString().split('T')[0];
  let added = 0;

  for (const [, artist] of candidates) {
    if (added >= MAX_PER_RUN) break;

    // chart endpoint doesn't give listeners — fetch via getInfo
    const info = await getArtistInfo(artist.name);
    if (!info) continue;
    const listeners = parseInt(info.stats?.listeners || 0);
    const playcount = parseInt(info.stats?.playcount || 0);
    if (listeners < MIN_LISTENERS) continue;

    const slug = slugifyArtist(artist.name);
    const mbid = artist.mbid || info.mbid || null;
    const profileImage = getBestImage(info.image || artist.image);

    let tags = [];
    if (info.tags?.tag) {
      const tagList = info.tags.tag;
      tags = Array.isArray(tagList)
        ? tagList.slice(0, 3).map(t => t.name)
        : [tagList.name];
    }

    const { data: created, error: insertErr } = await supabase
      .from('creators')
      .insert({
        platform: 'music',
        platform_id: mbid || slug,
        username: slug,
        display_name: artist.name,
        profile_image: profileImage,
        description: tags.join(', ') || null,
        category: tags[0] || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      if (insertErr.code !== '23505') console.error(`  ❌ ${artist.name}: ${insertErr.message}`);
      continue;
    }

    await supabase.from('creator_stats').insert({
      creator_id: created.id,
      recorded_at: todayISO,
      subscribers: listeners,
      followers: listeners,
      total_views: playcount,
      total_posts: null,
    });

    added++;
    console.log(`   ✅ ${artist.name} (${listeners.toLocaleString()} listeners)`);
    await sleep(200);
  }

  console.log(`\n✨ Done. Added ${added} new music artists.`);
}

main().catch((e) => {
  console.error('❌ Discovery failed:', e);
  process.exit(1);
});
