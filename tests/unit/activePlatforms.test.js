import { describe, it, expect } from 'vitest';
import { PLATFORM_IDS, PLATFORM_DISPLAY_NAMES, isActivePlatform } from '../../src/lib/constants';
import { CARD_PLATFORMS } from '../../src/lib/badgeCard';

// Rumble was dropped on 2026-09-04 but kept resurfacing (a Rumble card on the
// home hero) because stray lists still carried it. These pin the rule that a
// platform missing from PLATFORM_IDS can't show up anywhere.
const REMOVED = ['rumble'];

describe('active platforms', () => {
  it('only lists supported platforms', () => {
    for (const p of REMOVED) {
      expect(PLATFORM_IDS).not.toContain(p);
      expect(isActivePlatform(p)).toBe(false);
      expect(PLATFORM_DISPLAY_NAMES).not.toHaveProperty(p);
    }
    for (const p of PLATFORM_IDS) expect(isActivePlatform(p)).toBe(true);
  });

  it('never draws a card for an unsupported platform', () => {
    for (const p of Object.keys(CARD_PLATFORMS)) expect(isActivePlatform(p)).toBe(true);
  });

  it('rejects junk', () => {
    for (const p of [undefined, null, '', 'YouTube', 'rankings', '__proto__']) expect(isActivePlatform(p)).toBe(false);
  });
});
