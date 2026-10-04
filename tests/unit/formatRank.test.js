// Ranks and creator counts are shown exactly ("#2,213 of 28,512"), never
// abbreviated like a follower count ("#2.2K of 28.5K").
import { describe, it, expect } from 'vitest';
import { formatRank, formatNumber } from '../../src/lib/utils.js';

describe('formatRank', () => {
  it('shows exact numbers with thousands separators', () => {
    expect(formatRank(1)).toBe('1');
    expect(formatRank(2213)).toBe('2,213');
    expect(formatRank(28512)).toBe('28,512');
    expect(formatRank(1234567)).toBe('1,234,567');
  });

  it('shows a dash for a missing rank', () => {
    expect(formatRank(null)).toBe('-');
    expect(formatRank(undefined)).toBe('-');
    expect(formatRank(NaN)).toBe('-');
  });

  it('leaves follower counts abbreviated', () => {
    expect(formatNumber(28512)).toBe('28.5K');
  });
});
