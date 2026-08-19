/**
 * Aggregate Hours Watched
 *
 * This script aggregates stream session data into daily/weekly/monthly
 * hours watched metrics for each Twitch and Kick creator.
 *
 * Should run daily after the stats collection job.
 *
 * SAMPLE-QUALITY GATE (added 2026-07-27). hours_watched for a session is
 * avg_viewers * duration, and avg_viewers is only as good as how many viewer
 * samples went into it. A session finalised from 1-2 samples isn't really an
 * average, it's one or two point-in-time readings multiplied across the
 * whole session, which can be wildly off if viewership moved during the gap.
 * Checked against the current stream monitor cadence (still throttled by
 * GitHub Actions despite the 2026-07-26 poller rewrite): over 30K sessions in
 * the last 7 days alone had 1-2 samples.
 *
 * MIN_SAMPLES_FOR_AGGREGATE excludes sessions below that bar from the
 * hours_watched_day/week/month numbers actually shown on the site. This does
 * NOT touch stream_sessions.hours_watched itself, that stays as computed for
 * anyone auditing raw data, and does not delete or zero out anything. It only
 * changes what feeds the aggregate: an honest undercount from well-sampled
 * streams only, instead of a falsely precise-looking number built partly from
 * single-sample guesses. Same principle CLAUDE.md already applies to
 * followers: when in doubt, don't write a shaky number as if it were solid.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) { console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run without it.'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Minimum viewer_samples a finalised session needs before its hours_watched
// counts toward the aggregate. 1 sample is a single point-in-time reading
// multiplied across the whole session, not a real average; 2 is still thin
// but at least reflects a start and an end reading rather than one guess.
const MIN_SAMPLES_FOR_AGGREGATE = 2;

/**
 * Splits sessions into ones that clear MIN_SAMPLES_FOR_AGGREGATE and ones that
 * don't. Sessions with sample_count === null are pre-backfill legacy rows;
 * excluded rather than assumed reliable.
 */
function filterBySampleQuality(sessions) {
  const included = [];
  const excluded = [];
  for (const s of sessions || []) {
    if (typeof s.sample_count === 'number' && s.sample_count >= MIN_SAMPLES_FOR_AGGREGATE) {
      included.push(s);
    } else {
      excluded.push(s);
    }
  }
  return { included, excluded };
}

/**
 * Get today's date in America/New_York timezone (YYYY-MM-DD format)
 */
function getTodayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function aggregateHoursWatched() {
  console.log('📊 Aggregating hours watched metrics...');
  console.log(`   Time: ${new Date().toISOString()}\n`);

  const today = new Date();
  const todayStr = getTodayLocal();
  
  // For daily snapshot: get streams that ended TODAY
  const todayStart = new Date(todayStr + 'T00:00:00');
  const todayEnd = new Date(todayStr + 'T23:59:59');

  // Calculate date ranges for rolling windows
  const dayAgo = new Date(today);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  // Get all Twitch + Kick creators — the two platforms with stream_sessions-
  // based hours-watched tracking. Same paginated pattern as
  // collectDailyStats.js / monitorTwitchStreams.js — an un-paginated
  // .select() silently truncates to Supabase's default 1000-row PostgREST
  // cap, which meant most of the 20K+ Twitch roster (including creators
  // monitorTwitchStreams.js *did* capture stream_sessions for) never got
  // those sessions aggregated into creator_stats, leaving hours_watched_*
  // permanently null for them. Verified 2026-07-22: manual run against
  // production backfilled real hours_watched_* data for 869 previously-null
  // creators in one pass.
  //
  // Kick added 2026-08-18: monitorKickStreams.js has computed real
  // per-session hours_watched via the same finalize_stream_sessions RPC
  // since 2026-07-26, but this script only ever looped Twitch, so every Kick
  // creator's hours_watched_* stayed null even though the session-level math
  // was already correct and just sitting unused (98.6% of recent Kick
  // sessions had a real computed hours_watched at the time this was found).
  // The aggregation logic below is keyed entirely on creator_id, not
  // platform, so widening this one query to include Kick is the whole fix.
  let creators = [];
  {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from('creators')
        .select('id, username, display_name, platform')
        .in('platform', ['twitch', 'kick'])
        .order('id')
        .range(from, from + pageSize - 1);
      creators = creators.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  // Narrow to creators who actually have at least one stream_sessions row
  // ever. The vast majority of the 20K+ Twitch roster has none (they're
  // rarely-if-ever caught live by the 5-minute poll) and would always
  // aggregate to all-zero anyway — running 4 rolling-window queries per
  // creator against the full roster would multiply this script's runtime by
  // ~20x for work that's guaranteed to produce nothing. A creator who
  // streamed before but hasn't recently still has session rows (even if
  // none fall in the current windows), so this intersection still lets
  // their stale hours_watched_* correctly decay to 0 as time passes — it
  // only skips creators who have truly never had a session recorded.
  const sessionCreatorIds = new Set();
  {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from('stream_sessions')
        .select('creator_id')
        .order('creator_id')
        .range(from, from + pageSize - 1);
      (data || []).forEach((row) => sessionCreatorIds.add(row.creator_id));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }
  creators = creators.filter((c) => sessionCreatorIds.has(c.id));

  const countsByPlatform = creators.reduce((acc, c) => {
    acc[c.platform] = (acc[c.platform] || 0) + 1;
    return acc;
  }, {});
  const platformSummary = Object.entries(countsByPlatform)
    .map(([p, n]) => `${n} ${p}`)
    .join(', ');
  console.log(`Processing ${creators.length} creators with session history (${platformSummary})...\n`);

  let updatedCount = 0;
  let excludedLowSampleTotal = 0;

  for (const creator of creators) {
    // Get streams that ended TODAY (for daily snapshot)
    const { data: todaySessionsRaw } = await supabase
      .from('stream_sessions')
      .select('hours_watched, peak_viewers, avg_viewers, sample_count')
      .eq('creator_id', creator.id)
      .gte('ended_at', todayStart.toISOString())
      .lte('ended_at', todayEnd.toISOString())
      .not('ended_at', 'is', null);

    // Get completed stream sessions for different time periods (rolling windows)
    const { data: daySessionsRaw } = await supabase
      .from('stream_sessions')
      .select('hours_watched, peak_viewers, avg_viewers, sample_count')
      .eq('creator_id', creator.id)
      .gte('ended_at', dayAgo.toISOString())
      .not('ended_at', 'is', null);

    const { data: weekSessionsRaw } = await supabase
      .from('stream_sessions')
      .select('hours_watched, peak_viewers, avg_viewers, sample_count')
      .eq('creator_id', creator.id)
      .gte('ended_at', weekAgo.toISOString())
      .not('ended_at', 'is', null);

    const { data: monthSessionsRaw } = await supabase
      .from('stream_sessions')
      .select('hours_watched, peak_viewers, avg_viewers, sample_count')
      .eq('creator_id', creator.id)
      .gte('ended_at', monthAgo.toISOString())
      .not('ended_at', 'is', null);

    // Quality gate: only well-sampled sessions feed the numbers shown on the
    // site. See MIN_SAMPLES_FOR_AGGREGATE comment at the top of this file.
    const today = filterBySampleQuality(todaySessionsRaw);
    const day = filterBySampleQuality(daySessionsRaw);
    const week = filterBySampleQuality(weekSessionsRaw);
    const month = filterBySampleQuality(monthSessionsRaw);
    excludedLowSampleTotal += month.excluded.length;

    // Calculate aggregates
    const todayStats = aggregateSessions(today.included);
    const dayStats = aggregateSessions(day.included);
    const weekStats = aggregateSessions(week.included);
    const monthStats = aggregateSessions(month.included);

    // UPDATE only — never insert. collectDailyStats.js is responsible for
    // creating the row with correct subscriber data. If we used upsert here,
    // we'd create rows with NULL subscribers on days where collectDailyStats
    // hasn't run yet, corrupting the historical chart.
    const { error } = await supabase
      .from('creator_stats')
      .update({
        hours_watched_day: todayStats.hoursWatched, // Hours from streams that ended TODAY
        hours_watched_week: weekStats.hoursWatched,
        hours_watched_month: monthStats.hoursWatched,
        peak_viewers_day: todayStats.peakViewers,
        avg_viewers_day: todayStats.avgViewers,
        streams_count_day: todayStats.streamCount,
      })
      .eq('creator_id', creator.id)
      .eq('recorded_at', todayStr);

    if (error) {
      console.log(`   ❌ ${creator.display_name}: ${error.message}`);
    } else if (monthStats.hoursWatched > 0) {
      console.log(`   ✅ ${creator.display_name}: Today: ${todayStats.hoursWatched.toFixed(0)}h, 30d: ${monthStats.hoursWatched.toFixed(0)}h`);
      updatedCount++;
    }
  }

  console.log(`\n📊 Updated ${updatedCount} creators with hours watched data`);
  console.log(`   ⚠️  ${excludedLowSampleTotal} sessions (within the 30-day window) excluded for having fewer than ${MIN_SAMPLES_FOR_AGGREGATE} viewer samples`);
}

function aggregateSessions(sessions) {
  if (sessions.length === 0) {
    return {
      hoursWatched: 0,
      peakViewers: 0,
      avgViewers: 0,
      streamCount: 0,
    };
  }

  const hoursWatched = sessions.reduce((sum, s) => sum + (parseFloat(s.hours_watched) || 0), 0);
  const peakViewers = Math.max(...sessions.map(s => s.peak_viewers || 0));
  const totalAvgViewers = sessions.reduce((sum, s) => sum + (s.avg_viewers || 0), 0);
  const avgViewers = Math.round(totalAvgViewers / sessions.length);

  return {
    hoursWatched,
    peakViewers,
    avgViewers,
    streamCount: sessions.length,
  };
}

aggregateHoursWatched().catch(console.error);
