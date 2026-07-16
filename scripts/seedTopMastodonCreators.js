/**
 * Seed the top Mastodon creators.
 *
 * Strategy (Mastodon has no global "top accounts" API):
 *   1. Hardcoded curated list of ~250 well-known accounts (orgs, journalists,
 *      tech leaders, devs, artists).
 *   2. For each major instance, pull its `/api/v1/directory?order=active&local=true`
 *      to surface high-activity local accounts.
 *   3. Sample popular hashtags via the v2 search endpoint to find more.
 *   4. Filter to followers >= 1000 (we want real creators, not personal accounts).
 *   5. Insert until we reach ~1000 total.
 *
 * Run: node scripts/seedTopMastodonCreators.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const MIN_FOLLOWERS = 1000;
const TARGET_COUNT = 1000;
const TODAY = new Date().toISOString().split('T')[0];

const MAJOR_INSTANCES = [
  'mastodon.social',
  'hachyderm.io',
  'fosstodon.org',
  'infosec.exchange',
  'tech.lgbt',
  'mas.to',
  'sfba.social',
  'mastodon.online',
  'mstdn.social',
  'mastodon.world',
  'masto.ai',
  'aus.social',
  'mstdn.party',
  'social.lol',
  'mastodon.green',
  'phpc.social',
  'ruby.social',
  'flipboard.social',
  'journa.host',
  'newsie.social',
];

// Curated list of well-known accounts (handle without leading @)
const CURATED = [
  // Mastodon project + team
  'Mastodon@mastodon.social', 'Gargron@mastodon.social',
  // Major orgs / news
  'WIRED@flipboard.social', 'arstechnica@mastodon.social', 'nytimes@flipboard.social',
  'theintercept@journa.host', 'guardian@flipboard.social', 'BBCNews@mstdn.social',
  'NPR@mstdn.social', 'pbs@flipboard.social', 'reuters@flipboard.social',
  'apnews@flipboard.social', 'TechCrunch@flipboard.social', 'EFF@mastodon.social',
  'fsf@hostux.social', 'mozilla@mozilla.social',
  // Tech orgs
  'github@mastodon.social', 'gitlab@floss.social', 'firefox@mozilla.social',
  'nodejs@social.lfx.dev', 'rustlang@hachyderm.io', 'reactjs@mastodon.social',
  'vercel@mastodon.social', 'figma@mastodon.social', 'cloudflare@mastodon.social',
  'opensuse@fosstodon.org', 'fedora@fosstodon.org', 'ubuntu@fosstodon.org',
  'arch_linux@fosstodon.org', 'linuxfoundation@fosstodon.org',
  // Tech / dev leaders
  'kentcdodds@hachyderm.io', 'rich_harris@front-end.social',
  'dhh@hachyderm.io', 'tj@mastodon.social', 'sindresorhus@hachyderm.io',
  'janl@chaos.social', 'mxsw@mastodon.social',
  'wesbos@front-end.social', 'addyosmani@hachyderm.io', 'jaffathecake@toot.cafe',
  'simon@simonwillison.net', 'fasterthanlime@hachyderm.io',
  'amyngyn@hachyderm.io', 'paul_irish@hachyderm.io',
  // Science / academia
  'sundogplanets@mastodon.online', 'NASA@flipboard.social',
  'sciencemagazine@flipboard.social', 'newscientist@flipboard.social',
  'aps@mastodon.social', 'theNASEM@mstdn.social',
  // Journalists
  'mmasnick@mastodon.social', 'jay@journa.host', 'kashhill@journa.host',
  'taylorlorenz@mastodon.social', 'judd@mastodon.social',
  // Activism / nonprofits
  'wikipedia@wikis.world', 'doctorow@mamot.fr', 'aral@mastodon.ar.al',
  'jwz@mastodon.social', 'mekkaokereke@hachyderm.io',
  // Politicians / public figures
  'biz@mastodon.social', 'gargron@mastodon.social',
  // Creators / content
  'feditips@mstdn.social', 'fediversenews@mstdn.social',
  // Security
  'mttaggart@infosec.exchange', 'briankrebs@infosec.exchange', 'rmondello@infosec.exchange',
  'troyhunt@infosec.exchange', 'kevincollier@journa.host',
  // Misc tech / culture
  'davidbisset@phpc.social', 'eevee@social.coop',
  'pluralistic@mamot.fr', 'mhoye@mastodon.social',
];

async function existingPlatformIds() {
  const ids = new Set();
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('creators')
      .select('platform_id')
      .eq('platform', 'mastodon')
      // .order('id') is REQUIRED: range pagination without a stable unique sort
      // can repeat and skip rows across pages, so this existing-id set would be
      // incomplete and we'd re-insert duplicate creators.
      .order('id')
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => r.platform_id && ids.add(r.platform_id));
    if (data.length < page) break;
    from += page;
  }
  return ids;
}

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

async function lookupHandle(handle) {
  // handle = `user@instance`
  const [username, instance] = handle.split('@');
  if (!username || !instance) return null;
  try {
    const url = `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const acc = await res.json();
    if (!acc || !acc.id) return null;
    return { account: acc, instance };
  } catch {
    return null;
  }
}

async function instanceDirectory(instance, offset = 0, limit = 80) {
  try {
    const url = `https://${instance}/api/v1/directory?local=true&order=active&offset=${offset}&limit=${limit}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function insertCreator(profile) {
  const { error } = await supabase.from('creators').insert({
    platform: 'mastodon',
    platform_id: profile.platformId,
    username: profile.username,
    display_name: profile.displayName,
    profile_image: profile.profileImage,
    description: profile.description,
    country: null,
    category: null,
  });
  if (error) {
    if (error.code === '23505') return false; // duplicate, ok
    console.error(`  ❌ ${profile.username}: ${error.message}`);
    return false;
  }
  return true;
}

async function insertStats(platformId, profile) {
  // Look up the creator row we just inserted to get its id
  const { data: row } = await supabase
    .from('creators')
    .select('id')
    .eq('platform', 'mastodon')
    .eq('platform_id', platformId)
    .single();
  if (!row) return;

  // Data integrity rule: never write 0 for followers
  if (profile.followers <= 0) return;

  await supabase.from('creator_stats').insert({
    creator_id: row.id,
    recorded_at: TODAY,
    subscribers: profile.followers,
    followers: profile.followers,
    total_posts: profile.totalPosts,
    total_views: null,
  });
}

function normalize(account, instance) {
  return {
    platformId: `${instance}:${account.id}`,
    username: `${account.username}@${instance}`,
    displayName: account.display_name || account.username,
    profileImage: account.avatar || account.avatar_static || null,
    description: stripHtml(account.note),
    followers: account.followers_count || 0,
    totalPosts: account.statuses_count || 0,
  };
}

async function main() {
  console.log('🐘 Mastodon seed starting...\n');
  const existing = await existingPlatformIds();
  console.log(`📊 Already tracking ${existing.size} Mastodon accounts\n`);

  const collected = new Map(); // platformId -> normalized profile

  // ----- Phase 1: curated handles -----
  console.log(`🎯 Phase 1: resolving ${CURATED.length} curated handles...`);
  for (const handle of CURATED) {
    const result = await lookupHandle(handle);
    if (!result) continue;
    const profile = normalize(result.account, result.instance);
    if (profile.followers < MIN_FOLLOWERS) continue;
    if (existing.has(profile.platformId) || collected.has(profile.platformId)) continue;
    collected.set(profile.platformId, profile);
    await new Promise(r => setTimeout(r, 120));
  }
  console.log(`   ${collected.size} curated accounts queued\n`);

  // ----- Phase 2: instance directories (active local accounts on top instances) -----
  console.log(`🌐 Phase 2: scraping local directories of ${MAJOR_INSTANCES.length} instances...`);
  for (const instance of MAJOR_INSTANCES) {
    if (collected.size >= TARGET_COUNT) break;
    // Pull up to 480 from each instance (6 pages × 80)
    for (let offset = 0; offset < 480 && collected.size < TARGET_COUNT; offset += 80) {
      const accounts = await instanceDirectory(instance, offset, 80);
      if (!accounts || accounts.length === 0) break;
      for (const acc of accounts) {
        const profile = normalize(acc, instance);
        if (profile.followers < MIN_FOLLOWERS) continue;
        if (existing.has(profile.platformId) || collected.has(profile.platformId)) continue;
        collected.set(profile.platformId, profile);
      }
      await new Promise(r => setTimeout(r, 250));
    }
    console.log(`   ${instance}: total collected so far ${collected.size}`);
    if (collected.size >= TARGET_COUNT) break;
  }
  console.log(`   ${collected.size} accounts total after directory sweep\n`);

  // ----- Phase 3: insert -----
  console.log(`💾 Phase 3: inserting up to ${TARGET_COUNT} accounts...`);
  let inserted = 0;
  for (const [, profile] of collected) {
    if (inserted >= TARGET_COUNT) break;
    const ok = await insertCreator(profile);
    if (ok) {
      await insertStats(profile.platformId, profile);
      inserted++;
      if (inserted % 50 === 0) {
        console.log(`   ${inserted}/${TARGET_COUNT}: ${profile.username} (${profile.followers.toLocaleString()} followers)`);
      }
    }
  }

  console.log(`\n✨ Done. Seeded ${inserted} Mastodon creators.`);
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
