/**
 * Discover YouTube Creators
 *
 * Automatically discovers and adds new YouTube creators to the database.
 * Searches various categories and adds channels above a subscriber threshold.
 *
 * Usage: npm run discover:youtube
 *
 * Runs daily via GitHub Action to gradually build up the creator database.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

const BASE_URL = 'https://www.googleapis.com/youtube/v3';
const MIN_SUBSCRIBERS = 10000; // Only add channels with 10K+ subs
const MAX_CHANNELS_PER_RUN = 100; // Limit per run to manage API quota
const SEARCH_RESULTS_PER_QUERY = 25; // Results per search query

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Search queries organized by category
// We'll rotate through these to get variety
const SEARCH_QUERIES = [
  // Gaming
  'gaming channel', 'minecraft youtuber', 'fortnite gameplay', 'roblox gaming',
  'call of duty gaming', 'gta gaming', 'valorant gameplay', 'league of legends',
  'apex legends', 'pokemon gaming', 'nintendo gaming', 'playstation gaming',

  // Tech
  'tech review', 'smartphone review', 'laptop review', 'pc build',
  'tech tips', 'gadget review', 'unboxing tech', 'coding tutorial',

  // Entertainment
  'comedy channel', 'prank videos', 'challenge videos', 'react channel',
  'commentary channel', 'storytime youtube', 'animation channel',

  // Music
  'music channel', 'cover songs', 'music producer', 'rapper channel',
  'singer songwriter', 'music reaction',

  // Lifestyle
  'vlog channel', 'daily vlog', 'travel vlog', 'fitness youtube',
  'cooking channel', 'recipe videos', 'food review', 'mukbang',

  // Education
  'educational channel', 'science youtube', 'history channel', 'math tutorial',
  'language learning', 'documentary channel',

  // Beauty & Fashion
  'makeup tutorial', 'beauty channel', 'fashion haul', 'skincare routine',

  // Sports — creator/genre content
  'sports highlights', 'basketball youtube', 'fitness workout', 'gym motivation',

  // Sports — official team & league channels. Generic genre terms like
  // "football channel" or "soccer highlights" reliably surface commentary
  // and highlight-reel creators, but NOT official team/league channels —
  // those need to be searched by name to show up at all. This is why teams
  // as big as Real Madrid or FC Barcelona went unnoticed by discovery for
  // months despite tens of millions of subscribers each.
  'Real Madrid', 'FC Barcelona', 'Manchester United', 'Manchester City',
  'Liverpool FC', 'Chelsea FC', 'Arsenal', 'Bayern Munich',
  'Paris Saint-Germain', 'Juventus', 'Inter Milan', 'Borussia Dortmund',
  'NBA', 'Los Angeles Lakers', 'Golden State Warriors', 'Boston Celtics',
  'NFL', 'Dallas Cowboys', 'Kansas City Chiefs',
  'MLB', 'New York Yankees', 'NHL',

  // Other popular
  'asmr channel', 'car review', 'diy projects', 'crafts channel',
  'pet videos', 'cat videos', 'dog channel', 'satisfying videos',
];

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
 * Search YouTube for channels
 */
async function searchChannels(query, maxResults = SEARCH_RESULTS_PER_QUERY) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: maxResults.toString(),
    key: YOUTUBE_API_KEY,
  });

  const response = await fetch(`${BASE_URL}/search?${params}`);
  const data = await response.json();

  if (data.error) {
    throw new Error(`YouTube Search API error: ${data.error.message}`);
  }

  return data.items?.map(item => item.id.channelId) || [];
}

/**
 * Get channel details by IDs (up to 50 at a time)
 */
async function getChannelDetails(channelIds) {
  if (channelIds.length === 0) return [];

  const params = new URLSearchParams({
    part: 'snippet,statistics,brandingSettings',
    id: channelIds.join(','),
    key: YOUTUBE_API_KEY,
  });

  const response = await fetch(`${BASE_URL}/channels?${params}`);
  const data = await response.json();

  if (data.error) {
    throw new Error(`YouTube Channels API error: ${data.error.message}`);
  }

  return data.items || [];
}

/**
 * Transform YouTube API channel to our database format
 */
function transformChannel(channel) {
  const snippet = channel.snippet || {};
  const statistics = channel.statistics || {};
  const branding = channel.brandingSettings?.channel || {};

  // Skip channels without a customUrl (topic/system channels with no public page)
  if (!snippet.customUrl) {
    return null;
  }

  return {
    platform: 'youtube',
    platform_id: channel.id,
    username: snippet.customUrl.replace('@', ''),
    display_name: snippet.title,
    profile_image: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
    description: snippet.description?.substring(0, 500) || null,
    country: branding.country || snippet.country || null,
    category: null,
  };
}

/**
 * Get existing YouTube channel IDs from database
 */
async function getExistingChannelIds() {
  const allIds = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('platform_id')
      .eq('platform', 'youtube')
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
    // Ignore duplicate errors (race condition protection)
    if (error.code === '23505') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Add initial stats for a creator
 */
async function addInitialStats(creatorId, channel) {
  const statistics = channel.statistics || {};

  const { error } = await supabase
    .from('creator_stats')
    .insert({
      creator_id: creatorId,
      recorded_at: getTodayLocal(),
      subscribers: parseInt(statistics.subscriberCount) || 0,
      total_views: parseInt(statistics.viewCount) || 0,
      total_posts: parseInt(statistics.videoCount) || 0,
    });

  if (error && error.code !== '23505') {
    console.error(`   Failed to add stats: ${error.message}`);
  }
}

/**
 * Select random queries for this run
 */
function selectQueries(count) {
  const shuffled = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Main discovery function
 */
async function discoverCreators() {
  console.log(`\n🔍 YouTube Creator Discovery - ${getTodayLocal()}\n`);

  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API key not configured');
  }

  // Get existing channels to avoid duplicates
  console.log('📊 Loading existing creators...');
  const existingIds = await getExistingChannelIds();
  console.log(`   Found ${existingIds.size} existing YouTube creators\n`);

  // Select random queries for variety
  const queries = selectQueries(8); // 8 queries * 25 results = 200 potential channels
  console.log(`🎯 Searching with ${queries.length} queries:\n   ${queries.join(', ')}\n`);

  // Discover channels
  const discoveredChannelIds = new Set();

  for (const query of queries) {
    try {
      const channelIds = await searchChannels(query);
      channelIds.forEach(id => discoveredChannelIds.add(id));
      console.log(`   "${query}" → ${channelIds.length} channels`);
    } catch (error) {
      console.error(`   "${query}" → Error: ${error.message}`);
    }

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n📋 Found ${discoveredChannelIds.size} unique channels\n`);

  // Filter out existing channels
  const newChannelIds = [...discoveredChannelIds].filter(id => !existingIds.has(id));
  console.log(`🆕 ${newChannelIds.length} are new (not in database)\n`);

  if (newChannelIds.length === 0) {
    console.log('✅ No new channels to add today!\n');
    return { discovered: 0, added: 0 };
  }

  // Get details for new channels (in batches of 50)
  console.log('📥 Fetching channel details...');
  const allChannelDetails = [];

  for (let i = 0; i < newChannelIds.length; i += 50) {
    const batch = newChannelIds.slice(i, i + 50);
    const details = await getChannelDetails(batch);
    allChannelDetails.push(...details);
    console.log(`   Batch ${Math.floor(i / 50) + 1}: ${details.length} channels`);
  }

  // Filter by subscriber count
  const qualifiedChannels = allChannelDetails.filter(channel => {
    const subs = parseInt(channel.statistics?.subscriberCount) || 0;
    return subs >= MIN_SUBSCRIBERS;
  });

  console.log(`\n🎖️  ${qualifiedChannels.length} channels meet minimum ${MIN_SUBSCRIBERS.toLocaleString()} subscriber threshold\n`);

  // Sort by subscribers (highest first) and limit
  qualifiedChannels.sort((a, b) => {
    const subsA = parseInt(a.statistics?.subscriberCount) || 0;
    const subsB = parseInt(b.statistics?.subscriberCount) || 0;
    return subsB - subsA;
  });

  const channelsToAdd = qualifiedChannels.slice(0, MAX_CHANNELS_PER_RUN);

  // Add channels to database
  let added = 0;
  console.log(`➕ Adding up to ${channelsToAdd.length} creators...\n`);

  for (const channel of channelsToAdd) {
    const subs = parseInt(channel.statistics?.subscriberCount) || 0;
    const name = channel.snippet?.title || 'Unknown';

    try {
      const creatorData = transformChannel(channel);
      if (!creatorData) {
        console.log(`   ⏭️  ${name} (no public page, skipping)`);
        continue;
      }
      const creator = await addCreator(creatorData);

      if (creator) {
        await addInitialStats(creator.id, channel);
        added++;
        console.log(`   ✅ ${name} (${subs.toLocaleString()} subs)`);
      } else {
        console.log(`   ⏭️  ${name} (already exists)`);
      }
    } catch (error) {
      console.error(`   ❌ ${name}: ${error.message}`);
    }
  }

  console.log(`\n✨ Discovery complete! Added ${added} new creators.\n`);

  return { discovered: discoveredChannelIds.size, added };
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
