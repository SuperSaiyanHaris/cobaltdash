/**
 * Discover Twitch Creators
 *
 * Automatically discovers and adds new Twitch streamers to the database.
 * Pulls from top live streams across popular game categories.
 *
 * Usage: npm run discover:twitch
 *
 * Runs daily via GitHub Action to gradually build up the creator database.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) { console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run without it.'); process.exit(1); }
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.VITE_TWITCH_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET;

const MIN_FOLLOWERS = 5000; // Only add streamers with 5K+ followers
const MAX_STREAMERS_PER_RUN = 100; // Limit per run
const TOP_GAMES_TO_CHECK = 20; // Number of top games to pull streamers from
const STREAMS_PER_GAME = 50; // Streams to fetch per game

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

let accessToken = null;

/**
 * Get today's date for logging
 */
function getTodayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Get Twitch OAuth token
 */
async function getAccessToken() {
  if (accessToken) return accessToken;

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();
  if (data.access_token) {
    accessToken = data.access_token;
    return accessToken;
  }
  throw new Error('Failed to get Twitch access token');
}

/**
 * Make authenticated Twitch API request
 */
async function twitchFetch(endpoint) {
  const token = await getAccessToken();
  const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Twitch API error: ${error.message || response.status}`);
  }

  return response.json();
}

/**
 * Get top games on Twitch
 */
async function getTopGames(count = TOP_GAMES_TO_CHECK) {
  const data = await twitchFetch(`/games/top?first=${count}`);
  return data.data || [];
}

/**
 * Get live streams for a game
 */
async function getStreamsForGame(gameId, count = STREAMS_PER_GAME) {
  const data = await twitchFetch(`/streams?game_id=${gameId}&first=${count}`);
  return data.data || [];
}

/**
 * Get top streams across all categories
 */
async function getTopStreams(count = 100) {
  const data = await twitchFetch(`/streams?first=${count}`);
  return data.data || [];
}

/**
 * Get user details by IDs (up to 100)
 */
async function getUsersByIds(userIds) {
  if (userIds.length === 0) return [];

  const params = userIds.map(id => `id=${id}`).join('&');
  const data = await twitchFetch(`/users?${params}`);
  return data.data || [];
}

/**
 * Get follower count for a broadcaster
 */
async function getFollowerCount(broadcasterId) {
  try {
    const data = await twitchFetch(`/channels/followers?broadcaster_id=${broadcasterId}&first=1`);
    return data.total || 0;
  } catch (error) {
    console.warn(`   Failed to get followers for ${broadcasterId}: ${error.message}`);
    return 0;
  }
}

/**
 * Get existing Twitch user IDs from database
 */
async function getExistingUserIds() {
  const allIds = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('platform_id')
      .eq('platform', 'twitch')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this existing-id set would be
      // incomplete and we'd re-insert duplicate creators.
      .order('id')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    data.forEach(c => allIds.add(c.platform_id));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allIds;
}

/**
 * Add a creator to the database
 */
async function addCreator(creator) {
  const { data, error } = await supabase
    .from('creators')
    .insert(creator)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return null; // Duplicate
    throw error;
  }

  return data;
}

/**
 * Add initial stats for a creator
 */
async function addInitialStats(creatorId, followers) {
  const { error } = await supabase
    .from('creator_stats')
    .insert({
      creator_id: creatorId,
      recorded_at: getTodayLocal(),
      followers: followers,
      subscribers: followers,
      total_views: 0,
      total_posts: 0,
    });

  if (error && error.code !== '23505') {
    console.error(`   Failed to add stats: ${error.message}`);
  }
}

/**
 * Main discovery function
 */
async function discoverCreators() {
  console.log(`\n🎮 Twitch Creator Discovery - ${getTodayLocal()}\n`);

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error('Twitch credentials not configured');
  }

  // Get existing streamers to avoid duplicates
  console.log('📊 Loading existing creators...');
  const existingIds = await getExistingUserIds();
  console.log(`   Found ${existingIds.size} existing Twitch creators\n`);

  // Discover streamers from top games
  console.log(`🎯 Fetching top ${TOP_GAMES_TO_CHECK} games...\n`);
  const topGames = await getTopGames();

  const discoveredUserIds = new Set();
  const userIdToStream = new Map(); // Track stream info for later

  // Get top streams overall first
  console.log('📺 Fetching top streams overall...');
  const topStreams = await getTopStreams(100);
  for (const stream of topStreams) {
    discoveredUserIds.add(stream.user_id);
    userIdToStream.set(stream.user_id, stream);
  }
  console.log(`   Found ${topStreams.length} top streams\n`);

  // Get streams from each top game
  console.log('🎮 Fetching streams by game category:\n');
  for (const game of topGames) {
    try {
      const streams = await getStreamsForGame(game.id, STREAMS_PER_GAME);
      for (const stream of streams) {
        discoveredUserIds.add(stream.user_id);
        userIdToStream.set(stream.user_id, stream);
      }
      console.log(`   ${game.name}: ${streams.length} streams`);
    } catch (error) {
      console.error(`   ${game.name}: Error - ${error.message}`);
    }

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n📋 Found ${discoveredUserIds.size} unique streamers\n`);

  // Filter out existing streamers
  const newUserIds = [...discoveredUserIds].filter(id => !existingIds.has(id));
  console.log(`🆕 ${newUserIds.length} are new (not in database)\n`);

  if (newUserIds.length === 0) {
    console.log('✅ No new streamers to add today!\n');
    return { discovered: 0, added: 0 };
  }

  // Get user details (in batches of 100)
  console.log('📥 Fetching user details...');
  const allUsers = [];

  for (let i = 0; i < newUserIds.length; i += 100) {
    const batch = newUserIds.slice(i, i + 100);
    const users = await getUsersByIds(batch);
    allUsers.push(...users);
    console.log(`   Batch ${Math.floor(i / 100) + 1}: ${users.length} users`);
  }

  // Get follower counts and filter
  console.log('\n👥 Checking follower counts...');
  const qualifiedStreamers = [];

  for (const user of allUsers) {
    const followers = await getFollowerCount(user.id);

    if (followers >= MIN_FOLLOWERS) {
      qualifiedStreamers.push({
        user,
        followers,
        stream: userIdToStream.get(user.id),
      });
    }

    // Rate limit - Twitch allows 800 requests per minute
    await new Promise(r => setTimeout(r, 80));
  }

  console.log(`\n🎖️  ${qualifiedStreamers.length} streamers meet minimum ${MIN_FOLLOWERS.toLocaleString()} follower threshold\n`);

  // Sort by followers (highest first) and limit
  qualifiedStreamers.sort((a, b) => b.followers - a.followers);
  const streamersToAdd = qualifiedStreamers.slice(0, MAX_STREAMERS_PER_RUN);

  // Add streamers to database
  let added = 0;
  console.log(`➕ Adding up to ${streamersToAdd.length} creators...\n`);

  for (const { user, followers } of streamersToAdd) {
    try {
      const creatorData = {
        platform: 'twitch',
        platform_id: user.id,
        username: user.login,
        display_name: user.display_name,
        profile_image: user.profile_image_url,
        description: user.description?.substring(0, 500) || null,
        country: null,
        category: null,
      };

      const creator = await addCreator(creatorData);

      if (creator) {
        await addInitialStats(creator.id, followers);
        added++;
        console.log(`   ✅ ${user.display_name} (${followers.toLocaleString()} followers)`);
      } else {
        console.log(`   ⏭️  ${user.display_name} (already exists)`);
      }
    } catch (error) {
      console.error(`   ❌ ${user.display_name}: ${error.message}`);
    }
  }

  console.log(`\n✨ Discovery complete! Added ${added} new creators.\n`);

  return { discovered: discoveredUserIds.size, added };
}

// Run discovery
discoverCreators()
  .then(({ discovered, added }) => {
    console.log(`📊 Summary: Discovered ${discovered}, Added ${added}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Discovery failed:', error.message);
    process.exit(1);
  });
