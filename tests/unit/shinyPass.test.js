import { describe, it, expect } from 'vitest';
import {
  xpToNext, TOTAL_XP, totalXp, levelFromXp, tierForLevel, rollPack, PACKS, PACK_BY_LEVEL, voucherChance,
  RARITY_ORDER, streakBonus, TRACK, DROP_LEVELS, MAX_LEVEL,
  seasonForDate, seasonLastDay, seasonDaysLeft, badgeMeta, seasonMaxBadge,
} from '../../src/lib/shinyPass.js';
import { renderUserCard } from '../../src/lib/userCard.js';
import { renderPack, tearClip } from '../../src/lib/packArt.js';

// Seeded PRNG so pack rolls are reproducible.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('level curve', () => {
  it('is increasing and puts 99 about six months out at 150 XP a day (full seasons)', () => {
    for (let l = 1; l < MAX_LEVEL - 1; l++) expect(xpToNext(l + 1, 2)).toBeGreaterThan(xpToNext(l, 2));
    const days = totalXp(2)[MAX_LEVEL] / 150;
    expect(days).toBeGreaterThan(150);
    expect(days).toBeLessThan(210);
    // The first pack comes within about a week of daily use.
    expect(totalXp(2)[10] / 150).toBeLessThan(10);
  });

  it('makes the short launch season finishable before New Year', () => {
    // Season 1 runs Sep 27 to Dec 31, 2026 (96 days).
    const days = totalXp(1)[MAX_LEVEL] / 150;
    expect(days).toBeLessThan(90);
    expect(days).toBeGreaterThan(60);
    expect(xpToNext(40, 1)).toBeLessThan(xpToNext(40, 2));
  });

  it('maps XP to levels at the boundaries', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(TOTAL_XP[2] - 1).level).toBe(1);
    expect(levelFromXp(TOTAL_XP[2]).level).toBe(2);
    expect(levelFromXp(TOTAL_XP[50] + 5)).toMatchObject({ level: 50, into: 5, need: xpToNext(50) });
    expect(levelFromXp(TOTAL_XP[MAX_LEVEL] + 10_000)).toMatchObject({ level: 99, need: 0, pct: 1 });
    expect(levelFromXp(-5).level).toBe(1);
  });

  it('gives the card a rarity by level', () => {
    expect([1, 24, 25, 49, 50, 74, 75, 99].map(tierForLevel)).toEqual(['COMMON', 'COMMON', 'RARE', 'RARE', 'EPIC', 'EPIC', 'LEGENDARY', 'LEGENDARY']);
  });

  it('caps the streak bonus', () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(4)).toBe(15);
    expect(streakBonus(500)).toBe(50);
  });

  it('puts packs every 10 levels plus 99, and a reward on every level', () => {
    expect(PACKS.map((p) => p.level)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 99]);
    for (let l = 1; l <= MAX_LEVEL; l++) expect(TRACK[l]).toMatchObject({ level: l });
    for (const p of PACKS) expect(TRACK[p.level]).toMatchObject({ kind: 'pack', key: p.key });
    expect(TRACK[25]).toMatchObject({ kind: 'tier', key: 'RARE' });
    expect(TRACK[75]).toMatchObject({ kind: 'tier', key: 'LEGENDARY' });
    for (const l of DROP_LEVELS) expect(PACK_BY_LEVEL[l]).toBeUndefined();
  });

  it('never repeats a cosmetic within a season, and the last level is legendary', () => {
    const seen = new Set();
    for (const r of TRACK.slice(1)) {
      if (['pack', 'tier', 'boost', 'freeze'].includes(r.kind)) continue;
      const k = `${r.kind}:${r.key}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    expect(TRACK[99].rarity).toBe('legendary');
  });
});

describe('seasons', () => {
  it('follows the calendar year, with launch week in Season 1', () => {
    expect(seasonForDate('2026-09-27')).toBe(1);
    expect(seasonForDate('2026-12-31')).toBe(1);
    expect(seasonForDate('2027-01-01')).toBe(2);
    expect(seasonForDate('2027-12-31')).toBe(2);
    expect(seasonForDate('2029-03-15')).toBe(4);
    expect(seasonLastDay(1)).toBe('2026-12-31');
    expect(seasonLastDay(2)).toBe('2027-12-31');
    expect(seasonDaysLeft(1, '2026-09-27')).toBe(96);
    expect(seasonDaysLeft(1, '2026-12-31')).toBe(1);
    expect(seasonDaysLeft(2, '2027-01-01')).toBe(365);
  });

  it('names a max badge for every season', () => {
    expect(badgeMeta(seasonMaxBadge(3)).name).toBe('Season 3 Max');
    expect(badgeMeta('og2026').name).toBe('OG 2026');
    expect(badgeMeta('nope')).toBeNull();
  });
});

describe('packs', () => {
  it('always has the right size, the signature frame, and the rarest item last', () => {
    for (const pack of PACKS) {
      for (let seed = 1; seed <= 200; seed++) {
        const items = rollPack(pack.level, mulberry(seed));
        expect(items).toHaveLength(pack.items);
        expect(items.some((i) => i.kind === 'frame' && i.key === pack.key)).toBe(true);
        const ranks = items.map((i) => RARITY_ORDER.indexOf(i.rarity));
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        for (const it of items.filter((i) => i.kind === 'xp')) {
          expect(it.amount).toBeGreaterThanOrEqual(Math.round(xpToNext(pack.level) * 0.25));
          expect(it.amount).toBeLessThanOrEqual(Math.round(xpToNext(pack.level) * 0.6));
        }
      }
    }
  });

  it('guarantees a listing voucher at 50 and 99', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(rollPack(50, mulberry(seed)).some((i) => i.kind === 'voucher')).toBe(true);
      expect(rollPack(99, mulberry(seed)).some((i) => i.kind === 'voucher')).toBe(true);
    }
  });

  it('hits the voucher odds the owner set (5%, 10% from 60)', () => {
    expect(voucherChance(10)).toBe(0.05);
    expect(voucherChance(40)).toBe(0.05);
    expect(voucherChance(60)).toBe(0.10);
    expect(voucherChance(90)).toBe(0.10);
    const rnd = mulberry(7);
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (rollPack(20, rnd).some((x) => x.kind === 'voucher')) hits++;
    expect(hits / n).toBeGreaterThan(0.04);
    expect(hits / n).toBeLessThan(0.06);
  });
});

describe('art', () => {
  it('escapes the handle and rejects unsafe avatar URLs on the user card', () => {
    const svg = renderUserCard({ handle: '<script>x', avatar: 'javascript:alert(1)', level: 12, into: 5, need: 100, xp: 900, streak: 3, uid: 't' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('javascript:');
    expect(svg).toContain('LV 12');
    const withAvatar = renderUserCard({ handle: 'a', avatar: 'https://example.com/a.png', level: 1, uid: 'u' });
    expect(withAvatar).toContain('href="https://example.com/a.png"');
  });

  it('renders every pack and splits it along the tear line', () => {
    for (const p of PACKS) {
      const svg = renderPack(p, { uid: p.key });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`LV ${p.level} PACK`);
    }
    expect(tearClip('top')).toMatch(/^polygon\(0 0, 100% 0,/);
    expect(tearClip('body')).toMatch(/100% 100%, 0 100%\)$/);
  });

  it('keeps em dashes out of the art', () => {
    const all = PACKS.map((p) => renderPack(p)).join('') + renderUserCard({ handle: 'x', level: 99, uid: 'z' });
    expect(all).not.toMatch(/[—–]/);
  });
});
