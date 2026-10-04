// Shared story-card helpers used by the Blog page and the profile News tab.
import { describe, it, expect } from 'vitest';
import { getCatColors, isNewPost, formatPostDate } from '../../src/lib/blogUi.js';

describe('blogUi', () => {
  it('formats a bare date without rolling it back a day', () => {
    expect(formatPostDate('2026-10-04')).toBe('Oct 4, 2026');
    expect(formatPostDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('has a default color for an unknown category', () => {
    expect(getCatColors('Streaming').pill).toContain('neutral');
    expect(getCatColors('Rankings').pill).toContain('amber');
  });

  it('marks only the last week as new', () => {
    const now = new Date();
    const day = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
    expect(isNewPost(day(1))).toBe(true);
    expect(isNewPost(day(30))).toBe(false);
    expect(isNewPost(null)).toBe(false);
  });
});
