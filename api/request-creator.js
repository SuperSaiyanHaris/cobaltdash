/**
 * API endpoint to request a creator to be added to our database
 * Creates a pending request that will be processed by background jobs
 */

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 5 requests per minute per IP
  const clientIP = getClientIdentifier(req);
  const rateCheck = checkRateLimit(`creator-req:${clientIP}`, 5, 60000);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { platform, username, instant } = req.body;
    // userId intentionally not accepted from client — prevents spoofing

    // Validate required fields
    if (!platform || !username) {
      return res.status(400).json({ error: 'Platform and username are required' });
    }

    // Validate platform
    const validPlatforms = instant ? ['tiktok'] : ['tiktok', 'youtube', 'twitch', 'kick', 'rumble'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: instant ? 'Instant lookup is only supported for TikTok' : 'Invalid platform' });
    }

    let normalized;
    if (platform === 'rumble') {
      // Rumble slugs are CASE-SENSITIVE and may contain hyphens, so we can't
      // lowercase/strip like the handle platforms. Accept a full channel URL,
      // a `c:`/`user:` prefix, or a bare slug, and keep the slug verbatim.
      let raw = String(username).trim();
      const urlMatch = raw.match(/rumble\.com\/(?:c|user)\/([^/?#\s]+)/i);
      const prefixMatch = raw.match(/^(?:c|user):(.+)$/i);
      if (urlMatch) raw = urlMatch[1];
      else if (prefixMatch) raw = prefixMatch[1];
      normalized = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50);
      if (!normalized || normalized.length < 2) {
        return res.status(400).json({ error: 'Enter your Rumble channel URL or handle (e.g. rumble.com/user/YourName).' });
      }
    } else {
      // Normalize username: strip @, remove spaces/special chars, lowercase
      normalized = username
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9._]/g, '')
        .replace(/^\.+|\.+$/g, '')
        .toLowerCase()
        .slice(0, 30);

      // Validate normalized username format
      const usernameRegex = /^[a-zA-Z0-9._]{1,30}$/;
      if (!normalized || !usernameRegex.test(normalized)) {
        return res.status(400).json({
          error: 'Invalid username format. Only letters, numbers, dots, and underscores allowed.'
        });
      }
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check if creator already exists
    const { data: existingCreator } = await supabase
      .from('creators')
      .select('id, username')
      .eq('platform', platform)
      .ilike('username', normalized)
      .single();

    if (existingCreator) {
      if (instant) {
        // Return full creator object so the caller can immediately select them
        const { data: fullCreator } = await supabase
          .from('creators')
          .select('id, username, display_name, profile_image, platform')
          .eq('id', existingCreator.id)
          .single();
        return res.status(200).json({ success: true, creator: fullCreator });
      }
      return res.status(200).json({
        exists: true,
        message: 'This creator is already in our database!',
        username: existingCreator.username
      });
    }

    // Instant TikTok lookup — scrape the profile now and insert immediately
    if (instant && platform === 'tiktok') {
      const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      let ttResponse;
      try {
        ttResponse = await fetch(`https://www.tiktok.com/@${normalized}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!ttResponse.ok) {
        return res.status(404).json({ error: `TikTok profile not found. Check the username and try again.` });
      }

      const html = await ttResponse.text();
      const scriptMatch = html.match(/<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (!scriptMatch) {
        return res.status(404).json({ error: 'Could not load TikTok profile. Try again in a moment.' });
      }

      let ttData;
      try { ttData = JSON.parse(scriptMatch[1]); } catch {
        return res.status(500).json({ error: 'Could not parse TikTok profile data.' });
      }

      const userInfo = ttData?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.['userInfo'];
      if (!userInfo?.user || !userInfo?.stats) {
        return res.status(404).json({ error: 'TikTok user not found. Double-check the username.' });
      }

      const u = userInfo.user;
      const s = userInfo.stats;
      const displayName = u.nickname || normalized;

      const { data: newCreator, error: upsertError } = await supabase
        .from('creators')
        .upsert({
          platform: 'tiktok',
          platform_id: u.id || normalized,
          username: u.uniqueId || normalized,
          display_name: displayName,
          profile_image: u.avatarLarger || u.avatarMedium || null,
          description: u.signature || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'platform,platform_id' })
        .select('id, username, display_name, profile_image, platform')
        .single();

      if (upsertError) {
        console.error('Failed to upsert TikTok creator:', upsertError);
        return res.status(500).json({ error: 'Failed to save creator. Try again.' });
      }

      // Insert initial stats row — only if we have real data (not zeros from a failed scrape)
      const followerCount = s.followerCount || 0;
      if (followerCount > 0) {
        const today = new Date().toLocaleDateString('sv', { timeZone: 'America/New_York' });
        await supabase
          .from('creator_stats')
          .upsert({
            creator_id: newCreator.id,
            recorded_at: today,
            followers: followerCount,
            total_views: s.heart || s.heartCount || 0,  // TikTok repurposes total_views for likes
            total_posts: s.videoCount || 0,
          }, { onConflict: 'creator_id,recorded_at' });
        // Stats failure is non-fatal — creator record is already saved
      }

      return res.status(200).json({ success: true, creator: newCreator });
    }

    // Check if there's already a pending request for this creator
    const { data: existingRequest } = await supabase
      .from('creator_requests')
      .select('id, username, status, created_at')
      .eq('platform', platform)
      .ilike('username', normalized)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      const hoursAgo = Math.floor(
        (Date.now() - new Date(existingRequest.created_at).getTime()) / (1000 * 60 * 60)
      );
      return res.status(200).json({
        exists: true,
        message: `This creator was already requested ${hoursAgo} hours ago and is being processed.`,
        username: existingRequest.username
      });
    }

    // Cap total pending requests to prevent table flooding
    const { count: pendingCount } = await supabase
      .from('creator_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingCount >= 100) {
      return res.status(429).json({
        error: 'We have a lot of requests in the queue right now. Please try again later.'
      });
    }

    // Create new request
    const { data: newRequest, error: insertError } = await supabase
      .from('creator_requests')
      .insert({
        platform,
        username: normalized,
        user_id: null,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create creator request:', insertError);
      return res.status(500).json({ error: 'Failed to create request' });
    }

    return res.status(200).json({
      success: true,
      message: `Request submitted! We'll add @${normalized} within 24 hours.`,
      username: newRequest.username
    });

  } catch (error) {
    console.error('Request creator API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
