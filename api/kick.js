// Vercel Serverless Function for Kick API
// Keeps client secret secure on server-side

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const KICK_API_BASE = 'https://api.kick.com/public/v1';
const KICK_AUTH_URL = 'https://id.kick.com/oauth/token';

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken(retryCount = 0) {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 3000; // 3 seconds

  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
    throw new Error(`Missing Kick credentials: CLIENT_ID=${!!KICK_CLIENT_ID}, SECRET=${!!KICK_CLIENT_SECRET}`);
  }

  try {
    const response = await fetch(KICK_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: KICK_CLIENT_ID,
        client_secret: KICK_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Check if it's a temporary database issue from Kick
      const isTemporaryError = errorText.includes('read-only transaction') ||
                               errorText.includes('SQLSTATE');

      if (isTemporaryError && retryCount < MAX_RETRIES) {
        console.log(`Kick auth temporarily unavailable. Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return getAccessToken(retryCount + 1);
      }

      throw new Error(`Failed to get Kick access token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Set expiry 5 minutes before actual expiry for safety
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    return cachedToken;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`Network error during Kick auth. Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return getAccessToken(retryCount + 1);
    }
    throw error;
  }
}

async function kickFetch(endpoint) {
  const token = await getAccessToken();
  const response = await fetch(`${KICK_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kick API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getChannelBySlug(slug) {
  // Get channel info by slug
  const channelData = await kickFetch(`/channels?slug=${encodeURIComponent(slug)}`);
  const channels = channelData.data || [];

  if (channels.length === 0) {
    return null;
  }

  const channel = channels[0];

  // Get user info for profile picture
  let profileImage = channel.banner_picture || null;
  try {
    const userData = await kickFetch(`/users?id=${channel.broadcaster_user_id}`);
    const users = userData.data || [];
    if (users.length > 0) {
      profileImage = users[0].profile_picture || profileImage;
    }
  } catch {
    // Use banner as fallback
  }

  return {
    platform: 'kick',
    platformId: String(channel.broadcaster_user_id),
    username: channel.slug,
    displayName: channel.slug,
    profileImage,
    description: channel.channel_description || '',
    category: channel.category?.name || null,
    subscribers: channel.active_subscribers_count || 0,
    isLive: channel.stream?.is_live || false,
    viewerCount: channel.stream?.viewer_count || 0,
    streamTitle: channel.stream?.stream_title || null,
  };
}

async function searchChannels(query, maxResults = 25) {
  // Kick has no search API — search our database with fuzzy matching,
  // then fall back to a direct slug lookup if nothing found.
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const sanitized = query.toLowerCase().trim().replace(/[,%()\\]/g, '');
  if (!sanitized) return [];

  // Skip the RPC round-trip if the stripped query is too short to be useful
  const stripped = sanitized.replace(/[._\-\s]/g, '');
  if (stripped.length >= 2) {
    // Step 1: Fuzzy search — same function used for TikTok and other DB platforms
    const { data: creators, error } = await supabase.rpc('search_creators_fuzzy', {
      p_query: sanitized,
      p_platform: 'kick',
      p_limit: maxResults,
    });

    if (error) {
      console.error('Database fuzzy search error:', error);
      // Fall through to API fallback below
    } else if (creators && creators.length > 0) {
      // Step 2: Fetch latest stats for matched creators
      const creatorIds = creators.map(c => c.id);
      const { data: stats } = await supabase
        .from('creator_stats')
        .select('creator_id, subscribers, recorded_at')
        .in('creator_id', creatorIds)
        .order('recorded_at', { ascending: false });

      const statsMap = new Map();
      if (stats) {
        for (const stat of stats) {
          if (!statsMap.has(stat.creator_id)) {
            statsMap.set(stat.creator_id, stat);
          }
        }
      }

      return creators.map(creator => ({
        platform: 'kick',
        platformId: creator.platform_id,
        username: creator.username,
        displayName: creator.display_name || creator.username,
        profileImage: creator.profile_image,
        description: creator.description || '',
        category: creator.category,
        subscribers: statsMap.get(creator.id)?.subscribers || 0,
        isLive: false,
        viewerCount: 0,
        streamTitle: null,
      }));
    }
  }

  // Step 3: No database results — try Kick API as a direct slug lookup
  // Use sanitized (not stripped) so "kai-cenat" stays as "kai-cenat"
  try {
    const slug = sanitized.replace(/[^a-z0-9_-]/g, '');
    if (!slug) return [];

    const channel = await getChannelBySlug(slug);
    if (channel) {
      return [channel];
    }
  } catch (apiError) {
    console.error('Kick API fallback error:', apiError);
  }

  return [];
}

async function getLiveStreams(slugs) {
  if (!slugs || slugs.length === 0) return [];

  const token = await getAccessToken();

  // Kick livestreams endpoint uses broadcaster_user_id, but we can also check channels by slug
  // Batch up to 50 slugs per request
  const batchSize = 50;
  const allLive = [];

  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize);
    const slugParams = batch.map(s => `slug=${encodeURIComponent(s)}`).join('&');

    try {
      const channelData = await kickFetch(`/channels?${slugParams}`);
      const channels = channelData.data || [];

      for (const channel of channels) {
        if (channel.stream?.is_live) {
          allLive.push({
            username: channel.slug,
            displayName: channel.slug,
            title: channel.stream.stream_title || '',
            gameName: channel.category?.name || '',
            viewerCount: channel.stream.viewer_count || 0,
            thumbnailUrl: channel.stream.thumbnail || '',
            startedAt: channel.stream.start_time || '',
          });
        }
      }
    } catch {
      // Continue with next batch
    }
  }

  return allLive;
}

export default async function handler(req, res) {
  // Enable CORS - Allow production and localhost
  const allowedOrigins = [
    'https://shinypull.com',
    'https://www.shinypull.com',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 60 requests per minute
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(`kick:${clientId}`, 60, 60000);

  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { action, query, username, maxResults } = req.query;

  try {
    if (action === 'search' && query) {
      const results = await searchChannels(query, maxResults ? parseInt(maxResults, 10) : 25);
      return res.status(200).json({ data: results });
    }

    if (action === 'channel' && username) {
      const channel = await getChannelBySlug(username);
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      return res.status(200).json({ data: channel });
    }

    if (action === 'streams') {
      const { usernames } = req.query;
      if (!usernames) {
        return res.status(400).json({ error: 'Missing usernames parameter' });
      }
      const usernameList = usernames.split(',').map(u => u.trim()).filter(Boolean);
      const streams = await getLiveStreams(usernameList);
      return res.status(200).json({ data: streams });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=search&query=..., ?action=channel&username=..., or ?action=streams&usernames=...' });
  } catch (error) {
    console.error('Kick API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
