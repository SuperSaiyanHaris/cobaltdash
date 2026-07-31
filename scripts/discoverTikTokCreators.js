/**
 * Discover TikTok creators using our existing DB as the source
 *
 * Strategy: Pull YouTube/Twitch/Kick creators from our DB and queue their
 * username into creator_requests as pending TikTok lookups.
 * processCreatorRequests.js handles the actual scraping + Gemini AI fallback
 * (resolves correct TikTok handle if the YouTube/Twitch username differs).
 *
 * No hardcoded lists, no hallucinated usernames. Our own verified creator DB
 * is the source of truth.
 *
 * Usage: node scripts/discoverTikTokCreators.js [count]
 *   count: max candidates to queue per run (default: 50)
 */
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) { console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run without it.'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/**
 * Get all existing TikTok usernames already in DB
 */
async function getExistingTikTokUsernames() {
  const allUsernames = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('username')
      .eq('platform', 'tiktok')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this existing-username set
      // would be incomplete and we'd re-queue creators already tracked.
      .order('id')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    data.forEach(c => allUsernames.add(c.username.toLowerCase()));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allUsernames;
}

/**
 * Get usernames already queued in creator_requests (to avoid re-queuing)
 */
async function getAlreadyQueued() {
  const queued = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('creator_requests')
      .select('username')
      .eq('platform', 'tiktok')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this already-queued set would
      // be incomplete and we'd re-queue the same usernames.
      .order('id')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    data.forEach(r => queued.add(r.username.toLowerCase()));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return queued;
}

/**
 * Get YouTube/Twitch/Kick creators sorted by subscriber count desc.
 * These are our candidates for TikTok discovery.
 */
async function getCandidates(existingTikTok, alreadyQueued) {
  const seen = new Set();
  const candidates = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('username, display_name')
      .in('platform', ['youtube', 'twitch', 'kick'])
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so the candidate list would be
      // incomplete and non-deterministic between runs.
      .order('id')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    for (const c of data) {
      const u = c.username.toLowerCase();
      if (existingTikTok.has(u)) continue;  // already on TikTok
      if (alreadyQueued.has(u)) continue;   // already queued
      if (seen.has(u)) continue;            // same username across platforms
      seen.add(u);
      candidates.push({ username: c.username, display_name: c.display_name });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return candidates;
}

async function discoverTikTokCreators() {
  const count = parseInt(process.argv[2]) || 50;

  console.log('🎵 TikTok Creator Discovery (queuing into creator_requests)\n');
  console.log('═══════════════════════════════════════════════════');

  const [existingTikTok, alreadyQueued] = await Promise.all([
    getExistingTikTokUsernames(),
    getAlreadyQueued(),
  ]);

  console.log(`📊 TikTok creators in DB: ${existingTikTok.size}`);
  console.log(`📋 Already queued in creator_requests: ${alreadyQueued.size}`);

  const candidates = await getCandidates(existingTikTok, alreadyQueued);
  const toQueue = candidates.slice(0, count);

  console.log(`🔍 Fresh candidates from YouTube/Twitch/Kick DB: ${candidates.length}`);
  console.log(`📥 Queuing ${toQueue.length} this run\n`);
  console.log('═══════════════════════════════════════════════════\n');

  if (toQueue.length === 0) {
    console.log('✅ Nothing to queue — all known creators already covered.\n');
    return;
  }

  const rows = toQueue.map(c => ({
    platform: 'tiktok',
    username: c.username,
    user_id: null,
    status: 'pending',
    created_at: new Date().toISOString(),
  }));

  // Insert in batches of 100
  let queued = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('creator_requests')
      .upsert(batch, { onConflict: 'platform,username', ignoreDuplicates: true });

    if (error) {
      console.error(`❌ Insert error: ${error.message}`);
    } else {
      queued += batch.length;
    }
  }

  console.log(`✅ Queued ${queued} candidates into creator_requests`);
  console.log(`   processCreatorRequests.js will handle scraping + AI resolution`);
  console.log(`   Remaining candidates for future runs: ${candidates.length - toQueue.length}\n`);
}

discoverTikTokCreators().catch(err => {
  console.error('Discovery failed:', err);
  process.exit(1);
});
