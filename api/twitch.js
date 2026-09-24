// Vercel Serverless Function for Twitch API
// Keeps client secret secure on server-side

import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiry = 0;

export async function getAccessToken() {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error(`Missing credentials: CLIENT_ID=${!!TWITCH_CLIENT_ID}, SECRET=${!!TWITCH_CLIENT_SECRET}`);
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Twitch access token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Set expiry 5 minutes before actual expiry for safety
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

  return cachedToken;
}

async function searchChannels(query, maxResults = 25) {
  const token = await getAccessToken();

  // Clamp maxResults between 1 and 100 (Twitch API limit)
  const limit = Math.max(1, Math.min(100, maxResults));

  const response = await fetch(
    `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=${limit}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to search Twitch channels');
  }

  const data = await response.json();
  const channels = data.data || [];

  if (channels.length === 0) {
    return [];
  }

  // Fetch follower counts in parallel for all channels
  const followerPromises = channels.map(async (channel) => {
    try {
      const followersResponse = await fetch(
        `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channel.id}&first=1`,
        {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      if (followersResponse.ok) {
        const followersData = await followersResponse.json();
        return { id: channel.id, followers: followersData.total || 0 };
      }
    } catch (e) {
      // Ignore individual failures
    }
    return { id: channel.id, followers: 0 };
  });

  const followerResults = await Promise.all(followerPromises);
  const followerMap = new Map(followerResults.map(r => [r.id, r.followers]));

  return channels.map(channel => ({
    platform: 'twitch',
    platformId: channel.id,
    username: channel.broadcaster_login,
    displayName: channel.display_name,
    profileImage: channel.thumbnail_url,
    isLive: channel.is_live,
    category: channel.game_name,
    followers: followerMap.get(channel.id) || 0,
  }));
}

async function getChannelByUsername(username) {
  const token = await getAccessToken();

  // Get user info
  const userResponse = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!userResponse.ok) {
    throw new Error('Failed to get Twitch user');
  }

  const userData = await userResponse.json();
  if (!userData.data || userData.data.length === 0) {
    return null;
  }

  const user = userData.data[0];

  // Get follower count
  const followersResponse = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}&first=1`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!followersResponse.ok) {
    const errText = await followersResponse.text();
    throw new Error(`Twitch followers API ${followersResponse.status}: ${errText}`);
  }
  const followersData = await followersResponse.json();
  if (followersData.total === undefined) {
    throw new Error('Twitch followers API returned no total field');
  }
  const followers = followersData.total;

  // Get channel info (for game/category)
  const channelResponse = await fetch(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${user.id}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  let category = null;
  if (channelResponse.ok) {
    const channelData = await channelResponse.json();
    if (channelData.data && channelData.data.length > 0) {
      category = channelData.data[0].game_name || null;
    }
  }

  return {
    platform: 'twitch',
    platformId: user.id,
    username: user.login,
    displayName: user.display_name,
    profileImage: user.profile_image_url,
    description: user.description,
    category: category,
    followers: followers,
    totalViews: user.view_count || 0,
    createdAt: user.created_at,
    broadcasterType: user.broadcaster_type, // '', 'affiliate', 'partner'
  };
}

function transformChannel(channel) {
  return {
    platform: 'twitch',
    platformId: channel.id,
    username: channel.broadcaster_login,
    displayName: channel.display_name,
    profileImage: channel.thumbnail_url,
    isLive: channel.is_live,
    category: channel.game_name,
  };
}

// Check live status for multiple usernames
async function getLiveStreams(usernames) {
  if (!usernames || usernames.length === 0) return [];

  const token = await getAccessToken();

  // Twitch API allows up to 100 user_login params
  const logins = usernames.slice(0, 100).map(u => `user_login=${encodeURIComponent(u)}`).join('&');

  const response = await fetch(
    `https://api.twitch.tv/helix/streams?${logins}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get live streams');
  }

  const data = await response.json();
  const streams = data.data || [];

  // Return map of username -> stream info
  return streams.map(stream => ({
    username: stream.user_login,
    displayName: stream.user_name,
    title: stream.title,
    gameName: stream.game_name,
    viewerCount: stream.viewer_count,
    thumbnailUrl: stream.thumbnail_url,
    startedAt: stream.started_at,
  }));
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
  const rateLimit = checkRateLimit(`twitch:${clientId}`, 60, 60000);

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
      const channel = await getChannelByUsername(username);
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
    console.error('Twitch API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
