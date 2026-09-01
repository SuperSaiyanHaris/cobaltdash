/**
 * Process Pending Creator Requests
 *
 * Fetches pending TikTok requests from creator_requests table and processes them:
 * 1. Fetches TikTok profile data via scraper
 * 2. Inserts creator into creators table
 * 3. Creates initial stats entry
 * 4. Deletes the request on success
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { scrapeTikTokProfile, closeBrowser as closeTikTokBrowser } from '../src/services/tiktokScraper.js';
import { parseChannelHtml } from '../src/services/rumbleService.js';
import { SUBSTACK_CATEGORIES, normalizePublication } from '../src/services/substackService.js';

dotenv.config();

const RUMBLE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
};
const JSON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get today's date in America/New_York timezone
 */
function getTodayLocal() {
  const now = new Date();
  const nyDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const year = nyDate.getFullYear();
  const month = String(nyDate.getMonth() + 1).padStart(2, '0');
  const day = String(nyDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Process a Rumble request. Rumble has no API — we fetch the public channel
 * page server-side (GitHub Actions IPs aren't edge-blocked like Vercel's) and
 * parse it. The slug's case is preserved (Rumble URLs are case-sensitive) and
 * we try the `/user/` form first, then `/c/`. We never write a 0-follower row
 * (that's the data-integrity rule), so a brand-new 0-follower channel is asked
 * to come back once it has at least one follower.
 */
async function processRumbleRequest(request) {
  const slug = request.username; // case preserved by the API for Rumble
  // rumble.com Cloudflare-challenges every datacenter IP we've tried (GitHub
  // Actions, Vercel, Supabase Edge) — same block documented for collection and
  // discovery. Attempting this here can't distinguish "genuinely no such
  // channel" from "we're blocked," so a real request would get wrongly
  // tombstoned as failed. Leave it pending; scripts/local/rumble-auto.bat runs
  // this same processor with a platform filter from the one connection that
  // actually reaches rumble.com.
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`[rumble/${slug}] ⏭️  Skipped in CI (Rumble is IP-blocked here) — left pending for the local runner`);
    return { success: false, username: slug, error: 'skipped in CI', skipped: true };
  }
  console.log(`[rumble/${slug}] Fetching channel page...`);
  await supabase.from('creator_requests').update({ status: 'processing' }).eq('id', request.id);

  let prof = null;
  // Try /c/ first then /user/ (same order as getRumbleChannel) so an account
  // that lives at /c/ doesn't get mis-stored under a user: platform_id.
  for (const kind of ['c', 'user']) {
    const profileUrl = `https://rumble.com/${kind}/${slug}`;
    try {
      const res = await fetch(profileUrl, { headers: RUMBLE_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const parsed = parseChannelHtml(await res.text(), { slug, kind, profileUrl });
      if (parsed && parsed.followers > 0) { prof = parsed; break; }
    } catch { /* try next kind */ }
  }

  if (!prof) {
    await supabase.from('creator_requests')
      .update({ status: 'failed', error_message: 'No Rumble channel found (or it has no followers yet)' })
      .eq('id', request.id);
    console.log(`[rumble/${slug}] ❌ Not found / 0 followers — marked failed`);
    return { success: false, username: slug, error: 'not found' };
  }

  const { data: existing } = await supabase
    .from('creators').select('id').eq('platform', 'rumble').eq('platform_id', prof.platformId).maybeSingle();
  let creatorId;
  if (existing) {
    creatorId = existing.id;
  } else {
    const { data: created, error } = await supabase.from('creators').insert({
      platform: 'rumble', platform_id: prof.platformId, username: prof.username,
      display_name: prof.displayName, profile_image: prof.profileImage, description: prof.description,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    if (error) {
      await supabase.from('creator_requests').update({ status: 'failed', error_message: error.message }).eq('id', request.id);
      return { success: false, username: slug, error: error.message };
    }
    creatorId = created.id;
  }
  await supabase.from('creators').update({ last_verified_at: new Date().toISOString() }).eq('id', creatorId);
  await supabase.from('creator_stats').upsert({
    creator_id: creatorId, recorded_at: getTodayLocal(),
    followers: prof.followers, subscribers: prof.followers,
    total_posts: prof.totalPosts || null, total_views: null,
  }, { onConflict: 'creator_id,recorded_at' });
  await supabase.from('creator_requests').delete().eq('id', request.id);
  console.log(`[rumble/${slug}] ✅ Tracked ${prof.displayName} (${prof.followers} followers, ${prof.totalPosts} videos)`);
  return { success: true, username: prof.username };
}

/**
 * Shared: insert/find a creator + write a stats row, then delete the request.
 * `prof` is a normalized profile with platformId/username/displayName/etc.
 * Only called once we have a real follower/subscriber number (> 0).
 */
async function commitCreator(request, prof, { stampVerified = false } = {}) {
  const { data: existing } = await supabase
    .from('creators').select('id').eq('platform', prof.platform).eq('platform_id', prof.platformId).maybeSingle();
  let creatorId;
  if (existing) {
    creatorId = existing.id;
  } else {
    const { data: created, error } = await supabase.from('creators').insert({
      platform: prof.platform, platform_id: prof.platformId, username: prof.username,
      display_name: prof.displayName, profile_image: prof.profileImage, description: prof.description || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    if (error) {
      await supabase.from('creator_requests').update({ status: 'failed', error_message: error.message }).eq('id', request.id);
      return { success: false, username: prof.username, error: error.message };
    }
    creatorId = created.id;
  }
  const update = { updated_at: new Date().toISOString() };
  if (stampVerified) update.last_verified_at = new Date().toISOString();
  await supabase.from('creators').update(update).eq('id', creatorId);
  // Only write a stats row when we have a real number. Some Substack leaderboard
  // entries don't expose a count — in that case we still add the creator (it's a
  // valid, trackable pub) and let the daily collection sweep fill the number.
  // Never write 0/null subscribers (data-integrity rule).
  const subsVal = prof.subscribers ?? prof.followers;
  let statsWritten = false;
  if (typeof subsVal === 'number' && subsVal > 0) {
    await supabase.from('creator_stats').upsert({
      creator_id: creatorId, recorded_at: getTodayLocal(),
      followers: prof.followers ?? subsVal, subscribers: subsVal,
      total_posts: prof.totalPosts ?? null, total_views: prof.totalViews ?? null,
    }, { onConflict: 'creator_id,recorded_at' });
    statsWritten = true;
  }
  await supabase.from('creator_requests').delete().eq('id', request.id);
  return { success: true, username: prof.username, statsWritten };
}

/**
 * Mastodon: federated, public API (no auth). Look the account up directly on
 * its home instance; fall back to a mastodon.social federated resolve. We never
 * store a 0-follower row.
 */
async function processMastodonRequest(request) {
  const handle = request.username; // user@instance
  const [user, instance] = handle.split('@');
  console.log(`[mastodon/${handle}] Looking up account...`);
  await supabase.from('creator_requests').update({ status: 'processing' }).eq('id', request.id);

  let account = null, resolvedInstance = instance;
  try {
    const r = await fetch(`https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`, { headers: JSON_HEADERS, signal: AbortSignal.timeout(15000) });
    if (r.ok) account = await r.json();
  } catch { /* fall through */ }
  if (!account || !account.id) {
    try {
      const r = await fetch(`https://mastodon.social/api/v2/search?q=${encodeURIComponent(handle)}&type=accounts&limit=1&resolve=true`, { headers: JSON_HEADERS, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        const acc = (d.accounts || [])[0];
        if (acc) { account = acc; resolvedInstance = acc.acct.includes('@') ? acc.acct.split('@')[1] : 'mastodon.social'; }
      }
    } catch { /* fall through */ }
  }
  if (!account || !account.id || !(account.followers_count > 0)) {
    await supabase.from('creator_requests').update({ status: 'failed', error_message: 'Mastodon account not found (or it has no followers yet)' }).eq('id', request.id);
    console.log(`[mastodon/${handle}] ❌ Not found / 0 followers`);
    return { success: false, username: handle, error: 'not found' };
  }
  const prof = {
    platform: 'mastodon',
    platformId: `${resolvedInstance}:${account.id}`,
    username: `${account.username}@${resolvedInstance}`,
    displayName: account.display_name || account.username,
    profileImage: account.avatar || account.avatar_static || null,
    description: (account.note || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || null,
    followers: account.followers_count,
    subscribers: account.followers_count,
    totalPosts: account.statuses_count || 0,
    totalViews: null,
  };
  const out = await commitCreator(request, prof, { stampVerified: true });
  if (out.success) console.log(`[mastodon/${handle}] ✅ Tracked ${prof.displayName} (${prof.followers} followers)`);
  return out;
}

/**
 * Substack: the only public source of a subscriber count is the category
 * leaderboards, so we can only track a publication that appears on one. Sweep
 * the categories for a matching subdomain; if found, add it with its real
 * count. If it isn't ranked anywhere, we can't get a number, so we decline.
 */
async function processSubstackRequest(request) {
  const slug = request.username.toLowerCase();
  // substack.com blocks GitHub Actions datacenter IPs the same way it blocks
  // Rumble's (Supabase Edge is the one runtime that gets through). The
  // supabase/functions/collect-substack Edge Function already resolves
  // pending Substack requests every day as part of its category sweep —
  // attempting it again here would just fail the same blocked way and, worse,
  // could tombstone a genuinely valid request as "not found."
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`[substack/${slug}] ⏭️  Skipped in CI (Substack is IP-blocked here) — resolved daily by the collect-substack Edge Function instead`);
    return { success: false, username: slug, error: 'skipped in CI', skipped: true };
  }
  console.log(`[substack/${slug}] Searching category leaderboards...`);
  await supabase.from('creator_requests').update({ status: 'processing' }).eq('id', request.id);

  let match = null;
  outer:
  for (const cat of SUBSTACK_CATEGORIES) {
    for (let page = 0; page < 6; page++) {
      try {
        const r = await fetch(`https://substack.com/api/v1/category/public/${cat.id}/paid?page=${page}`, { headers: JSON_HEADERS, signal: AbortSignal.timeout(15000) });
        if (!r.ok) break;
        const d = await r.json();
        const pubs = d.publications || [];
        const hit = pubs.find((p) => (p.subdomain || '').toLowerCase() === slug);
        if (hit) { match = normalizePublication(hit); break outer; }
        await sleep(350);
        if (!d.more || pubs.length === 0) break;
      } catch { break; }
    }
  }

  if (!match) {
    await supabase.from('creator_requests')
      .update({ status: 'failed', error_message: 'Substack not found on any public category leaderboard' })
      .eq('id', request.id);
    console.log(`[substack/${slug}] ❌ Not on any leaderboard — can't read a subscriber count`);
    return { success: false, username: slug, error: 'not rankable' };
  }
  const out = await commitCreator(request, match);
  if (out.success) {
    console.log(`[substack/${slug}] ✅ Tracked ${match.displayName}` +
      (out.statsWritten ? ` (${match.subscribers} subscribers)` : ` (count fills on next daily sweep)`));
  }
  return out;
}

/**
 * Process a single creator request
 */
async function processRequest(request) {
  console.log(`\n[${request.platform}/${request.username}] Processing request...`);

  // Non-TikTok platforms each have their own fetch + parse path.
  if (request.platform === 'rumble') return await processRumbleRequest(request);
  if (request.platform === 'mastodon') return await processMastodonRequest(request);
  if (request.platform === 'substack') return await processSubstackRequest(request);

  try {
    // Mark as processing
    await supabase
      .from('creator_requests')
      .update({ status: 'processing' })
      .eq('id', request.id);

    // Scrape profile data based on platform
    console.log(`[${request.username}] Scraping ${request.platform} profile...`);
    const profileData = await scrapeTikTokProfile(request.username);
    console.log(`[${request.username}] ✓ Scraped: ${profileData.displayName} (${profileData.followers.toLocaleString()} followers)`);

    // Check if creator already exists (in case it was added elsewhere)
    const { data: existingCreator } = await supabase
      .from('creators')
      .select('id')
      .eq('platform', request.platform)
      .ilike('username', request.username)
      .single();

    let creatorId;

    if (existingCreator) {
      console.log(`[${request.username}] Creator already exists, using existing ID`);
      creatorId = existingCreator.id;
    } else {
      // Insert new creator
      const { data: newCreator, error: creatorError } = await supabase
        .from('creators')
        .insert({
          platform: profileData.platform,
          platform_id: profileData.platformId,
          username: profileData.username,
          display_name: profileData.displayName,
          profile_image: profileData.profileImage,
          description: profileData.description,
          category: profileData.category,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (creatorError) {
        throw new Error(`Failed to insert creator: ${creatorError.message}`);
      }

      creatorId = newCreator.id;
      console.log(`[${request.username}] ✓ Creator inserted into database`);
    }

    // Create initial stats entry
    const today = getTodayLocal();
    const statsInsert = {
      creator_id: creatorId,
      recorded_at: today,
      followers: profileData.followers,
      total_posts: profileData.totalPosts,
      created_at: new Date().toISOString()
    };
    // TikTok also has totalLikes — store in total_views field
    if (request.platform === 'tiktok' && profileData.totalLikes) {
      statsInsert.total_views = profileData.totalLikes;
    }
    const { error: statsError } = await supabase
      .from('creator_stats')
      .insert(statsInsert);

    if (statsError && !statsError.message.includes('duplicate key')) {
      console.warn(`[${request.username}] Warning: Failed to create stats entry: ${statsError.message}`);
    } else {
      console.log(`[${request.username}] ✓ Initial stats created`);
    }

    // Delete the completed request (creator is now in the database)
    await supabase
      .from('creator_requests')
      .delete()
      .eq('id', request.id);

    console.log(`[${request.username}] ✅ Request completed successfully (record deleted)`);
    return { success: true, username: request.username };

  } catch (error) {
    // Check the actual HTTP status TikTok returned, not a substring match on
    // the message text — a plain includes('429') false-positives on any
    // username/id that happens to contain those digits (e.g. a request for
    // "stevenjoshlujan4295" got misread as a 429 rate limit purely because
    // the username ends in 4295, which permanently jammed the whole queue:
    // that one request kept reverting to pending, landing back at the front
    // next run since created_at doesn't change, and re-triggering the same
    // false abort forever).
    const isRateLimit = error.status === 429;
    // A page that loaded (200 OK) but didn't contain TikTok's expected data
    // structure is the real signal of being served a block/challenge page
    // instead of a genuine "no such user."
    const isScrapeBlocked = error.message.includes('No rehydration data found');
    console.error(`[${request.username}] ❌ Error:`, error.message);

    // If rate limited, revert to pending immediately (no AI resolution needed)
    if (isRateLimit) {
      await supabase
        .from('creator_requests')
        .update({ status: 'pending' })
        .eq('id', request.id);
      console.log(`[${request.username}] ↩️  Reverted to pending (rate limited, will retry next run)`);
      return { success: false, username: request.username, error: error.message, rateLimited: true, scrapeBlocked: isScrapeBlocked };
    }

    // All attempts exhausted — mark as failed (keeps row as tombstone so discovery
    // won't re-queue this username on future runs)
    await supabase
      .from('creator_requests')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', request.id);
    console.log(`[${request.username}] 🗑️  Marked as failed (no valid profile found after all attempts)`);
    return { success: false, username: request.username, error: error.message, rateLimited: false, scrapeBlocked: isScrapeBlocked };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('==========================================');
  console.log('Processing Creator Requests');
  console.log('==========================================\n');

  try {
    // Clean up old completed requests (keep 'failed' rows as tombstones to prevent re-queuing)
    const { data: staleRequests, error: cleanupFetchError } = await supabase
      .from('creator_requests')
      .select('id')
      .in('status', ['completed']);

    if (!cleanupFetchError && staleRequests && staleRequests.length > 0) {
      const ids = staleRequests.map(r => r.id);
      await supabase.from('creator_requests').delete().in('id', ids);
      console.log(`🧹 Cleaned up ${staleRequests.length} old completed request(s)\n`);
    }

    // Fetch pending requests
    console.log('Fetching pending requests...');
    const maxRequests = parseInt(process.argv[2]) || 50; // default: 50 per run
    const platformFilter = process.argv[3] || null; // optional: 'tiktok'
    
    let query = supabase
      .from('creator_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(maxRequests);
    
    if (platformFilter) {
      query = query.eq('platform', platformFilter.toLowerCase());
      console.log(`Platform filter: ${platformFilter.toLowerCase()} only`);
    }
    
    const { data: pendingRequests, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch requests: ${fetchError.message}`);
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('No pending requests found.\n');
      return;
    }

    console.log(`Found ${pendingRequests.length} pending request(s)\n`);

    // Process requests one by one with delays
    const results = [];
    let consecutiveScrapeFailures = 0;
    const BLOCK_THRESHOLD = 3; // 3 consecutive scrape failures = likely IP block

    for (let i = 0; i < pendingRequests.length; i++) {
      const request = pendingRequests[i];
      const result = await processRequest(request);
      results.push(result);

      // Track consecutive scrape failures (og:description missing = likely IP block)
      if (result.scrapeBlocked) {
        consecutiveScrapeFailures++;
      } else {
        consecutiveScrapeFailures = 0;
      }

      // If rate limited or likely IP-blocked, stop processing
      if (result.rateLimited) {
        console.log(`\n⚠️  Rate limited — skipping remaining ${pendingRequests.length - i - 1} request(s) (will retry next run)`);
        break;
      }

      if (consecutiveScrapeFailures >= BLOCK_THRESHOLD) {
        console.log(`\n⚠️  ${BLOCK_THRESHOLD} consecutive scrape failures — likely IP-blocked by ${request.platform}`);
        console.log(`    Reverting remaining ${pendingRequests.length - i - 1} request(s) to pending...`);
        // Revert any requests that were marked processing back to pending
        for (let j = i + 1; j < pendingRequests.length; j++) {
          await supabase
            .from('creator_requests')
            .update({ status: 'pending' })
            .eq('id', pendingRequests[j].id);
        }
        break;
      }

      // Delay between requests (10-15 seconds randomized for safety)
      if (i < pendingRequests.length - 1) {
        const delay = 10000 + Math.random() * 5000;
        console.log(`\nWaiting ${(delay / 1000).toFixed(1)}s before next request...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Summary
    console.log('\n==========================================');
    console.log('Summary');
    console.log('==========================================');
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`Total: ${results.length}`);
    console.log(`✓ Successful: ${successful}`);
    console.log(`✗ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed requests:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.username}: ${r.error}`);
      });
    }

    console.log('');

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await closeTikTokBrowser();
  }
}

main();
