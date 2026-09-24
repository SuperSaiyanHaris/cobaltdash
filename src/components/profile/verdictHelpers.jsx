import { formatNumber } from '../../lib/utils';

// Next round-number milestone (1-9 x 10^n) above `current` and when it lands
// at `dailyGrowth` per day. Null when there's no growth to project. Cheap
// (at most 27 iterations), so callers compute it inline rather than memoizing.
export function findNextMilestone(current, dailyGrowth) {
  if (!dailyGrowth || dailyGrowth <= 0 || !current) return null;
  const startPow = Math.floor(Math.log10(Math.max(current, 1)));
  for (let pow = startPow; pow < startPow + 3; pow++) {
    const decade = Math.pow(10, pow);
    for (let digit = 1; digit <= 9; digit++) {
      const m = digit * decade;
      if (m > current) {
        const days = Math.ceil((m - current) / dailyGrowth);
        const date = new Date();
        date.setDate(date.getDate() + days);
        return { milestone: m, days, date };
      }
    }
  }
  return null;
}

export function fmtSigned(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + formatNumber(n);
}

// Milestone targets are always round numbers in the 1-9 x 10^n sequence
// (200B, 7M, etc). formatNumber() always shows 1-2 decimals, which turns a
// round number into "200.00B" — this drops the trailing zeros for exact
// milestones while still using formatNumber's real rounding elsewhere.
export function fmtMilestone(n) {
  const s = formatNumber(n);
  return s.replace(/\.0+([BMK])$/, '$1');
}

// Bare 30-day view/subscriber deltas, safe wherever GrowthChart's own
// filteredData logic already lives — kept separate (not exported) so a
// change here can't affect the other 8 platforms' still-unmodified chart.
export function buildYouTubeSeries(statsHistory, rangeDays) {
  const sorted = [...statsHistory].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  const cutoff = rangeDays >= 9999 ? null : (() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d;
  })();
  const filtered = cutoff ? sorted.filter((s) => new Date(s.recorded_at) >= cutoff) : sorted;
  return filtered.map((s) => ({
    date: s.recorded_at,
    views: s.total_views || 0,
    subscribers: s.subscribers || s.followers || 0,
    videos: s.total_posts || 0,
    label: new Date(s.recorded_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
}

// Real prior-30-days-vs-current-30-days views comparison, computed from raw
// history rather than asserted — returns null (not a guess) when there isn't
// enough history to compute it honestly.
export function computeViewsMomentum(statsHistory) {
  const sorted = [...statsHistory].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  if (sorted.length < 45) return null; // need real signal on both sides of the comparison
  const latest = sorted[0];
  const day30 = sorted[Math.min(29, sorted.length - 1)];
  const day60 = sorted[Math.min(59, sorted.length - 1)];
  if (sorted.length < 60) return null;
  const current = latest.total_views - day30.total_views;
  const prior = day30.total_views - day60.total_views;
  if (!prior || prior <= 0) return null;
  return { current, prior, pct: ((current - prior) / prior) * 100 };
}

// Shown in place of the growth chart when there aren't yet 2+ daily readings
// to draw a trend line from. Framed around when tracking started, not as a
// vague "not enough history" — a brand-new creator reads that as "are you
// even tracking me?" rather than "check back in a few days."
export function renderNoHistoryMessage(creator) {
  const dateStr = creator?.dbCreatedAt
    ? new Date(creator.dbCreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-neutral-500 text-center px-6 gap-1">
      <span>{dateStr ? `Added to tracking on ${dateStr}.` : 'Just added to tracking.'}</span>
      <span>A trend line will appear once a few more daily readings come in.</span>
    </div>
  );
}


export function formatEarningsSingle(n) {
  if (!n || n < 0) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}


export function formatHoursWatched(hours) {
  if (!hours || hours === 0) return '0';
  if (hours >= 1000000) return `${(hours / 1000000).toFixed(1)}M`;
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}K`;
  return Math.round(hours).toLocaleString();
}

// Bands the raw rank/total ratio into human round numbers instead of a
// precise-looking decimal ("top 0.69%") that reads as fake precision.
export function getPercentileBand(rank, total) {
  if (!rank || !total) return null;
  const pct = (rank / total) * 100;
  if (pct <= 1) return 1;
  if (pct <= 5) return 5;
  if (pct <= 10) return 10;
  if (pct <= 25) return 25;
  if (pct <= 50) return 50;
  return null; // below median isn't a flattering stat to surface
}
