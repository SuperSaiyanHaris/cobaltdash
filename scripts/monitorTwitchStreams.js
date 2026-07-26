/**
 * Twitch Stream Monitor
 *
 * Polls every tracked Twitch channel for live status, records a viewer sample
 * for each live one, and closes sessions whose stream has ended. Watch-time
 * accuracy depends entirely on how often this runs: hours_watched is derived
 * from the viewer samples, so a stream sampled 4 times produces a far rougher
 * number than one sampled every 5 minutes.
 *
 * PERFORMANCE (rewritten 2026-07-26). The previous version took ~9 minutes,
 * which was longer than its own 5-minute schedule, so GitHub skipped
 * overlapping runs and the monitor effectively ran ~13x/day instead of 288x.
 * That starved the sampling: 91,160 sessions over 30 days averaged 3.6 samples
 * each and 23% had exactly one. Measured costs of the old version:
 *
 *   fetch creators                       4.0s   (25 paginated queries)
 *   fetch open sessions                  7.8s   (123 sequential chunked .in())
 *   live-stream sweep                     47s   (245 batches, serial + 100ms sleep)
 *   finalise ~2,600 stale sessions      ~470s   (3 round trips each, serial)
 *
 * All four are fixed below. The sweep is now 12-way concurrent with no sleep
 * (measured 47s -> 1.7s), open sessions come back in one paginated query,
 * samples insert in bulk, and finalisation is a single set-based RPC
 * (finalize_stream_sessions).
 *
 * Twitch allows 800 points/min on an app token and one /streams call is 1
 * point, so 245 calls per run leaves plenty of headroom for CONCURRENCY.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.VITE_TWITCH_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET;

const BATCH_SIZE = 100;   // Twitch allows up to 100 user IDs per /streams request
const CONCURRENCY = 12;   // parallel /streams requests, well inside the rate limit
const PAGE = 1000;        // PostgREST caps any single response at 1000 rows

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

let twitchAccessToken = null;

async function getTwitchAccessToken() {
  if (twitchAccessToken) return twitchAccessToken;
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!response.ok) throw new Error(`Twitch token request failed: ${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Twitch token response had no access_token');
  twitchAccessToken = data.access_token;
  return twitchAccessToken;
}

async function fetchLiveStreams(userIds, token) {
  const params = userIds.map((id) => `user_id=${id}`).join('&');
  const response = await fetch(`https://api.twitch.tv/helix/streams?${params}&first=100`, {
    headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  // A failed batch must NOT be read as "nobody in this batch is live" — that
  // would close every one of their sessions. Signal the failure instead.
  if (!response.ok) throw new Error(`helix/streams ${response.status}`);
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
  console.log('🎮 Twitch stream monitor');
  console.log(`   Time: ${new Date().toISOString()}\n`);

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error('❌ Twitch credentials not configured');
    process.exit(1);
  }

  const token = await getTwitchAccessToken();

  // --- Load state -----------------------------------------------------------
  const creators = await fetchAll('creators', 'id, platform_id, username, display_name', (q) =>
    q.eq('platform', 'twitch')
  );
  const creatorById = new Map(creators.map((c) => [c.id, c]));
  console.log(`📊 ${creators.length} Twitch creators`);

  // One paginated sweep of ALL open sessions, then filter to this platform in
  // memory. The old code sent the creator ids back as 123 chunked .in() filters
  // to dodge the ~8KB URL limit, which cost 7.8s and a lot of round trips.
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
  console.log(`   Open (unfinalised) Twitch sessions: ${openSessions.length}`);

  // --- Live sweep -----------------------------------------------------------
  const batches = chunk(creators, BATCH_SIZE);
  const liveByPlatformId = new Map();
  let failedBatches = 0;

  const sweptAt = Date.now();
  await pooled(batches, CONCURRENCY, async (batch) => {
    try {
      const streams = await fetchLiveStreams(batch.map((c) => c.platform_id), token);
      for (const s of streams) liveByPlatformId.set(s.user_id, s);
    } catch (err) {
      failedBatches++;
      console.warn(`   ⚠️  batch failed (${err.message})`);
    }
  });
  console.log(
    `🔴 ${liveByPlatformId.size} live in ${((Date.now() - sweptAt) / 1000).toFixed(1)}s` +
      ` across ${batches.length} batches${failedBatches ? `, ${failedBatches} failed` : ''}`
  );

  // If any of the sweep failed we cannot tell "offline" from "unknown", so skip
  // finalisation this run rather than close sessions that are still live.
  const sweepTrustworthy = failedBatches === 0;
  if (!sweepTrustworthy) {
    console.warn('   ⚠️  Sweep incomplete, skipping session finalisation this run.');
  }

  // --- Plan the writes ------------------------------------------------------
  const newSessions = [];      // sessions to open
  const samplesForOpen = [];   // viewer samples for already-known sessions
  const peakBumps = [];        // {id, peak_viewers}
  const toFinalize = [];       // session ids whose stream has ended
  const pendingSamples = [];   // live creators needing a session id after insert

  for (const creator of creators) {
    const live = liveByPlatformId.get(creator.platform_id);
    const active = openByCreator.get(creator.id) || [];

    if (live) {
      const match = active.find((s) => s.stream_id === live.id);

      // Any other open session for this creator belongs to an earlier stream.
      for (const s of active) if (s.stream_id !== live.id) toFinalize.push(s.id);

      if (match) {
        samplesForOpen.push({
          session_id: match.id,
          viewer_count: live.viewer_count,
          game_name: live.game_name,
        });
        if (live.viewer_count > (match.peak_viewers || 0)) {
          peakBumps.push({ id: match.id, peak_viewers: live.viewer_count });
        }
      } else {
        newSessions.push({
          creator_id: creator.id,
          stream_id: live.id,
          started_at: live.started_at,
          game_name: live.game_name,
          title: live.title,
          peak_viewers: live.viewer_count,
        });
        pendingSamples.push({
          creator_id: creator.id,
          stream_id: live.id,
          viewer_count: live.viewer_count,
          game_name: live.game_name,
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
      // upsert, not insert. stream_sessions has a UNIQUE (creator_id, stream_id),
      // and a session can already exist in a CLOSED state while the channel is
      // still live on that same stream_id: any missed poll makes us finalise a
      // broadcast that had not actually ended. Twitch keeps stream_id stable for
      // a continuous broadcast, so the right move is to reopen that row rather
      // than create a second one for the same stream (which is what produced
      // "duplicate key value violates unique constraint" and, with a batched
      // insert, cost the whole 500-row group).
      //
      // Reopening cannot double count: finalize_stream_sessions recomputes
      // avg/peak/hours from scratch over ALL samples belonging to the session,
      // so peak_viewers being clobbered here is only ever a running hint.
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
      // Attach the first viewer sample of each brand-new session.
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

  // Peak bumps are genuinely per-row, but there are only ever a handful: a
  // stream sets its peak early and rarely beats it, so a small pool is enough.
  let peaksUpdated = 0;
  await pooled(peakBumps, 8, async (b) => {
    const { error } = await supabase
      .from('stream_sessions')
      .update({ peak_viewers: b.peak_viewers })
      .eq('id', b.id);
    if (!error) peaksUpdated++;
  });

  // The whole reason the old version took ~8 minutes. One call per 5000 now.
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
