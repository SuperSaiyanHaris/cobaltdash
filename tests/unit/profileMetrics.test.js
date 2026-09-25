import { describe, it, expect } from 'vitest';
import { computeProfileMetrics } from '../../src/lib/profileMetrics.js';
import { buildYouTubeSeries } from '../../src/components/profile/verdictHelpers.jsx';

const NOW = new Date('2026-09-24T15:00:00Z');
const day = (n) => new Date(NOW.getTime() - n * 864e5).toISOString().slice(0, 10);

// Daily readings for the last `days` days, +100/day, optionally skipping some.
function history(days, { skip = [], start = 1_000_000, perDay = 100 } = {}) {
  const rows = [];
  for (let i = days; i >= 0; i--) {
    if (skip.includes(i)) continue;
    rows.push({ recorded_at: day(i), subscribers: start + (days - i) * perDay, total_views: 5_000_000 + (days - i) * 1000, total_posts: 10 });
  }
  return rows;
}

describe('computeProfileMetrics', () => {
  it('needs at least two readings', () => {
    expect(computeProfileMetrics([], NOW)).toBeNull();
    expect(computeProfileMetrics(history(0), NOW)).toBeNull();
  });

  it('30-day change always equals the chart net, even with missing days', () => {
    // A missing day inside the window used to push the card's baseline a day
    // earlier than the chart's (the -5.6K card vs -5.4K chart bug).
    const stats = history(60, { skip: [5, 12] });
    const m = computeProfileMetrics(stats, NOW);
    const series = buildYouTubeSeries(stats, 30, NOW);
    const chartNet = series.at(-1).subscribers - series[0].subscribers;
    expect(m.last30Days.subs).toBe(chartNet);
  });

  it('averages over calendar days, not row count', () => {
    const m = computeProfileMetrics(history(60, { skip: [3, 4, 5] }), NOW);
    expect(m.dailyAverage.subs).toBe(100);
  });

  it('falls back to older readings when collection has stalled', () => {
    const stalled = history(90).filter((r) => r.recorded_at < day(40));
    const m = computeProfileMetrics(stalled, NOW);
    expect(m.last30Days.subs).toBeGreaterThan(0);
    expect(m.daysSinceLastUpdate).toBeGreaterThanOrEqual(40);
  });

  it('reports losses as negative growth', () => {
    const m = computeProfileMetrics(history(40, { perDay: -50 }), NOW);
    expect(m.last30Days.subs).toBeLessThan(0);
    expect(m.growthRates.thirtyDay).toBeLessThan(0);
  });
});
