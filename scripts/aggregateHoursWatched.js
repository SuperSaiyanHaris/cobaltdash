/**
 * Aggregate Hours Watched
 *
 * Rolls finalized stream_sessions up into today's creator_stats row for every
 * Twitch and Kick creator: hours_watched_day/week/month, peak_viewers_day,
 * avg_viewers_day, streams_count_day. Runs after the daily stats collection
 * has created today's rows (see .github/workflows/daily-stats-collection.yml).
 *
 * SET-BASED REWRITE (2026-09-25). The previous version looped every creator
 * with session history and made 5 sequential round trips each (4 window
 * queries + 1 update), after paging the entire 1.1M-row stream_sessions table
 * just to find those creators. It took ~4 hours and grew with the roster,
 * pushing the whole workflow toward GitHub's 6-hour job limit. Now:
 *   1. one keyset-paginated sweep of the sessions that ended in the last 30
 *      days (~400K rows, ~80s),
 *   2. aggregate every window in memory,
 *   3. read today's Twitch/Kick creator_stats rows and write back only the
 *      rows whose numbers changed (concurrent), including zeroing creators
 *      whose sessions have aged out of the windows.
 * Also fixes "today": it was midnight UTC on the runner, not the ET date
 * collectDailyStats.js uses for recorded_at.
 *
 * SAMPLE-QUALITY GATE (added 2026-07-27). hours_watched for a session is
 * avg_viewers * duration, and avg_viewers is only as good as how many viewer
 * samples went into it. Sessions with fewer than MIN_SAMPLES_FOR_AGGREGATE
 * samples are excluded from the numbers shown on the site (an honest
 * undercount rather than a falsely precise one). stream_sessions itself is
 * never modified here.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { pathToFileURL } from 'url';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Created in main() so importing this module (the tests do) needs no credentials.
let supabase = null;

const MIN_SAMPLES_FOR_AGGREGATE = 2;
const PAGE = 1000;           // PostgREST's max rows per response
const WRITE_CONCURRENCY = 16;
const TZ = 'America/New_York';
// --dry-run: compute and report, write nothing (safe to run against production).
const DRY_RUN = process.argv.includes('--dry-run');

/** Today's date in ET (YYYY-MM-DD), matching collectDailyStats.js's recorded_at. */
function getTodayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** The UTC instant at which `dateStr` (YYYY-MM-DD) begins in `tz`. */
export function zonedMidnight(dateStr, tz) {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).map((x) => [x.type, x.value]));
  const shownAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(guess.getTime() - (shownAsUtc - guess.getTime()));
}

/** Run a PostgREST query, retrying transient failures (statement timeouts on a slow page). */
async function withRetry(label, makeQuery, attempts = 4) {
  for (let i = 1; ; i++) {
    const { data, error } = await makeQuery();
    if (!error) return data;
    if (i >= attempts) throw new Error(`${label}: ${error.message}`);
    console.warn(`   ⚠️  ${label} attempt ${i} failed (${error.message}), retrying`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

async function pooled(items, limit, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await worker(item); }
  }));
}

function emptyAgg() {
  return { hours: 0, peak: 0, avgSum: 0, count: 0 };
}

function addSession(agg, s) {
  agg.hours += parseFloat(s.hours_watched) || 0;
  agg.peak = Math.max(agg.peak, s.peak_viewers || 0);
  agg.avgSum += s.avg_viewers || 0;
  agg.count += 1;
}

const round2 = (n) => Math.round(n * 100) / 100;
const same = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;

/**
 * Add one finalized session to its creator's today/week/month windows (the
 * caller only fetches sessions from the last 30 days, so every accepted one
 * counts toward month). Returns false for sessions below the sample-quality
 * bar, which are left out.
 */
export function bucketSession(byCreator, s, { todayStart, weekAgo }) {
  if (!(typeof s.sample_count === 'number' && s.sample_count >= MIN_SAMPLES_FOR_AGGREGATE)) return false;
  let a = byCreator.get(s.creator_id);
  if (!a) { a = { today: emptyAgg(), week: emptyAgg(), month: emptyAgg() }; byCreator.set(s.creator_id, a); }
  const ended = new Date(s.ended_at);
  addSession(a.month, s);
  if (ended >= weekAgo) addSession(a.week, s);
  if (ended >= todayStart) addSession(a.today, s);
  return true;
}

/**
 * Which of today's rows need writing, and with what. Creators with no
 * sessions in the windows get zeros (so old numbers decay); rows already
 * holding the right values are skipped.
 */
export function planWrites(rows, byCreator) {
  const writes = [];
  for (const r of rows) {
    const a = byCreator.get(r.creator_id) || { today: emptyAgg(), week: emptyAgg(), month: emptyAgg() };
    const next = {
      hours_watched_day: round2(a.today.hours),
      hours_watched_week: round2(a.week.hours),
      hours_watched_month: round2(a.month.hours),
      peak_viewers_day: a.today.peak,
      avg_viewers_day: a.today.count ? Math.round(a.today.avgSum / a.today.count) : 0,
      streams_count_day: a.today.count,
    };
    const unchanged = Object.keys(next).every((k) => r[k] !== null && r[k] !== undefined && same(r[k], next[k]));
    if (!unchanged) writes.push({ creator_id: r.creator_id, fields: next });
  }
  return writes;
}

async function aggregateHoursWatched() {
  const t0 = Date.now();
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run without it.');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const todayStr = getTodayLocal();
  const todayStart = zonedMidnight(todayStr, TZ);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  console.log('📊 Aggregating hours watched');
  console.log(`   Today (ET): ${todayStr}, starts ${todayStart.toISOString()}\n`);

  // --- 1. Sweep sessions that ended in the last 30 days ----------------------
  const byCreator = new Map(); // creator_id -> { today, week, month }
  let swept = 0;
  let excludedLowSample = 0;
  let after = null;
  for (;;) {
    const cursor = after;
    const data = await withRetry('stream_sessions sweep', () => {
      let q = supabase
        .from('stream_sessions')
        .select('id, creator_id, ended_at, hours_watched, peak_viewers, avg_viewers, sample_count')
        .gte('ended_at', monthAgo.toISOString())
        .order('id', { ascending: true })
        .limit(PAGE);
      if (cursor) q = q.gt('id', cursor);
      return q;
    });
    for (const s of data) {
      if (!bucketSession(byCreator, s, { todayStart, weekAgo })) excludedLowSample++;
    }
    swept += data.length;
    if (data.length < PAGE) break;
    after = data[data.length - 1].id;
  }
  console.log(`   Swept ${swept.toLocaleString()} sessions for ${byCreator.size.toLocaleString()} creators in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // --- 2. Today's Twitch/Kick rows (collectDailyStats.js creates them) -------
  const rows = [];
  after = null;
  for (;;) {
    const cursor = after;
    const data = await withRetry('creator_stats today', () => {
      let q = supabase
        .from('creator_stats')
        .select('creator_id, hours_watched_day, hours_watched_week, hours_watched_month, peak_viewers_day, avg_viewers_day, streams_count_day, creators!inner(platform)')
        .eq('recorded_at', todayStr)
        .in('creators.platform', ['twitch', 'kick'])
        .order('creator_id', { ascending: true })
        .limit(PAGE);
      if (cursor) q = q.gt('creator_id', cursor);
      return q;
    });
    rows.push(...data);
    if (data.length < PAGE) break;
    after = data[data.length - 1].creator_id;
  }
  console.log(`   ${rows.length.toLocaleString()} Twitch/Kick rows recorded today`);

  // --- 3. Write only what changed --------------------------------------------
  // UPDATE only, never insert: collectDailyStats.js owns row creation, and an
  // upsert here would create rows with NULL subscribers and corrupt charts.
  const writes = planWrites(rows, byCreator);

  if (DRY_RUN) {
    console.log(`\n🧪 Dry run: would write ${writes.length.toLocaleString()} of ${rows.length.toLocaleString()} rows. Sample (current -> new):`);
    for (const w of writes.filter((x) => x.fields.hours_watched_month > 0).slice(0, 8)) {
      const r = rows.find((x) => x.creator_id === w.creator_id);
      console.log(`   ${w.creator_id.slice(0, 8)} month ${r.hours_watched_month} -> ${w.fields.hours_watched_month}, week ${r.hours_watched_week} -> ${w.fields.hours_watched_week}, day ${r.hours_watched_day} -> ${w.fields.hours_watched_day}`);
    }
    console.log(`   ⏱️  ${((Date.now() - t0) / 1000).toFixed(0)}s total`);
    return;
  }

  let written = 0;
  let failed = 0;
  await pooled(writes, WRITE_CONCURRENCY, async (w) => {
    const { error } = await supabase
      .from('creator_stats')
      .update(w.fields)
      .eq('creator_id', w.creator_id)
      .eq('recorded_at', todayStr);
    if (error) { failed++; if (failed <= 5) console.error(`   ❌ ${w.creator_id}: ${error.message}`); }
    else written++;
  });

  const withHours = rows.filter((r) => (byCreator.get(r.creator_id)?.month.hours || 0) > 0).length;
  console.log(`\n📊 Wrote ${written.toLocaleString()} changed rows (${(rows.length - writes.length).toLocaleString()} already current), ${withHours.toLocaleString()} creators with 30-day hours`);
  console.log(`   ⚠️  ${excludedLowSample.toLocaleString()} sessions excluded for fewer than ${MIN_SAMPLES_FOR_AGGREGATE} viewer samples`);
  console.log(`   ⏱️  ${((Date.now() - t0) / 1000).toFixed(0)}s total`);
  if (failed) throw new Error(`${failed} creator_stats updates failed`);
}

// CLI entry (the workflow runs `node scripts/aggregateHoursWatched.js`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  aggregateHoursWatched().catch((err) => {
    console.error('❌ Aggregation failed:', err.message);
    process.exit(1);
  });
}
