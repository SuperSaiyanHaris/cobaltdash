import { describe, it, expect } from 'vitest';
import { zonedMidnight, bucketSession, planWrites } from '../../scripts/aggregateHoursWatched.js';

describe('zonedMidnight (ET "today")', () => {
  it('is 04:00 UTC during daylight time', () => {
    expect(zonedMidnight('2026-09-24', 'America/New_York').toISOString()).toBe('2026-09-24T04:00:00.000Z');
  });
  it('is 05:00 UTC during standard time', () => {
    expect(zonedMidnight('2026-12-01', 'America/New_York').toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });
});

describe('bucketSession + planWrites', () => {
  const todayStart = new Date('2026-09-24T04:00:00Z');
  const weekAgo = new Date('2026-09-17T15:00:00Z');
  const s = (creator_id, ended_at, hours, samples = 5, peak = 100, avg = 50) =>
    ({ creator_id, ended_at, hours_watched: hours, peak_viewers: peak, avg_viewers: avg, sample_count: samples });

  it('puts sessions in the right windows and skips thinly sampled ones', () => {
    const by = new Map();
    expect(bucketSession(by, s('a', '2026-09-24T10:00:00Z', 10, 5, 300, 200), { todayStart, weekAgo })).toBe(true);
    expect(bucketSession(by, s('a', '2026-09-24T02:00:00Z', 20), { todayStart, weekAgo })).toBe(true); // ET yesterday evening
    expect(bucketSession(by, s('a', '2026-09-01T10:00:00Z', 30), { todayStart, weekAgo })).toBe(true);
    expect(bucketSession(by, s('a', '2026-09-24T11:00:00Z', 999, 1), { todayStart, weekAgo })).toBe(false);
    const a = by.get('a');
    expect(a.today.hours).toBe(10);
    expect(a.week.hours).toBe(30);
    expect(a.month.hours).toBe(60);
    expect(a.today.peak).toBe(300);
  });

  it('writes only rows that changed, and zeroes creators with no sessions', () => {
    const by = new Map();
    bucketSession(by, s('a', '2026-09-24T10:00:00Z', 10), { todayStart, weekAgo });
    const current = { hours_watched_day: 10, hours_watched_week: 10, hours_watched_month: 10, peak_viewers_day: 100, avg_viewers_day: 50, streams_count_day: 1 };
    const rows = [
      { creator_id: 'a', ...current },                                            // unchanged
      { creator_id: 'b', ...current },                                            // no sessions -> decay to 0
      { creator_id: 'c', hours_watched_day: null, hours_watched_week: null, hours_watched_month: null, peak_viewers_day: null, avg_viewers_day: null, streams_count_day: null }, // fresh day row
    ];
    const writes = planWrites(rows, by);
    expect(writes.map((w) => w.creator_id)).toEqual(['b', 'c']);
    expect(writes[0].fields.hours_watched_month).toBe(0);
  });
});
