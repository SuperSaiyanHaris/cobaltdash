/**
 * Verifies src/lib/avatarUrl.js against REAL avatar URLs from the database.
 *
 * Pulls a sample per platform, rewrites each to a 96px target, and fetches both
 * the original and the rewritten URL. Fails loudly if a rewrite 404s/403s or
 * comes back larger than the original, which would mean we shipped a rewrite
 * rule that breaks images in production.
 *
 * Run: node scripts/verifyAvatarResize.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resizedAvatarUrl } from '../src/lib/avatarUrl.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const TARGET_PX = 96;
const PER_PLATFORM = 3;

async function size(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status, bytes: 0 };
    const buf = await res.arrayBuffer();
    return { ok: true, status: res.status, bytes: buf.byteLength };
  } catch (err) {
    return { ok: false, status: 'ERR:' + err.message, bytes: 0 };
  }
}

const platforms = ['youtube', 'twitch', 'tiktok', 'kick', 'bluesky', 'substack', 'rumble', 'mastodon', 'music'];
let failures = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const platform of platforms) {
  const { data, error } = await supabase
    .from('rankings_cache')
    .select('profile_image, display_name')
    .eq('platform', platform)
    .eq('rank_type', 'subscribers')
    .not('profile_image', 'is', null)
    .order('rank_position')
    .limit(PER_PLATFORM);

  if (error) {
    console.log(`${platform}: query error ${error.message}`);
    continue;
  }
  if (!data?.length) {
    console.log(`${platform}: no rows with an avatar`);
    continue;
  }

  for (const row of data) {
    const original = row.profile_image;
    const rewritten = resizedAvatarUrl(original, TARGET_PX);
    const changed = rewritten !== original;

    const before = await size(original);
    if (!changed) {
      console.log(`  ${platform.padEnd(9)} unchanged (no variant)   ${String(before.bytes).padStart(7)}b  ${row.display_name}`);
      totalBefore += before.bytes;
      totalAfter += before.bytes;
      continue;
    }

    const after = await size(rewritten);
    if (!after.ok) {
      failures++;
      console.log(`  ${platform.padEnd(9)} BROKEN ${after.status}  ${row.display_name}`);
      console.log(`      was: ${original}`);
      console.log(`      now: ${rewritten}`);
      continue;
    }
    if (before.ok && after.bytes > before.bytes) {
      failures++;
      console.log(`  ${platform.padEnd(9)} LARGER ${before.bytes} -> ${after.bytes}  ${row.display_name}`);
      continue;
    }
    totalBefore += before.bytes;
    totalAfter += after.bytes;
    const pct = before.bytes ? Math.round((1 - after.bytes / before.bytes) * 100) : 0;
    console.log(
      `  ${platform.padEnd(9)} ${String(before.bytes).padStart(7)}b -> ${String(after.bytes).padStart(6)}b  (-${pct}%)  ${row.display_name}`
    );
  }
}

console.log('');
console.log(`TOTAL: ${totalBefore}b -> ${totalAfter}b  (-${Math.round((1 - totalAfter / totalBefore) * 100)}%)`);
console.log(failures ? `FAILURES: ${failures}` : 'All rewrites resolved successfully.');
process.exit(failures ? 1 : 0);
