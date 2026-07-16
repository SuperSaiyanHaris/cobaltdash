/**
 * Discover Bluesky creators
 *
 * Strategy: search the public AT Protocol API for a curated set of popular
 * topic/keyword queries, take everyone with 10K+ followers, and add anything
 * new to the DB. No API key required.
 *
 * Runs from the Creator Discovery GitHub Action 4x daily.
 *
 * Usage: node scripts/discoverBlueskyCreators.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const BASE_URL = 'https://public.api.bsky.app/xrpc';
const MIN_FOLLOWERS = 10_000;
const MAX_PER_RUN = 100;

// Topic seeds. AT Protocol's searchActors ranks by relevance + popularity,
// so these surface the prominent voices in each space rather than randos.
const SEED_QUERIES = [
  'news', 'politics', 'tech', 'science', 'art', 'music', 'gaming',
  'sports', 'comedy', 'food', 'film', 'tv', 'books', 'photography',
  'design', 'crypto', 'finance', 'climate', 'space', 'ai',
  'journalist', 'writer', 'developer', 'engineer', 'creator',
];

async function searchActors(query, limit = 50) {
  const url = `${BASE_URL}/app.bsky.actor.searchActors?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  search failed for "${query}": HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.actors || [];
}

async function getProfileDetails(did) {
  const url = `${BASE_URL}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function existingDids() {
  const set = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('platform_id')
      .eq('platform', 'bluesky')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this existing-id set would be
      // incomplete and we'd re-insert duplicate creators.
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => r.platform_id && set.add(r.platform_id));
    if (data.length < 1000) break;
    from += 1000;
  }
  return set;
}

async function addCreator(profile) {
  const { data, error } = await supabase
    .from('creators')
    .insert({
      platform: 'bluesky',
      platform_id: profile.did,
      username: profile.handle,
      display_name: profile.displayName || profile.handle,
      profile_image: profile.avatar || null,
      description: (profile.description || '').substring(0, 500) || null,
      country: null,
      category: null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return null; // unique violation, already added concurrently
    console.error(`  insert failed for ${profile.handle}: ${error.message}`);
    return null;
  }
  return data;
}

async function addInitialStats(creatorId, profile) {
  const { error } = await supabase.from('creator_stats').insert({
    creator_id: creatorId,
    recorded_at: new Date().toISOString().split('T')[0],
    subscribers: profile.followersCount || 0,
    followers: profile.followersCount || 0,
    total_views: null,
    total_posts: profile.postsCount || 0,
  });
  if (error) console.error(`  stats insert failed: ${error.message}`);
}

async function main() {
  console.log('🦋 Bluesky creator discovery starting...\n');

  const existing = await existingDids();
  console.log(`📊 Already tracking ${existing.size} Bluesky creators\n`);

  // Collect candidates across all seed queries
  const candidates = new Map(); // did -> actor stub
  for (const query of SEED_QUERIES) {
    const actors = await searchActors(query, 50);
    for (const a of actors) {
      if (!a.did || existing.has(a.did)) continue;
      if (!candidates.has(a.did)) candidates.set(a.did, a);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`🔎 Found ${candidates.size} candidate profiles across ${SEED_QUERIES.length} topics\n`);

  let added = 0;
  for (const [did] of candidates) {
    if (added >= MAX_PER_RUN) break;

    // searchActors doesn't include follower count, so we fetch the full profile
    const profile = await getProfileDetails(did);
    if (!profile) continue;

    const followers = profile.followersCount || 0;
    if (followers < MIN_FOLLOWERS) continue;

    const created = await addCreator(profile);
    if (created) {
      await addInitialStats(created.id, profile);
      added++;
      console.log(`   ✅ ${profile.handle} (${followers.toLocaleString()} followers)`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n✨ Done. Added ${added} new Bluesky creators.`);
}

main().catch((e) => {
  console.error('❌ Discovery failed:', e);
  process.exit(1);
});
