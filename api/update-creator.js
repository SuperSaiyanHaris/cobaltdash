// Server-side API endpoint to handle creator and stats updates
// Uses service role key (bypasses RLS) with proper validation

import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

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
    const { creatorData, creatorId, statsData } = req.body;

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
      const validPlatforms = ['youtube', 'twitch', 'kick', 'tiktok', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'];
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
        // SECURITY: For existing creators, only update safe fields
        // display_name and username are NOT updatable from the frontend
        // They should only be changed by server-side collection scripts
        const { data: updatedCreator, error: updateError } = await supabase
          .from('creators')
          .update({
            profile_image: creatorData.profileImage,
            description: creatorData.description,
            country: creatorData.country,
            category: creatorData.category,
            updated_at: new Date().toISOString(),
          })
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
            profile_image: creatorData.profileImage,
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

    // If stats data provided, save it
    // Use creatorId from request if provided, otherwise use creator.id from upsert above
    // GUARD: never write 0 or null subscribers — that means the API call failed and we
    // must not overwrite a good historical row with bad data.
    if (statsData && (creatorId || creator) && statsData.subscribers) {
      const targetCreatorId = creatorId || creator.id;

      // Get today's date in America/New_York timezone
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      const { error: statsError } = await supabase
        .from('creator_stats')
        .upsert({
          creator_id: targetCreatorId,
          recorded_at: today,
          subscribers: statsData.subscribers,
          total_views: statsData.totalViews,
          total_posts: statsData.totalPosts,
          followers: statsData.subscribers,
        }, {
          onConflict: 'creator_id,recorded_at',
        });

      if (statsError) {
        console.error('Stats upsert error:', statsError);
        return res.status(500).json({ error: 'Failed to save stats' });
      }
    }

    return res.status(200).json({
      success: true,
      creator: creator
    });

  } catch (error) {
    console.error('Update creator API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
