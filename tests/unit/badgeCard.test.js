import { describe, it, expect } from 'vitest';
import { renderCard, cardTier, compactCount, TIERS, CARD_PLATFORMS, MARK_HEIGHT } from '../../src/lib/badgeCard.js';

const base = { platform: 'twitch', name: 'KaiCenat', username: 'kaicenat', count: 21_772_129, delta30: 74_298, rank: 1, total: 28_504, avatar: null };

describe('cardTier (rarity from real rank)', () => {
  it('Legendary for the top 10 or top 0.1%', () => {
    expect(cardTier(1, 28_504)).toBe(TIERS.LEGENDARY);
    expect(cardTier(10, 100)).toBe(TIERS.LEGENDARY);
    expect(cardTier(28, 28_504)).toBe(TIERS.LEGENDARY);
  });
  it('Epic top 1%, Rare top 10%, Common after', () => {
    expect(cardTier(251, 28_504)).toBe(TIERS.EPIC);
    expect(cardTier(78, 3_621)).toBe(TIERS.RARE);
    expect(cardTier(15_641, 28_504)).toBe(TIERS.COMMON);
  });
  it('unranked is Common', () => {
    expect(cardTier(null, 100)).toBe(TIERS.COMMON);
    expect(cardTier(5, null)).toBe(TIERS.COMMON);
  });
});

describe('renderCard', () => {
  it('shows the count, rarity, card number and 30-day change', () => {
    const svg = renderCard(base);
    expect(svg).toContain('>21.77M<');
    expect(svg).toContain('>LEGENDARY<');
    expect(svg).toContain('001/28504 · SHINYPULL');
    expect(svg).toContain('▲ +74.3K');
  });

  it('escapes creator-controlled text', () => {
    const svg = renderCard({ ...base, name: '<script>x</script>', username: 'a"onload="b' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('"onload="');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('only embeds real image data URIs, else draws initials', () => {
    const ok = renderCard({ ...base, avatar: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(ok).toContain('href="data:image/png;base64,iVBORw0KGgo="');
    for (const bad of ['https://evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,abc"><script>']) {
      const svg = renderCard({ ...base, avatar: bad });
      expect(svg).not.toContain('<image');
      expect(svg).toContain('>K<');
    }
  });

  it('handles losses, missing data and every platform', () => {
    expect(renderCard({ ...base, delta30: -500 })).toContain('▼ −500');
    const empty = renderCard({ ...base, count: null, delta30: null, rank: null, total: null });
    expect(empty).toContain('UNRANKED');
    expect(empty).toContain('>—<');
    for (const p of Object.keys(CARD_PLATFORMS)) {
      expect(renderCard({ ...base, platform: p })).toMatch(/^<svg[\s\S]*<\/svg>$/);
    }
  });

  it('can leave out the platform logo (for rotated/faded placements)', () => {
    expect(renderCard({ ...base, showMark: false })).not.toContain('data-mark=');
    expect(renderCard(base)).toContain('data-mark="twitch"');
  });

  it('truncates very long names', () => {
    expect(renderCard({ ...base, name: 'A'.repeat(60) })).toContain('A'.repeat(19) + '…');
  });
});

describe('compactCount', () => {
  it('formats like the site', () => {
    expect(compactCount(1263)).toBe('1,263');
    expect(compactCount(20_000)).toBe('20K');
    expect(compactCount(1_684_784)).toBe('1.68M');
    expect(compactCount(518_000_000)).toBe('518M');
  });
});

describe('platform logos follow brand guidelines', () => {
  const card = (platform) => renderCard({ ...base, platform });
  it('uses the official colors, never a tint', () => {
    expect(card('youtube')).toContain('fill="#FF0000"');
    expect(card('twitch')).toContain('fill="#9146FF"');
    expect(card('kick')).toContain('fill="#53FC19"');
    expect(card('mastodon')).toContain('fill="#6364FF"');
    expect(card('tiktok')).toMatch(/<image href="data:image\/png;base64,/);
  });
  it('renders the mark at least 22px tall (YouTube requires >= 20dp)', () => {
    expect(MARK_HEIGHT).toBeGreaterThanOrEqual(22);
    const scale = Number(card('youtube').match(/data-mark="youtube">[\s\S]*?scale\(([\d.]+)\)/)[1]);
    expect(20 * scale).toBeGreaterThanOrEqual(22 - 0.01);
  });
  it('draws the mark after the shine so nothing ever covers it', () => {
    const svg = card('youtube');
    expect(svg.indexOf('data-mark="youtube"')).toBeGreaterThan(svg.indexOf('shine)'));
  });
});
