import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

// Per-platform refresh, called once per platform via the PostgREST RPC so any
// individual failure doesn't take down the others.
//
// IMPORTANT — YouTube and Twitch are intentionally NOT refreshed here.
// They're the two heavy platforms (5.5K and 13K creators). The Supabase REST
// API path PostgREST uses has a hard ~60s statement_timeout that we cannot
// raise (ALTER ROLE / SET LOCAL only affect direct + pg_cron connections, not
// REST). Twitch's refresh has grown past 60s and times out here, failing the
// whole GitHub Actions job. Those two are refreshed reliably INSIDE Postgres
// by the `refresh-rankings-heavy-platforms` pg_cron job (every 3h, ~75s, where
// the function's `SET LOCAL statement_timeout='180s'` actually applies). The
// fast platforms below all finish in well under 60s. See CLAUDE.md.

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Rumble was delisted 2026-09-04 (permanently Cloudflare-blocked, see CLAUDE.md)
// and dropped from here — no reason to keep spending a refresh cycle on a
// platform with no UI path to it. Its rankings_cache rows just go stale in
// place; harmless, since nothing but a direct-URL visit reads them anymore.
const PLATFORMS = ['tiktok', 'kick', 'bluesky', 'music', 'mastodon', 'substack'];

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
