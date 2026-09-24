// Server-side API endpoint to handle creator upserts during live-search hydration.
// Uses the service role key (bypasses RLS), so the request is treated as a
// hint only: it names WHICH creator was viewed ({platform, platformId,
// username}), and every field written comes from the platform itself via
// fetchVerifiedProfile (api/_verifiedProfile.js). A forged request can at most
// make us refresh a real creator with that creator's real data.
//   - profile_image is additionally restricted to known platform avatar CDNs
//   - stats are NOT writable here (only server collection writes creator_stats)
//   - an existing row is refreshed at most once per REFRESH_INTERVAL_MS, which
//     also caps the upstream API cost of repeat profile views

import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';
import { fetchVerifiedProfile, VERIFIABLE_PLATFORMS } from './_verifiedProfile.js';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
    const { creatorData } = req.body || {};
    const platform = creatorData?.platform;
    const platformId = creatorData?.platformId != null ? String(creatorData.platformId) : '';
    if (!platform || !platformId || platformId.length > 200) {
      return res.status(400).json({ error: 'Invalid creator data' });
    }
    if (!VERIFIABLE_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    const ids = {
      platformId,
      username: typeof creatorData.username === 'string' ? creatorData.username.slice(0, 200) : null,
      displayName: typeof creatorData.displayName === 'string' ? creatorData.displayName.slice(0, 200) : null,
    };

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // Server-side only
    );

    const { data: existing } = await supabase
      .from('creators')
      .select('*')
      .eq('platform', platform)
      .eq('platform_id', platformId)
      .maybeSingle();

    // Fresh enough: no upstream call, no write.
    if (existing && Date.now() - new Date(existing.updated_at || 0).getTime() < REFRESH_INTERVAL_MS) {
      return res.status(200).json({ success: true, creator: existing });
    }

    let profile;
    try {
      profile = await fetchVerifiedProfile(platform, ids);
    } catch (err) {
      console.warn(`update-creator: ${platform} lookup failed:`, err.message);
      if (existing) return res.status(200).json({ success: true, creator: existing });
      return res.status(502).json({ error: 'Platform lookup failed' });
    }

    if (!profile) {
      // The platform doesn't know this id. Never create a row for it, and never
      // blank an existing row over a single miss.
      if (existing) return res.status(200).json({ success: true, creator: existing });
      return res.status(404).json({ error: 'Creator not found on platform' });
    }

    if (existing) {
      // Only overwrite with real values: categories/countries set by our own
      // classifiers must survive a platform that doesn't report one. username
      // stays put, it's the profile URL (renames are handled by collection).
      const updateFields = { updated_at: new Date().toISOString() };
      if (profile.displayName) updateFields.display_name = profile.displayName;
      if (profile.description != null) updateFields.description = profile.description;
      if (profile.country) updateFields.country = profile.country;
      if (profile.category) updateFields.category = profile.category;
      const img = sanitizeImageUrl(profile.profileImage);
      if (img) updateFields.profile_image = img;

      const { data: updated, error: updateError } = await supabase
        .from('creators')
        .update(updateFields)
        .eq('id', existing.id)
        .select()
        .single();
      if (updateError) {
        console.error('Creator update error:', updateError);
        return res.status(200).json({ success: true, creator: existing });
      }
      return res.status(200).json({ success: true, creator: updated });
    }

    const { data: created, error: insertError } = await supabase
      .from('creators')
      .insert({
        platform,
        platform_id: profile.platformId,
        username: profile.username,
        display_name: profile.displayName,
        profile_image: sanitizeImageUrl(profile.profileImage),
        description: profile.description,
        country: profile.country,
        category: profile.category,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Creator insert error:', insertError);
      return res.status(500).json({ error: 'Failed to save creator' });
    }

    // NOTE: creator_stats are intentionally NOT writable from this endpoint.
    // Stats are written exclusively by the server-side daily collection, which
    // pulls real numbers from the platforms. A creator added here gets its
    // first data point on the next collection run.
    return res.status(200).json({ success: true, creator: created });

  } catch (error) {
    console.error('Update creator API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
