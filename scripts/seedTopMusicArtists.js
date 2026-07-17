import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const LASTFM_API_KEY = process.env.LASTFM_CLIENT_ID;
const BASE = 'https://ws.audioscrobbler.com/2.0/';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

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
  const priority = ['extralarge', 'mega', 'large'];
  for (const size of priority) {
    const img = images.find(i => i.size === size);
    const url = img?.['#text'];
    if (url && !url.includes(LASTFM_PLACEHOLDER_HASH)) return url;
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getTopArtists(page, limit = 50) {
  const url = `${BASE}?method=chart.gettopartists&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm chart error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm: ${data.message}`);
  return data.artists?.artist || [];
}

async function getArtistInfo(name) {
  const url = `${BASE}?method=artist.getinfo&artist=${encodeURIComponent(name)}&api_key=${LASTFM_API_KEY}&format=json&autocorrect=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  return data.artist || null;
}

async function seed() {
  if (!LASTFM_API_KEY) {
    console.error('❌ Missing LASTFM_CLIENT_ID');
    process.exit(1);
  }

  console.log('🎵 Seeding top music artists from Last.fm...\n');

  // Collect top 1000 artists from chart (20 pages x 50)
  const allArtists = [];
  for (let page = 1; page <= 20; page++) {
    try {
      const artists = await getTopArtists(page);
      if (artists.length === 0) break;
      allArtists.push(...artists);
      process.stdout.write(`  Page ${page}/20: ${allArtists.length} artists collected\r`);
      await sleep(200);
    } catch (err) {
      console.warn(`\n  ⚠️  Page ${page}: ${err.message}`);
    }
  }
  console.log(`\n\n📦 Collected ${allArtists.length} artists. Fetching full profiles...\n`);

  const todayISO = new Date().toISOString().split('T')[0];
  let inserted = 0;
  let errors = 0;

  for (const artist of allArtists) {
    const slug = slugifyArtist(artist.name);
    const listeners = parseInt(artist.listeners || 0);
    const playcount = parseInt(artist.playcount || 0);
    const mbid = artist.mbid || null;
    const profileImage = getBestImage(artist.image);

    try {
      // Get genres via artist.getInfo
      let tags = [];
      const info = await getArtistInfo(artist.name);
      if (info?.tags?.tag) {
        const tagList = info.tags.tag;
        tags = Array.isArray(tagList)
          ? tagList.slice(0, 3).map(t => t.name)
          : [tagList.name];
      }
      await sleep(200);

      const { data: upserted, error: upsertErr } = await supabase
        .from('creators')
        .upsert({
          platform: 'music',
          platform_id: mbid || slug,
          username: slug,
          display_name: artist.name,
          profile_image: profileImage,
          description: tags.join(', ') || null,
          category: tags[0] || null,
        }, { onConflict: 'platform,platform_id' })
        .select('id')
        .single();

      if (upsertErr) {
        console.error(`  ❌ ${artist.name}: ${upsertErr.message}`);
        errors++;
        continue;
      }

      if (listeners > 0) {
        await supabase.from('creator_stats').upsert({
          creator_id: upserted.id,
          recorded_at: todayISO,
          subscribers: listeners,
          followers: listeners,
          total_views: playcount,
          total_posts: null,
        }, { onConflict: 'creator_id,recorded_at' });
      }

      inserted++;
      if (inserted % 50 === 0) {
        console.log(`  Progress: ${inserted}/${allArtists.length} — ${artist.name} (${listeners.toLocaleString()} listeners)`);
      }
    } catch (err) {
      console.error(`  ❌ ${artist.name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Seeded: ${inserted}`);
  console.log(`   Errors: ${errors}`);
}

seed().catch(console.error);
