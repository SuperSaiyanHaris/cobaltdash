import { describe, it, expect, vi, afterEach } from 'vitest';
import { todayNY } from '../../api/_xp.js';

// Streaks compare calendar days in New York. Subtracting 24 hours from "now"
// used to land on the wrong day in the hours around a DST change.
describe('todayNY offsets across DST', () => {
  afterEach(() => vi.useRealTimers());

  it('spring forward: 00:30 on the Monday after the change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T04:30:00Z')); // 00:30 EDT
    expect(todayNY()).toBe('2026-03-09');
    expect(todayNY(-1)).toBe('2026-03-08');
    expect(todayNY(-2)).toBe('2026-03-07');
  });

  it('fall back: 23:30 on the day of the change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T04:30:00Z')); // 23:30 EST on Nov 1
    expect(todayNY()).toBe('2026-11-01');
    expect(todayNY(-1)).toBe('2026-10-31');
  });

  it('crosses month and year ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T15:00:00Z'));
    expect(todayNY(-1)).toBe('2026-12-31');
  });
});
