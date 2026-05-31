import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

// Per-platform refresh.
//
// Previously this called a single Postgres function that looped through all 6
// platforms in one transaction. The combined query routinely hit the PostgREST
// statement timeout (~8s) and silently failed the ENTIRE refresh, leaving
// rankings_cache stale for hours. Refactored 2026-05-30 to call the per-platform
// function `refresh_rankings_cache_platform(text)` once per platform so any
// individual failure doesn't take down the others.

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLATFORMS = ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'];

console.log('🏆 Refreshing rankings cache (per-platform)...');
const totalStart = Date.now();

let okCount = 0;
const failures = [];

for (const platform of PLATFORMS) {
  const start = Date.now();
  const { error } = await supabase.rpc('refresh_rankings_cache_platform', { p_platform: platform });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (error) {
    console.warn(`  ⚠️  ${platform.padEnd(8)} failed in ${elapsed}s — ${error.message}`);
    failures.push({ platform, error: error.message });
  } else {
    console.log(`  ✅ ${platform.padEnd(8)} refreshed in ${elapsed}s`);
    okCount++;
  }
}

const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
console.log(`\nFinished: ${okCount}/${PLATFORMS.length} platforms refreshed in ${totalElapsed}s`);

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} platform(s) failed:`);
  failures.forEach(f => console.error(`   - ${f.platform}: ${f.error}`));
  // Fail the job loudly so a failed platform shows up in the Actions tab.
  // Even one failed platform means users see stale rankings for that platform.
  process.exit(1);
}
