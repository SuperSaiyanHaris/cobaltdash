/**
 * Data-health check: fails (exit 1) when the data the site shows has quietly
 * gone stale or thin, so a broken job surfaces as a red GitHub run and a
 * failure email instead of weeks of frozen numbers. Read-only.
 *
 * Runs at the end of every Daily Stats Collection (rollup job) and every few
 * hours from .github/workflows/live-checks.yml.
 *
 * Coverage floors sit well under what a healthy day produces (measured
 * 2026-09-24: YouTube/Twitch 95.5%, Kick 96%, Bluesky 98.5%, Music 100%,
 * TikTok 90%, Mastodon 87%, Substack 46% since only leaderboard publications
 * get counts). The gap is dead/renamed accounts, which stay missing every day.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('ERROR: VITE_SUPABASE_URL and a Supabase key are required');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Minimum share of a platform's creators that must have a reading.
// `days`: how many recent ET dates may count (1 = today only). TikTok and
// Substack are collected by other schedules, so yesterday's run also counts.
const COVERAGE = {
  youtube:  { min: 0.85, days: 1 },
  twitch:   { min: 0.85, days: 1 },
  kick:     { min: 0.85, days: 1 },
  bluesky:  { min: 0.85, days: 1 },
  music:    { min: 0.85, days: 1 },
  mastodon: { min: 0.70, days: 1 },
  tiktok:   { min: 0.75, days: 2 },
  substack: { min: 0.30, days: 2 },
};

// --strict: right after a collection run, today's readings must exist. Without
// it (the periodic check), yesterday's also count, so the hours between ET
// midnight and the first run of the day don't raise false alarms.
const STRICT = process.argv.includes('--strict');

const etDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

async function count(table, apply) {
  const { count: n, error } = await apply(supabase.from(table).select('*', { count: 'exact', head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return n || 0;
}

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ❌ ${msg}`); };
const ok = (msg) => console.log(`  ✅ ${msg}`);

async function checkCoverage() {
  const now = new Date();
  const dates = [etDate(now), etDate(new Date(now.getTime() - 86400000))];
  for (const [platform, rule] of Object.entries(COVERAGE)) {
    const total = await count('creators', (q) => q.eq('platform', platform));
    if (!total) { fail(`${platform}: no creators found`); continue; }
    let best = 0;
    let bestDate = null;
    for (const d of dates.slice(0, STRICT ? rule.days : 2)) {
      const n = await count('creator_stats', (q) => q.eq('recorded_at', d).eq('creators.platform', platform).select('creator_id, creators!inner(platform)', { count: 'exact', head: true }));
      if (n > best) { best = n; bestDate = d; }
    }
    const share = best / total;
    const line = `${platform}: ${best.toLocaleString()}/${total.toLocaleString()} creators (${(share * 100).toFixed(1)}%) have a reading${bestDate ? ` for ${bestDate}` : ''}`;
    if (share < rule.min) fail(`${line}, below ${(rule.min * 100).toFixed(0)}%`);
    else ok(line);
  }
}

async function checkHoursWatched() {
  const now = new Date();
  const dates = [etDate(now), etDate(new Date(now.getTime() - 86400000))].slice(0, STRICT ? 1 : 2);
  let best = 0;
  for (const d of dates) {
    const n = await count('creator_stats', (q) => q.eq('recorded_at', d).gt('hours_watched_month', 0).eq('creators.platform', 'twitch').select('creator_id, creators!inner(platform)', { count: 'exact', head: true }));
    best = Math.max(best, n);
  }
  if (best < 1000) fail(`only ${best} Twitch creators have 30-day hours watched (rollup not run or broken)`);
  else ok(`${best.toLocaleString()} Twitch creators have 30-day hours watched`);
}

async function checkLiveSweep() {
  // New stream sessions open all day long; none in 30 minutes means the
  // 5-minute Vercel Cron sweep and the EventSub webhooks have both stopped.
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const n = await count('stream_sessions', (q) => q.gte('created_at', since));
  if (n === 0) fail('no new stream sessions in the last 30 minutes (live sweep stopped?)');
  else ok(`${n} stream sessions opened in the last 30 minutes`);
}

async function checkRankings() {
  for (const platform of ['twitch', 'kick', 'youtube']) {
    const { data, error } = await supabase.from('rankings_cache').select('computed_at')
      .eq('platform', platform).eq('rank_type', 'subscribers').order('computed_at', { ascending: false }).limit(1);
    if (error) { fail(`rankings_cache ${platform}: ${error.message}`); continue; }
    const at = data?.[0]?.computed_at;
    const hours = at ? (Date.now() - new Date(at).getTime()) / 3600000 : Infinity;
    if (hours > 12) fail(`${platform} rankings last refreshed ${at ? `${hours.toFixed(1)}h ago` : 'never'}`);
    else ok(`${platform} rankings refreshed ${hours.toFixed(1)}h ago`);
  }
}

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const all = { coverage: checkCoverage, hours: checkHoursWatched, live: checkLiveSweep, rankings: checkRankings };

console.log('🩺 Data health\n');
for (const [name, fn] of Object.entries(all)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await fn();
  } catch (err) {
    fail(`${name} check errored: ${err.message}`);
  }
}
console.log(failures.length ? `\n❌ ${failures.length} problem(s)` : '\n✅ All healthy');
if (failures.length) process.exit(1);
