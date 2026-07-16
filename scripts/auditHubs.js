/**
 * Audit the hub taxonomy against live data.
 *
 * Catches the two ways src/lib/hubs.js silently rots:
 *   1. A category string in the config matches nothing in the DB (typo, or the
 *      platform renamed its tag) → the hub renders an empty page.
 *   2. A hub drops below MIN_HUB_CREATORS as data shifts → thin page.
 *
 * Also reports uncovered categories that have grown past the threshold and now
 * deserve a hub of their own.
 *
 * Read-only. Run: npm run audit:hubs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { HUBS, MIN_HUB_CREATORS, getHubPlatforms, hubCategoryMatchers } from '../src/lib/hubs.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchCategories(platform) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('creators')
      .select('category')
      .eq('platform', platform)
      .not('category', 'is', null)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  let problems = 0;

  for (const platform of getHubPlatforms()) {
    const rows = await fetchCategories(platform);

    // Raw category → count, keyed lowercase so casing drift can't hide a match.
    const counts = new Map();
    for (const r of rows) {
      const c = (r.category || '').trim().toLowerCase();
      if (!c) continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }

    console.log(`\n=== ${platform} — ${rows.length} categorized creators, ${counts.size} distinct categories ===`);

    const claimed = new Set();
    for (const hub of HUBS.filter((h) => h.platform === platform)) {
      const matchers = hubCategoryMatchers(hub);
      let total = 0;
      const dead = [];
      for (const m of matchers) {
        const n = counts.get(m) || 0;
        if (n === 0) dead.push(m);
        total += n;
        claimed.add(m);
      }

      const flags = [];
      if (dead.length) flags.push(`DEAD CATEGORIES: ${JSON.stringify(dead)}`);
      if (total < MIN_HUB_CREATORS) flags.push(`THIN (<${MIN_HUB_CREATORS})`);
      if (flags.length) problems++;

      const status = flags.length ? 'FAIL' : 'ok  ';
      console.log(`  ${status} ${String(total).padStart(4)}  /best/${hub.slug}${flags.length ? '   ' + flags.join(' | ') : ''}`);
    }

    // Categories big enough to deserve a hub but not covered by one.
    const uncovered = [...counts.entries()]
      .filter(([cat, n]) => n >= MIN_HUB_CREATORS && !claimed.has(cat))
      .sort((a, b) => b[1] - a[1]);
    if (uncovered.length) {
      console.log(`  -- uncovered categories past the threshold (candidates for new hubs):`);
      uncovered.forEach(([cat, n]) => console.log(`     ${String(n).padStart(4)}  ${JSON.stringify(cat)}`));
    }
  }

  console.log(
    problems
      ? `\n${problems} hub(s) need attention.`
      : `\nAll ${HUBS.length} hubs healthy.`
  );
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
