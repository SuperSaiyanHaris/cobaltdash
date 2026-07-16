/**
 * Discover new Mastodon creators on a rolling basis.
 *
 * Hits each major instance's local directory ordered by `active`, plus rotates
 * through topic hashtag searches via mastodon.social. Adds anyone new with
 * 5K+ followers, capped at 100 per run.
 *
 * Runs from .github/workflows/youtube-discovery.yml 4x daily.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const MIN_FOLLOWERS = 5000;
const MAX_PER_RUN = 100;
const TODAY = new Date().toISOString().split('T')[0];

const INSTANCES = [
  'mastodon.social', 'hachyderm.io', 'fosstodon.org', 'infosec.exchange',
  'tech.lgbt', 'mas.to', 'sfba.social', 'mastodon.online',
  'mstdn.social', 'mastodon.world', 'flipboard.social', 'journa.host',
];

// Rotate through topic hashtags — different subset per run.
const HASHTAG_POOL = [
  'news', 'tech', 'art', 'photography', 'music', 'gaming', 'science',
  'design', 'webdev', 'opensource', 'cybersecurity', 'ai', 'climate',
  'journalism', 'politics', 'film', 'books', 'writers', 'comedy',
  'gamedev', 'rust', 'python', 'javascript', 'devops', 'linux',
];

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
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

async function existingIds() {
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

async function fetchInstanceDirectory(instance, offset = 0) {
  try {
    const url = `https://${instance}/api/v1/directory?local=true&order=active&offset=${offset}&limit=80`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function searchHashtagAccounts(tag) {
  // Use mastodon.social's federated search, type=accounts queries handles + display names
  // matching the tag word. Combined with timeline tag scraping for breadth.
  try {
    const url = `https://mastodon.social/api/v2/search?q=${encodeURIComponent(tag)}&type=accounts&limit=20&resolve=false`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.accounts || []).map(acc => {
      const instance = acc.acct.includes('@') ? acc.acct.split('@')[1] : 'mastodon.social';
      return normalize(acc, instance);
    });
  } catch {
    return [];
  }
}

async function main() {
  console.log(`🐘 Mastodon discovery starting (${TODAY})`);
  const seen = await existingIds();
  console.log(`📊 Already tracking ${seen.size} accounts\n`);

  const candidates = new Map();

  // Pull each instance's local directory
  for (const instance of INSTANCES) {
    if (candidates.size >= MAX_PER_RUN * 3) break;
    const accounts = await fetchInstanceDirectory(instance, 0);
    for (const acc of accounts) {
      const p = normalize(acc, instance);
      if (p.followers < MIN_FOLLOWERS) continue;
      if (seen.has(p.platformId) || candidates.has(p.platformId)) continue;
      candidates.set(p.platformId, p);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`  Directory sweep: ${candidates.size} candidates`);

  // Rotate through 3 random hashtags this run
  const tags = [...HASHTAG_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const tag of tags) {
    const accounts = await searchHashtagAccounts(tag);
    for (const p of accounts) {
      if (p.followers < MIN_FOLLOWERS) continue;
      if (seen.has(p.platformId) || candidates.has(p.platformId)) continue;
      candidates.set(p.platformId, p);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`  After hashtag scan: ${candidates.size} candidates\n`);

  let added = 0;
  for (const [, profile] of candidates) {
    if (added >= MAX_PER_RUN) break;

    const { data: row, error: insertErr } = await supabase
      .from('creators')
      .insert({
        platform: 'mastodon',
        platform_id: profile.platformId,
        username: profile.username,
        display_name: profile.displayName,
        profile_image: profile.profileImage,
        description: profile.description,
      })
      .select('id')
      .single();

    if (insertErr) {
      if (insertErr.code !== '23505') {
        console.error(`  ❌ ${profile.username}: ${insertErr.message}`);
      }
      continue;
    }

    // Data integrity: skip stats if 0
    if (profile.followers > 0) {
      await supabase.from('creator_stats').insert({
        creator_id: row.id,
        recorded_at: TODAY,
        subscribers: profile.followers,
        followers: profile.followers,
        total_posts: profile.totalPosts,
        total_views: null,
      });
    }

    added++;
    console.log(`   ✅ ${profile.username} (${profile.followers.toLocaleString()} followers)`);
  }

  console.log(`\n✨ Done. Added ${added} new Mastodon creators.`);
}

main().catch((e) => {
  console.error('❌ Discovery failed:', e);
  process.exit(1);
});
