import { describe, it, expect } from 'vitest';
import { buildDailyReadings, markMissingViews } from '../../src/components/profile/verdictHelpers.jsx';

const row = (date, views, videos = 100) => ({ date, views, videos, subscribers: 1 });
const kinds = (rows) => rows.map((r) => r.kind);

describe('buildDailyReadings', () => {
  // CoComelon, Aug 31 to Sep 3 2026: YouTube held the total for two days.
  const coco = [
    row('2026-08-31', 226_580_000_000),
    row('2026-09-01', 226_580_000_000),
    row('2026-09-02', 226_580_000_000),
    row('2026-09-03', 226_731_200_000),
    row('2026-09-04', 226_780_000_000),
  ];

  it('marks held days as lag and the jump as a 3-day catch-up', () => {
    const r = buildDailyReadings(coco);
    expect(kinds(r)).toEqual(['first', 'lag', 'lag', 'catchup', 'normal']);
    expect(r[3].delta).toBe(151_200_000);
    expect(r[3].days).toBe(3);
  });

  it('spreads revenue views evenly and keeps the total exact', () => {
    const r = buildDailyReadings(coco);
    const spread = r.slice(1, 4).map((x) => x.revenueViews);
    expect(spread.every((v) => Math.abs(v - 50_400_000) < 1)).toBe(true);
    expect(spread.reduce((a, b) => a + b, 0)).toBeCloseTo(151_200_000, 0);
    expect(r.slice(1, 4).every((x) => x.approx)).toBe(true);
    expect(r[4].approx).toBe(false);
  });

  it('shows trailing held days as pending on an active channel', () => {
    const r = buildDailyReadings([...coco, row('2026-09-05', 226_780_000_000)]);
    expect(r[5].kind).toBe('pending');
  });

  it('keeps +0 on a quiet channel instead of calling it lag or pending', () => {
    const r = buildDailyReadings([row('2026-09-01', 500), row('2026-09-02', 500), row('2026-09-03', 500)]);
    expect(kinds(r)).toEqual(['first', 'flat', 'flat']);
  });

  it('shows drops as drops, never as lag', () => {
    const r = buildDailyReadings([row('2026-09-01', 1000), row('2026-09-02', 1000), row('2026-09-03', 900)]);
    expect(kinds(r)).toEqual(['first', 'flat', 'normal']);
    expect(r[2].delta).toBe(-100);
    expect(r[2].revenueViews).toBe(null);
  });

  it('treats a stored 0 on a channel with videos as a missing reading (yu-gg, Sep 23)', () => {
    const series = markMissingViews([row('2026-09-16', 7_476_467), row('2026-09-23', 0, 285), row('2026-09-24', 7_502_001)]);
    const r = buildDailyReadings(series);
    expect(kinds(r)).toEqual(['first', 'missing', 'normal']);
    expect(r[2].delta).toBe(25_534);
    expect(r[2].days).toBe(8);
  });

  it('keeps a 0 total on a channel with no videos', () => {
    expect(markMissingViews([row('2026-09-01', 0, 0)])[0].views).toBe(0);
  });
});
