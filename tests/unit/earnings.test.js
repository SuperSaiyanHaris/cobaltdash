import { describe, it, expect } from 'vitest';
import { kickSubEarnings, youtubeAdEarnings, formatMoney } from '../../src/lib/earnings.js';

describe('kickSubEarnings', () => {
  it('is subs x $4.99 x 95%', () => {
    const e = kickSubEarnings(1264);
    expect(e.perSub).toBeCloseTo(4.7405, 4);
    expect(Math.round(e.monthly)).toBe(5992);
    expect(Math.round(e.yearly)).toBe(71904);
  });
  it('treats missing or negative counts as zero', () => {
    expect(kickSubEarnings(null).monthly).toBe(0);
    expect(kickSubEarnings(-5).monthly).toBe(0);
  });
});

describe('youtubeAdEarnings', () => {
  it('is $2-$5 per 1,000 monthly views', () => {
    expect(youtubeAdEarnings(2_650_000_000)).toEqual({ low: 5_300_000, high: 13_250_000 });
    expect(youtubeAdEarnings(0)).toEqual({ low: 0, high: 0 });
  });
});

describe('formatMoney', () => {
  it('formats compactly', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(950)).toBe('$950');
    expect(formatMoney(5992)).toBe('$5,992');
    expect(formatMoney(84_120)).toBe('$84K');
    expect(formatMoney(13_250_000)).toBe('$13.3M');
  });
});
