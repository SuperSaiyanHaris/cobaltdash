import { describe, it, expect } from 'vitest';
import { findNextMilestone } from '../../src/components/profile/verdictHelpers.jsx';

const NOW = new Date('2026-09-24T12:00:00Z');

describe('findNextMilestone', () => {
  it('finds the next 1-9 x 10^n round number and its date', () => {
    const m = findNextMilestone(1264, 23, NOW);
    expect(m.milestone).toBe(2000);
    expect(m.days).toBe(Math.ceil((2000 - 1264) / 23));
    expect(m.date.toISOString().slice(0, 10)).toBe('2026-10-26');
  });

  it('steps up a decade at the boundary', () => {
    expect(findNextMilestone(9_500_000, 1000, NOW).milestone).toBe(10_000_000);
    expect(findNextMilestone(518_000_000, 133_333, NOW).milestone).toBe(600_000_000);
  });

  it('never projects without growth', () => {
    expect(findNextMilestone(1000, 0, NOW)).toBeNull();
    expect(findNextMilestone(1000, -5, NOW)).toBeNull();
    expect(findNextMilestone(0, 10, NOW)).toBeNull();
  });
});
