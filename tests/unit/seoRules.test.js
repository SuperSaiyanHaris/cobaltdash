import { describe, it, expect } from 'vitest';
import { isThinProfile, pickCreatorRow, TOP_TIER_RANK_LIMIT } from '../../src/lib/seoRules.js';

describe('isThinProfile', () => {
  it('indexes a platform top-500 creator however small the count (Kick paid subs)', () => {
    expect(isThinProfile({ count: 1264, subsRank: 78 })).toBe(false);
    expect(isThinProfile({ count: 217, subsRank: TOP_TIER_RANK_LIMIT })).toBe(false);
  });
  it('indexes anyone at 50K+', () => {
    expect(isThinProfile({ count: 50_000, subsRank: 20_000 })).toBe(false);
    expect(isThinProfile({ count: 21_000_000, subsRank: null })).toBe(false);
  });
  it('noindexes small creators outside the top tier', () => {
    expect(isThinProfile({ count: 19_995, subsRank: 15_641 })).toBe(true);
    expect(isThinProfile({ count: 49_999, subsRank: null })).toBe(true);
  });
  it('noindexes pages with no data', () => {
    expect(isThinProfile({ count: null, subsRank: 1 })).toBe(true);
  });
});

describe('pickCreatorRow', () => {
  const row = (id, subs) => ({ id, creator_stats: subs === null ? [] : [{ subscribers: subs }] });
  it('returns the single match', () => {
    expect(pickCreatorRow([row('a', 5)]).id).toBe('a');
  });
  it('picks the real channel over a copycat (10x rule)', () => {
    expect(pickCreatorRow([row('fan', 12_000), row('mrbeast', 518_000_000)]).id).toBe('mrbeast');
  });
  it('refuses to guess between close matches', () => {
    expect(pickCreatorRow([row('a', 100_000), row('b', 40_000)])).toBeNull();
    expect(pickCreatorRow([row('a', null), row('b', null)])).toBeNull();
  });
  it('handles no rows', () => {
    expect(pickCreatorRow([])).toBeNull();
    expect(pickCreatorRow(null)).toBeNull();
  });
});
