// Vercel Serverless Function for YouTube API
// Keeps API key secure on server-side

import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Thrown specifically for quota/rate-limit exhaustion so the handler can
// respond with a clean, generic message instead of Google's raw error body
// (which is a large JSON blob of internal project/quota details — never
// something to show a user). Callers on the frontend degrade gracefully
// (fall back to database search) rather than surfacing this as an error.
class YouTubeUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'YouTubeUnavailableError';
    this.quotaExceeded = true;
  }
}

// Converts a failed YouTube API response into a clean error safe to return
// to the client. The raw response body is attached as `.rawDetails` for
// server-side logging only — it must never reach `res.json()`.
function toCleanYouTubeError(status, rawBody) {
  let reason = '';
  try {
    reason = JSON.parse(rawBody)?.error?.errors?.[0]?.reason || '';
  } catch {
    // rawBody wasn't JSON — fall through with reason left blank
  }
  const isQuota = status === 429 || status === 403 || reason === 'rateLimitExceeded' || reason === 'quotaExceeded';
  const err = isQuota
    ? new YouTubeUnavailableError('YouTube search is temporarily unavailable.')
    : new Error('YouTube API request failed.');
  err.rawDetails = `${status} - ${rawBody}`;
  return err;
}

/**
 * Search for YouTube channels (includes statistics)
 */
async function searchChannels(query, maxResults = 25) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('Missing YouTube API key');
  }

  // Clamp maxResults between 1 and 50 (YouTube API limit)
  const limit = Math.max(1, Math.min(50, maxResults));

  // Step 1: Search for channels
  const searchResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=${limit}&key=${YOUTUBE_API_KEY}`
  );

  if (!searchResponse.ok) {
    throw toCleanYouTubeError(searchResponse.status, await searchResponse.text());
  }

  const searchData = await searchResponse.json();

  if (!searchData.items || searchData.items.length === 0) {
    return [];
  }

  // Step 2: Get channel IDs and fetch statistics in batch
  const channelIds = searchData.items.map(item => item.snippet.channelId).join(',');

  const statsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?` +
    `part=snippet,statistics&id=${channelIds}&key=${YOUTUBE_API_KEY}`
  );

  if (!statsResponse.ok) {
    // If stats fetch fails, return basic results without stats
    return searchData.items.map(item => ({
      platform: 'youtube',
      platformId: item.snippet.channelId,
      id: item.snippet.channelId,
      username: item.snippet.channelTitle,
      displayName: item.snippet.channelTitle,
      profileImage: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      description: item.snippet.description,
    }));
  }

  const statsData = await statsResponse.json();

  // Create a map of channel stats by ID
  const statsMap = new Map();
  (statsData.items || []).forEach(channel => {
    statsMap.set(channel.id, {
      subscribers: parseInt(channel.statistics?.subscriberCount || 0),
      totalViews: parseInt(channel.statistics?.viewCount || 0),
      totalPosts: parseInt(channel.statistics?.videoCount || 0),
      customUrl: channel.snippet?.customUrl,
    });
  });

  // Merge search results with statistics
  return searchData.items.map(item => {
    const stats = statsMap.get(item.snippet.channelId) || {};
    return {
      platform: 'youtube',
      platformId: item.snippet.channelId,
      id: item.snippet.channelId,
      username: (stats.customUrl?.replace('@', '') || item.snippet.channelTitle.replace(/\s+/g, '')).toLowerCase(),
      displayName: item.snippet.channelTitle,
      profileImage: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      description: item.snippet.description,
      subscribers: stats.subscribers || 0,
      totalViews: stats.totalViews || 0,
      totalPosts: stats.totalPosts || 0,
    };
  });
}

/**
 * Get channel details by ID
 */
async function getChannel(channelId) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('Missing YouTube API key');
  }

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?` +
    `part=snippet,statistics,brandingSettings&id=${channelId}&key=${YOUTUBE_API_KEY}`
  );

  if (!response.ok) {
    throw toCleanYouTubeError(response.status, await response.text());
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error('Channel not found');
  }

  const channel = data.items[0];
  const snippet = channel.snippet;
  const statistics = channel.statistics;
  const branding = channel.brandingSettings;

  return {
    platform: 'youtube',
    platformId: channel.id,
    id: channel.id,
    username: (snippet.customUrl?.replace('@', '') || snippet.title.replace(/\s+/g, '')).toLowerCase(),
    displayName: snippet.title,
    profileImage: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
    bannerImage: branding?.image?.bannerExternalUrl,
    description: snippet.description,
    country: snippet.country,
    category: null,
    subscribers: parseInt(statistics.subscriberCount || 0),
    totalViews: parseInt(statistics.viewCount || 0),
    totalPosts: parseInt(statistics.videoCount || 0),
    hiddenSubscribers: statistics.hiddenSubscriberCount || false,
    hasPublicPage: !!snippet.customUrl,
    createdAt: snippet.publishedAt,
  };
}

/**
 * Get channel by username
 */
async function getChannelByUsername(username) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('Missing YouTube API key');
  }

  // Try with forHandle (new method for @handles)
  const handleUsername = username.startsWith('@') ? username : `@${username}`;
  let response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?` +
    `part=snippet,statistics,brandingSettings&forHandle=${encodeURIComponent(handleUsername.slice(1))}&key=${YOUTUBE_API_KEY}`
  );

  if (response.ok) {
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const channel = data.items[0];
      const snippet = channel.snippet;
      const statistics = channel.statistics;
      const branding = channel.brandingSettings;

      return {
        platform: 'youtube',
        platformId: channel.id,
        id: channel.id,
        username: (snippet.customUrl?.replace('@', '') || snippet.title.replace(/\s+/g, '')).toLowerCase(),
        displayName: snippet.title,
        profileImage: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
        bannerImage: branding?.image?.bannerExternalUrl,
        description: snippet.description,
        country: snippet.country,
        category: null,
        subscribers: parseInt(statistics.subscriberCount || 0),
        totalViews: parseInt(statistics.viewCount || 0),
        totalPosts: parseInt(statistics.videoCount || 0),
        hiddenSubscribers: statistics.hiddenSubscriberCount || false,
        hasPublicPage: !!snippet.customUrl,
        createdAt: snippet.publishedAt,
      };
    }
  }

  // Fallback: search for channel, but only return if the result's handle
  // closely matches the requested username (prevents "music" → "musictravellove")
  const searchResults = await searchChannels(username);
  if (searchResults.length === 0) {
    throw new Error('Channel not found');
  }

  // Get full details of the first result
  const topResult = await getChannel(searchResults[0].id);

  // Verify the result actually matches — exact username match only
  const resultUsername = (topResult.username || '').toLowerCase();
  const requestedUsername = username.toLowerCase();
  if (resultUsername === requestedUsername) {
    return topResult;
  }

  // If the top result doesn't match, throw not found rather than returning wrong channel
  throw new Error('Channel not found');
}

/**
 * Get the most recent videos for a channel (newest first). Both calls below
 * cost a flat 1 quota unit regardless of how many items/IDs are requested (up
 * to 50), so asking for 5 instead of 1 doesn't cost any more YouTube quota.
 */
async function getRecentVideos(channelId, count = 5) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('Missing YouTube API key');
  }

  // The uploads playlist ID is the channel ID with "UC" replaced by "UU"
  const uploadsPlaylistId = 'UU' + channelId.slice(2);

  const playlistResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?` +
    `part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${count}&key=${YOUTUBE_API_KEY}`
  );

  if (!playlistResponse.ok) {
    return [];
  }

  const playlistData = await playlistResponse.json();
  if (!playlistData.items || playlistData.items.length === 0) {
    return [];
  }

  const items = playlistData.items.filter((item) => item.snippet?.resourceId?.videoId);
  const videoIds = items.map((item) => item.snippet.resourceId.videoId);

  // One batched statistics call for every video ID, same 1-unit cost as a single ID.
  const statsById = {};
  const videoResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?` +
    `part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
  );
  if (videoResponse.ok) {
    const videoData = await videoResponse.json();
    for (const item of videoData.items || []) {
      statsById[item.id] = item.statistics;
    }
  }

  return items.map((item) => {
    const videoId = item.snippet.resourceId.videoId;
    const snippet = item.snippet;
    const stats = statsById[videoId] || {};
    return {
      videoId,
      title: snippet.title,
      thumbnail: snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url,
      publishedAt: snippet.publishedAt,
      views: parseInt(stats.viewCount || 0),
      likes: parseInt(stats.likeCount || 0),
      comments: parseInt(stats.commentCount || 0),
    };
  });
}

/**
 * Main handler for Vercel serverless function
 */
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

  // Rate limiting: 30 requests per minute (protect YouTube API quota)
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(`youtube:${clientId}`, 30, 60000);
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { action, id, username, query, maxResults, channelId } = req.query;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let result;

    switch (action) {
      case 'search':
        if (!query) {
          return res.status(400).json({ error: 'Missing query parameter' });
        }
        result = await searchChannels(query, maxResults ? parseInt(maxResults, 10) : 25);
        break;

      case 'getChannel':
        if (!id) {
          return res.status(400).json({ error: 'Missing id parameter' });
        }
        result = await getChannel(id);
        break;

      case 'getChannelByUsername':
        if (!username) {
          return res.status(400).json({ error: 'Missing username parameter' });
        }
        result = await getChannelByUsername(username);
        break;

      case 'getRecentVideos':
        if (!channelId) {
          return res.status(400).json({ error: 'Missing channelId parameter' });
        }
        result = await getRecentVideos(channelId);
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(200).json(result);
  } catch (error) {
    // Log full detail server-side (rawDetails carries Google's actual error
    // body when present); the client only ever sees the sanitized message.
    console.error('YouTube API error:', error.rawDetails || error);

    // Return 404 for "not found" errors instead of 500
    if (error.message && error.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.quotaExceeded) {
      return res.status(503).json({ error: error.message, quotaExceeded: true });
    }

    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
