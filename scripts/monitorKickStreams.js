/**
 * Kick Stream Monitor
 *
 * This script monitors live Kick streams and records viewer samples
 * to calculate accurate "hours watched" metrics.
 *
 * Should run every 5 minutes via GitHub Actions or cron job.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

const BATCH_SIZE = 50; // Kick allows up to 50 slugs per request

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

let kickAccessToken = null;

async function getKickAccessToken() {
  if (kickAccessToken) return kickAccessToken;

  const response = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();
  kickAccessToken = data.access_token;
  return kickAccessToken;
}

/**
 * Fetch channel info (including live status) for multiple slugs
 */
async function fetchKickChannels(slugs) {
  const token = await getKickAccessToken();
  const slugParams = slugs.map(s => `slug=${encodeURIComponent(s)}`).join('&');

  const response = await fetch(`https://api.kick.com/public/v1/channels?${slugParams}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await response.json();
  return data.data || [];
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function finalizeStreamSession(sessionId) {
  const { data: samples } = await supabase
    .from('viewer_samples')
    .select('viewer_count, recorded_at')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true });

  const { data: session } = await supabase
    .from('stream_sessions')
    .select('started_at')
    .eq('id', sessionId)
    .single();

  if (!samples || samples.length === 0) {
    const endedAt = session?.started_at || new Date().toISOString();
    await supabase
      .from('stream_sessions')
      .update({
        ended_at: endedAt,
        avg_viewers: 0,
        peak_viewers: 0,
        hours_watched: 0,
      })
      .eq('id', sessionId);
    return null;
  }

  const totalViewers = samples.reduce((sum, s) => sum + s.viewer_count, 0);
  const avgViewers = Math.round(totalViewers / samples.length);
  const peakViewers = Math.max(...samples.map(s => s.viewer_count));

  const startTime = new Date(session?.started_at || samples[0].recorded_at);
  const endTime = new Date(samples[samples.length - 1].recorded_at);
  const durationHours = Math.max((endTime - startTime) / (1000 * 60 * 60), 0);

  const hoursWatched = avgViewers * durationHours;

  await supabase
    .from('stream_sessions')
    .update({
      ended_at: endTime.toISOString(),
      avg_viewers: avgViewers,
      peak_viewers: peakViewers,
      hours_watched: hoursWatched,
    })
    .eq('id', sessionId);

  return { avgViewers, peakViewers, hoursWatched, durationHours };
}

async function monitorStreams() {
  console.log('🟢 Starting Kick stream monitoring...');
  console.log(`   Time: ${new Date().toISOString()}\n`);

  if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
    console.error('❌ Kick credentials not configured');
    return;
  }

  // Get all Kick creators from database. Same paginated pattern as
  // collectDailyStats.js / monitorTwitchStreams.js — Supabase's default
  // PostgREST response cap is 1000 rows, and Kick has 3K+ creators, so an
  // un-paginated .select() silently dropped ~70% of the roster from polling.
  let creators = [];
  {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error: fetchError } = await supabase
        .from('creators')
        .select('id, platform_id, username, display_name')
        .eq('platform', 'kick')
        .order('id')
        .range(from, from + pageSize - 1);
      if (fetchError) {
        console.error('❌ Error fetching creators:', fetchError.message);
        return;
      }
      creators = creators.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  console.log(`📊 Monitoring ${creators.length} Kick creators\n`);

  if (creators.length === 0) {
    console.log('   No Kick creators to monitor');
    return;
  }

  // Get ALL active sessions — chunk creator IDs to stay within Supabase URL length limits
  // (1,500+ creator IDs in one .in() call exceeds the ~8KB URL limit and silently returns nothing)
  const creatorIds = creators.map(c => c.id);
  const CREATOR_ID_CHUNK = 200;
  let allActiveSessions = [];
  for (let i = 0; i < creatorIds.length; i += CREATOR_ID_CHUNK) {
    const idChunk = creatorIds.slice(i, i + CREATOR_ID_CHUNK);
    const { data } = await supabase
      .from('stream_sessions')
      .select('id, creator_id, stream_id, started_at, peak_viewers')
      .is('ended_at', null)
      .in('creator_id', idChunk);
    if (data) allActiveSessions.push(...data);
  }

  const activeSessionsByCreator = new Map();
  allActiveSessions.forEach(s => {
    if (!activeSessionsByCreator.has(s.creator_id)) {
      activeSessionsByCreator.set(s.creator_id, []);
    }
    activeSessionsByCreator.get(s.creator_id).push(s);
  });

  console.log(`   Active (unfinalised) sessions in DB: ${allActiveSessions.length}`);

  // Fetch channel data in batches (includes live status)
  const creatorBatches = chunk(creators, BATCH_SIZE);
  const liveChannelMap = new Map();

  for (const batch of creatorBatches) {
    const slugs = batch.map(c => c.username);
    const channels = await fetchKickChannels(slugs);

    channels.forEach(channel => {
      if (channel.stream?.is_live) {
        liveChannelMap.set(channel.slug.toLowerCase(), {
          viewerCount: channel.stream.viewer_count || 0,
          title: channel.stream.stream_title || '',
          gameName: channel.category?.name || '',
          startedAt: channel.stream.start_time || new Date().toISOString(),
          // Use slug as stream ID since Kick doesn't expose a stream ID in channels endpoint
          streamId: `kick-${channel.broadcaster_user_id}-${channel.stream.start_time || 'live'}`,
        });
      }
    });

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`🔴 Found ${liveChannelMap.size} live streams\n`);

  let samplesRecorded = 0;
  let sessionsStarted = 0;
  let sessionsEnded = 0;

  for (const creator of creators) {
    const liveStream = liveChannelMap.get(creator.username.toLowerCase());
    const activeSessions = activeSessionsByCreator.get(creator.id) || [];

    if (liveStream) {
      const matchingSession = activeSessions.find(s => s.stream_id === liveStream.streamId);

      // Finalize ALL sessions that don't match the current stream (orphaned)
      for (const session of activeSessions) {
        if (session.stream_id !== liveStream.streamId) {
          console.log(`   🧹 ${creator.display_name}: Finalizing orphaned session ${session.stream_id}`);
          await finalizeStreamSession(session.id);
          sessionsEnded++;
        }
      }

      let sessionId = matchingSession?.id;

      // Start new session if needed
      if (!sessionId) {
        const { data: newSession } = await supabase
          .from('stream_sessions')
          .insert({
            creator_id: creator.id,
            stream_id: liveStream.streamId,
            started_at: liveStream.startedAt,
            game_name: liveStream.gameName,
            title: liveStream.title,
            peak_viewers: liveStream.viewerCount,
          })
          .select()
          .single();

        sessionId = newSession?.id;
        sessionsStarted++;
        console.log(`   🟢 ${creator.display_name}: Stream started (${liveStream.viewerCount.toLocaleString()} viewers)`);
      }

      // Record viewer sample
      if (sessionId) {
        await supabase.from('viewer_samples').insert({
          session_id: sessionId,
          viewer_count: liveStream.viewerCount,
          game_name: liveStream.gameName,
        });

        if (matchingSession && liveStream.viewerCount > (matchingSession.peak_viewers || 0)) {
          await supabase
            .from('stream_sessions')
            .update({ peak_viewers: liveStream.viewerCount })
            .eq('id', sessionId);
        }

        samplesRecorded++;
        console.log(`   📊 ${creator.display_name}: ${liveStream.viewerCount.toLocaleString()} viewers`);
      }
    } else if (activeSessions.length > 0) {
      // Creator is not live — finalize all active sessions
      for (const session of activeSessions) {
        console.log(`   ⏹️  ${creator.display_name}: Stream ended`);
        const stats = await finalizeStreamSession(session.id);
        if (stats) {
          console.log(`      └─ ${stats.durationHours.toFixed(1)}h, ${stats.avgViewers.toLocaleString()} avg, ${stats.hoursWatched.toFixed(0)} hours watched`);
        }
        sessionsEnded++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Monitoring complete!');
  console.log(`   🟢 Sessions started: ${sessionsStarted}`);
  console.log(`   ⏹️  Sessions ended: ${sessionsEnded}`);
  console.log(`   📊 Samples recorded: ${samplesRecorded}`);
}

monitorStreams().catch(console.error);
