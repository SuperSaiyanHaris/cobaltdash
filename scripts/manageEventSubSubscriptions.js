/**
 * EventSub Subscription Manager
 *
 * Creates real Twitch stream.online/offline and Kick livestream.status.updated
 * webhook subscriptions for a scoped top-N set of creators per platform, so
 * poll-live-creators (supabase/functions/poll-live-creators) only ever has to
 * check creators actually live right now instead of sweeping the full roster.
 * See CLAUDE.md-pending notes / supabase/functions/twitch-eventsub for the
 * overall design.
 *
 * Scope: rankings_cache's top 500 per platform (rank_type='subscribers') --
 * the same precomputed leaderboard the site already shows, not a separate
 * synthetic cutoff. Twitch's budget is 10,000 cost total (1 per subscription,
 * 2 subscriptions/creator here) and Kick's is 10,000 per event type, so 500
 * creators x 2 types leaves huge headroom to raise this later.
 *
 * Idempotent: skips any (platform, creator_id, event_type) that already has a
 * row in eventsub_subscriptions. Safe to re-run as the top-500 list shifts.
 *
 * Usage: node scripts/manageEventSubSubscriptions.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.VITE_TWITCH_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET;
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

// Same Supabase project as everywhere else in the codebase (CLAUDE.md).
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const TWITCH_CALLBACK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/twitch-eventsub`;
const KICK_CALLBACK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/kick-eventsub`;

const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET;

const TOP_N = parseInt(process.env.EVENTSUB_TOP_N || '500', 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` with retry-on-rate-limit. Kick has no documented rate limit for
 * this endpoint -- discovered empirically 2026-07-27 when a straight
 * sequential loop with no delay hit "Rate limit exceeded" after ~40 calls.
 * Rather than guess a safe fixed delay, back off and retry on the specific
 * error rather than skipping the creator outright.
 */
async function withRateLimitRetry(fn, { retries = 5, baseDelayMs = 2000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = /rate limit/i.test(err.message);
      if (!isRateLimit || attempt >= retries) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`   ⏳ rate limited, backing off ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(delay);
    }
  }
}

async function getTwitchToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`twitch token ${res.status}`);
  return (await res.json()).access_token;
}

async function getKickToken() {
  const res = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`kick token ${res.status}`);
  return (await res.json()).access_token;
}

async function fetchTopCreators(platform) {
  const { data, error } = await supabase
    .from('rankings_cache')
    .select('creator_id, platform_id, username, display_name')
    .eq('platform', platform)
    .eq('rank_type', 'subscribers')
    .order('rank_position')
    .limit(TOP_N);
  if (error) throw new Error(`rankings_cache fetch failed: ${error.message}`);
  return data;
}

async function fetchExistingSubs(platform) {
  const existing = new Set();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('eventsub_subscriptions')
      .select('creator_id, event_type')
      .eq('platform', platform)
      .range(from, from + 999);
    if (error) throw new Error(`eventsub_subscriptions fetch failed: ${error.message}`);
    (data || []).forEach((r) => existing.add(`${r.creator_id}|${r.event_type}`));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return existing;
}

async function recordSubscription(platform, creatorId, eventType, subscriptionId, status) {
  const { error } = await supabase.from('eventsub_subscriptions').upsert(
    { platform, creator_id: creatorId, event_type: eventType, subscription_id: subscriptionId, status },
    { onConflict: 'platform,creator_id,event_type' },
  );
  if (error) console.error(`   ❌ record failed (${platform}/${eventType}): ${error.message}`);
}

async function createTwitchSubscription(token, broadcasterId, type) {
  const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
      transport: {
        method: 'webhook',
        callback: TWITCH_CALLBACK_URL,
        secret: TWITCH_EVENTSUB_SECRET,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `twitch eventsub ${res.status}`);
  return body.data[0].id;
}

async function createKickSubscription(token, broadcasterId) {
  const res = await fetch('https://api.kick.com/public/v1/events/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Must be a JSON number, not a string -- Kick returns a generic
      // "Invalid request" (no field-level detail) if broadcaster_user_id is
      // sent as a string, even for a perfectly valid id. Verified live.
      broadcaster_user_id: parseInt(broadcasterId, 10),
      events: [{ name: 'livestream.status.updated', version: 1 }],
      method: 'webhook',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `kick eventsub ${res.status}`);
  return body.data[0].subscription_id;
}

async function run() {
  console.log('📡 EventSub subscription manager');
  console.log(`   Callback URLs: ${TWITCH_CALLBACK_URL} / ${KICK_CALLBACK_URL}\n`);

  if (!TWITCH_EVENTSUB_SECRET) {
    console.error('❌ TWITCH_EVENTSUB_SECRET not set — cannot create Twitch subscriptions safely.');
    process.exit(1);
  }

  // --- Twitch ---------------------------------------------------------------
  const twitchToken = await getTwitchToken();
  const twitchCreators = await fetchTopCreators('twitch');
  const twitchExisting = await fetchExistingSubs('twitch');
  console.log(`🎮 Twitch: ${twitchCreators.length} top creators, ${twitchExisting.size / 2 | 0} already subscribed`);

  let twitchCreated = 0;
  let twitchFailed = 0;
  for (const creator of twitchCreators) {
    for (const type of ['stream.online', 'stream.offline']) {
      if (twitchExisting.has(`${creator.creator_id}|${type}`)) continue;
      try {
        const subId = await withRateLimitRetry(() => createTwitchSubscription(twitchToken, creator.platform_id, type));
        await recordSubscription('twitch', creator.creator_id, type, subId, 'enabled');
        twitchCreated++;
      } catch (err) {
        twitchFailed++;
        console.error(`   ❌ ${creator.username} (${type}): ${err.message}`);
      }
      await sleep(100);
    }
  }
  console.log(`   Created ${twitchCreated}, failed ${twitchFailed}\n`);

  // --- Kick -------------------------------------------------------------------
  if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
    console.warn('⚠️  Kick credentials not configured, skipping Kick subscriptions.');
  } else {
    const kickToken = await getKickToken();
    const kickCreators = await fetchTopCreators('kick');
    const kickExisting = await fetchExistingSubs('kick');
    console.log(`🎮 Kick: ${kickCreators.length} top creators, ${kickExisting.size} already subscribed`);

    let kickCreated = 0;
    let kickFailed = 0;
    for (const creator of kickCreators) {
      if (kickExisting.has(`${creator.creator_id}|livestream.status.updated`)) continue;
      try {
        const subId = await withRateLimitRetry(() => createKickSubscription(kickToken, creator.platform_id));
        await recordSubscription('kick', creator.creator_id, 'livestream.status.updated', subId, 'enabled');
        kickCreated++;
      } catch (err) {
        kickFailed++;
        console.error(`   ❌ ${creator.username}: ${err.message}`);
      }
      // Paced deliberately: an unpaced loop hit "Rate limit exceeded" after
      // ~40 sequential calls (2026-07-27 live test). Kick publishes no
      // documented limit for this endpoint, so 350ms is a conservative
      // starting point, same spirit as the 800ms Rumble scrape pacing.
      await sleep(350);
    }
    console.log(`   Created ${kickCreated}, failed ${kickFailed}`);
  }
}

run().catch((err) => {
  console.error('❌ Subscription manager failed:', err.message);
  process.exit(1);
});
