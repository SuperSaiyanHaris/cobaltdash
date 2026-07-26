/**
 * Kick Stream Monitor
 *
 * Same job and same accuracy contract as monitorTwitchStreams.js: poll every
 * tracked Kick channel, sample viewers on the live ones, close sessions whose
 * stream has ended. hours_watched is derived from those samples, so sampling
 * frequency IS the accuracy.
 *
 * Rewritten 2026-07-26 alongside the Twitch monitor for the same reasons: the
 * old version fetched open sessions as ~16 chunked .in() calls, swept batches
 * serially with a 200ms sleep between each, and finalised sessions one at a
 * time at 3 round trips apiece. Now: one paginated session query, a concurrent
 * sweep, bulk sample inserts, and a single set-based finalize_stream_sessions
 * RPC. See that file's header for the measured before/after.
 *
 * Kick publishes no rate-limit numbers, so CONCURRENCY is deliberately lower
 * than Twitch's 12. Raise it only with evidence.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

const BATCH_SIZE = 50;   // Kick allows up to 50 slugs per request
const CONCURRENCY = 6;   // conservative: Kick publishes no documented limit
const PAGE = 1000;       // PostgREST caps any single response at 1000 rows

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
  if (!response.ok) throw new Error(`Kick token request failed: ${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Kick token response had no access_token');
  kickAccessToken = data.access_token;
  return kickAccessToken;
}

async function fetchKickChannels(slugs, token) {
  const slugParams = slugs.map((s) => `slug=${encodeURIComponent(s)}`).join('&');
  const response = await fetch(`https://api.kick.com/public/v1/channels?${slugParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Must throw rather than return []: Kick rejects a WHOLE batch if any single
  // slug in it is malformed, and treating that as "none of these are live"
  // would close every session in the batch.
  if (!response.ok) throw new Error(`kick/channels ${response.status}`);
  const data = await response.json();
  return data.data || [];
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

/** Runs `worker` over `items` with a fixed pool of parallel runners. */
async function pooled(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/** Fetches every row via .range() pagination, ordered by id for a stable sweep. */
async function fetchAll(table, select, applyFilters) {
  let all = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q.order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function monitorStreams() {
  const t0 = Date.now();
  console.log('🎮 Kick stream monitor');
  console.log(`   Time: ${new Date().toISOString()}\n`);

  if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
    console.error('❌ Kick credentials not configured');
    process.exit(1);
  }

  const token = await getKickAccessToken();

  // --- Load state -----------------------------------------------------------
  const creators = await fetchAll('creators', 'id, platform_id, username, display_name', (q) =>
    q.eq('platform', 'kick')
  );
  const creatorById = new Map(creators.map((c) => [c.id, c]));
  console.log(`📊 ${creators.length} Kick creators`);

  const openAll = await fetchAll(
    'stream_sessions',
    'id, creator_id, stream_id, started_at, peak_viewers',
    (q) => q.is('ended_at', null)
  );
  const openSessions = openAll.filter((s) => creatorById.has(s.creator_id));

  const openByCreator = new Map();
  for (const s of openSessions) {
    if (!openByCreator.has(s.creator_id)) openByCreator.set(s.creator_id, []);
    openByCreator.get(s.creator_id).push(s);
  }
  console.log(`   Open (unfinalised) Kick sessions: ${openSessions.length}`);

  // --- Live sweep -----------------------------------------------------------
  const batches = chunk(creators, BATCH_SIZE);
  const liveBySlug = new Map();
  let failedBatches = 0;

  const sweptAt = Date.now();
  await pooled(batches, CONCURRENCY, async (batch) => {
    try {
      const channels = await fetchKickChannels(batch.map((c) => c.username), token);
      for (const channel of channels) {
        if (!channel.stream?.is_live) continue;
        liveBySlug.set(channel.slug.toLowerCase(), {
          viewerCount: channel.stream.viewer_count || 0,
          title: channel.stream.stream_title || '',
          gameName: channel.category?.name || '',
          startedAt: channel.stream.start_time || new Date().toISOString(),
          // Kick's channels endpoint exposes no stream id, so synthesise a
          // stable one from broadcaster + start time.
          streamId: `kick-${channel.broadcaster_user_id}-${channel.stream.start_time || 'live'}`,
        });
      }
    } catch (err) {
      failedBatches++;
      console.warn(`   ⚠️  batch failed (${err.message})`);
    }
  });
  console.log(
    `🔴 ${liveBySlug.size} live in ${((Date.now() - sweptAt) / 1000).toFixed(1)}s` +
      ` across ${batches.length} batches${failedBatches ? `, ${failedBatches} failed` : ''}`
  );

  const sweepTrustworthy = failedBatches === 0;
  if (!sweepTrustworthy) {
    console.warn('   ⚠️  Sweep incomplete, skipping session finalisation this run.');
  }

  // --- Plan the writes ------------------------------------------------------
  const newSessions = [];
  const samplesForOpen = [];
  const peakBumps = [];
  const toFinalize = [];
  const pendingSamples = [];

  for (const creator of creators) {
    const live = liveBySlug.get(creator.username.toLowerCase());
    const active = openByCreator.get(creator.id) || [];

    if (live) {
      const match = active.find((s) => s.stream_id === live.streamId);
      for (const s of active) if (s.stream_id !== live.streamId) toFinalize.push(s.id);

      if (match) {
        samplesForOpen.push({
          session_id: match.id,
          viewer_count: live.viewerCount,
          game_name: live.gameName,
        });
        if (live.viewerCount > (match.peak_viewers || 0)) {
          peakBumps.push({ id: match.id, peak_viewers: live.viewerCount });
        }
      } else {
        newSessions.push({
          creator_id: creator.id,
          stream_id: live.streamId,
          started_at: live.startedAt,
          game_name: live.gameName,
          title: live.title,
          peak_viewers: live.viewerCount,
        });
        pendingSamples.push({
          creator_id: creator.id,
          stream_id: live.streamId,
          viewer_count: live.viewerCount,
          game_name: live.gameName,
        });
      }
    } else if (active.length > 0 && sweepTrustworthy) {
      for (const s of active) toFinalize.push(s.id);
    }
  }

  // --- Apply the writes in bulk --------------------------------------------
  let sessionsStarted = 0;
  if (newSessions.length) {
    for (const group of chunk(newSessions, 500)) {
      // upsert, not insert: see the equivalent comment in monitorTwitchStreams.js.
      // UNIQUE (creator_id, stream_id) plus a prematurely closed session for a
      // still-live stream would otherwise fail the whole batch.
      const { data, error } = await supabase
        .from('stream_sessions')
        .upsert(group.map((s) => ({ ...s, ended_at: null })), {
          onConflict: 'creator_id,stream_id',
        })
        .select('id, creator_id, stream_id');
      if (error) {
        console.error(`   ❌ session upsert failed: ${error.message}`);
        continue;
      }
      sessionsStarted += data.length;
      const idx = new Map(data.map((r) => [`${r.creator_id}|${r.stream_id}`, r.id]));
      for (const p of pendingSamples) {
        const id = idx.get(`${p.creator_id}|${p.stream_id}`);
        if (id) {
          samplesForOpen.push({
            session_id: id,
            viewer_count: p.viewer_count,
            game_name: p.game_name,
          });
        }
      }
    }
  }

  let samplesRecorded = 0;
  for (const group of chunk(samplesForOpen, 1000)) {
    const { error } = await supabase.from('viewer_samples').insert(group);
    if (error) console.error(`   ❌ sample insert failed: ${error.message}`);
    else samplesRecorded += group.length;
  }

  let peaksUpdated = 0;
  await pooled(peakBumps, 8, async (b) => {
    const { error } = await supabase
      .from('stream_sessions')
      .update({ peak_viewers: b.peak_viewers })
      .eq('id', b.id);
    if (!error) peaksUpdated++;
  });

  let sessionsEnded = 0;
  if (toFinalize.length) {
    for (const group of chunk(toFinalize, 5000)) {
      const { data, error } = await supabase.rpc('finalize_stream_sessions', {
        p_session_ids: group,
      });
      if (error) console.error(`   ❌ finalize_stream_sessions failed: ${error.message}`);
      else sessionsEnded += data || 0;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Monitoring complete');
  console.log(`   🟢 Sessions started:  ${sessionsStarted}`);
  console.log(`   ⏹️  Sessions ended:    ${sessionsEnded}`);
  console.log(`   📊 Samples recorded:  ${samplesRecorded}`);
  console.log(`   ⬆️  Peaks updated:     ${peaksUpdated}`);
  console.log(`   ⏱️  Total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

monitorStreams().catch((err) => {
  console.error('❌ Monitor failed:', err.message);
  process.exit(1);
});
