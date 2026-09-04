// Server-side API endpoint to handle creator upserts during live-search hydration.
// Uses the service role key (bypasses RLS), so input is treated as untrusted:
//   - profile_image is accepted only when it points at a known platform avatar CDN
//   - stats are NOT writable here (only server collection writes creator_stats),
//     which removes the chart-corruption vector from this public endpoint.

import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

// Known platform avatar CDNs. An image URL from anywhere else is dropped (stored
// as null) rather than trusted, so this endpoint can't be used to point creator
// avatars at attacker-controlled or tracking URLs.
const ALLOWED_IMAGE_HOSTS = new Set([
  'yt3.googleusercontent.com', 'yt3.ggpht.com', 'i.ytimg.com', 'lh3.googleusercontent.com',
  'static-cdn.jtvnw.net',            // Twitch
  'files.kick.com',                  // Kick
  'cdn.bsky.app',                    // Bluesky
  'i.scdn.co',                       // Spotify
  'lastfm.freetls.fastly.net',       // Last.fm
  'hugh.cdn.rumble.cloud',           // Rumble
  'substackcdn.com',                 // Substack
]);
const ALLOWED_IMAGE_SUFFIXES = ['.tiktokcdn.com', '.tiktokcdn-us.com', '.googleusercontent.com', '.ggpht.com', '.cdn.rumble.cloud'];

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (ALLOWED_IMAGE_HOSTS.has(host)) return url;
  if (ALLOWED_IMAGE_SUFFIXES.some((s) => host.endsWith(s))) return url;
  return null;
}

export default async function handler(req, res) {
  // Enable CORS
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Server-side origin validation — reject requests not from our frontend
  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limiting: 300 requests per minute
  // A single YouTube search legitimately generates ~50 calls (25 results × upsert + stats),
  // so 60/min was too tight for normal usage. Primary abuse protection is the origin check above.
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(`update-creator:${clientId}`, 300, 60000);

  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { creatorData } = req.body;

    // Import Supabase client with service role key
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // Server-side only
    );

    let creator = null;

    // If creatorData provided, upsert the creator
    if (creatorData) {
      // Validate required fields for creator upsert
      if (!creatorData.platform || !creatorData.platformId) {
        return res.status(400).json({ error: 'Invalid creator data' });
      }

      // Validate platform is a known value
      const validPlatforms = ['youtube', 'twitch', 'kick', 'tiktok', 'bluesky', 'music', 'mastodon', 'substack'];
      if (!validPlatforms.includes(creatorData.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }

      // Validate field lengths
      if (creatorData.displayName && creatorData.displayName.length > 200) {
        return res.status(400).json({ error: 'Display name too long' });
      }
      if (creatorData.username && creatorData.username.length > 200) {
        return res.status(400).json({ error: 'Username too long' });
      }

      // Check if creator already exists
      const { data: existingCreator } = await supabase
        .from('creators')
        .select('id')
        .eq('platform', creatorData.platform)
        .eq('platform_id', creatorData.platformId)
        .single();

      if (existingCreator) {
        // SECURITY: For existing creators, only update safe fields.
        // display_name and username are NOT updatable from the frontend —
        // only server-side collection scripts may change those.
        const sanitizedImage = sanitizeImageUrl(creatorData.profileImage);
        const updateFields = {
          description: creatorData.description,
          country: creatorData.country,
          category: creatorData.category,
          updated_at: new Date().toISOString(),
        };
        // Only include profile_image when we have a valid sanitized URL.
        // If the CDN isn't on the allowlist we skip the field entirely —
        // never overwrite a good DB avatar with null.
        if (sanitizedImage !== null) {
          updateFields.profile_image = sanitizedImage;
        }

        const { data: updatedCreator, error: updateError } = await supabase
          .from('creators')
          .update(updateFields)
          .eq('id', existingCreator.id)
          .select()
          .single();

        if (updateError) {
          console.error('Creator update error:', updateError);
          return res.status(500).json({ error: 'Failed to update creator' });
        }
        creator = updatedCreator;
      } else {
        // New creator — allow full insert
        const { data: newCreator, error: insertError } = await supabase
          .from('creators')
          .insert({
            platform: creatorData.platform,
            platform_id: creatorData.platformId,
            username: creatorData.username,
            display_name: creatorData.displayName,
            profile_image: sanitizeImageUrl(creatorData.profileImage),
            description: creatorData.description,
            country: creatorData.country,
            category: creatorData.category,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error('Creator insert error:', insertError);
          return res.status(500).json({ error: 'Failed to save creator' });
        }
        creator = newCreator;
      }
    }

    // NOTE: creator_stats are intentionally NOT writable from this endpoint.
    // This is a public route gated only by an Origin header (forgeable by non-
    // browser clients), so allowing arbitrary stats writes would let anyone
    // inject fake subscriber numbers and corrupt the historical charts. Stats
    // are written exclusively by the server-side daily collection, which pulls
    // real numbers from the platforms. A creator added here gets its first data
    // point on the next collection run.

    return res.status(200).json({
      success: true,
      creator: creator
    });

  } catch (error) {
    console.error('Update creator API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
