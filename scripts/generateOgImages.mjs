/**
 * Generates the static link previews in public/og/ (one per page type).
 * Run: node scripts/generateOgImages.mjs   (also runs in `npm run build`)
 *
 * Each preview is the site's dark band with a headline on the left and a hand
 * of live creator cards on the right (the platform #1s, this week's movers,
 * the newest milestones...), drawn by api/_shareCard.js, the same renderer as
 * the per-creator previews (/og/card/:platform/:username.jpg).
 *
 * Cards are loaded from the database at build time, so the numbers on them
 * refresh with every deploy. If a page's cards can't be loaded (no env, a
 * timeout), that page keeps its committed image rather than failing the build
 * or shipping a half-empty card.
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { loadCardData, restGet, platformTotal } from '../src/lib/cardData.js';
import { rarityBands } from '../src/lib/badgeCard.js';
import { renderPageShare } from '../api/_shareCard.js';

const OUT = 'public/og';

async function byRank(platform, rank, rankType = 'subscribers') {
  const rows = await restGet(`rankings_cache?platform=eq.${platform}&rank_type=eq.${rankType}&rank_position=eq.${rank}&select=username&limit=1`);
  return rows?.[0]?.username ? loadCardData(platform, rows[0].username) : null;
}

// One card per rarity on a platform, Common to Legendary (left to right).
async function rarityFan(platform) {
  const total = await platformTotal(platform);
  if (!total) return [null];
  const b = rarityBands(total);
  return Promise.all([
    byRank(platform, b.common[0] + 40),
    byRank(platform, b.rare[0] + 10),
    byRank(platform, b.epic[0] + 3),
    byRank(platform, 1),
  ]);
}

async function recentMilestones() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await restGet(
    `creator_milestones?crossed_at=gte.${since}&threshold=gte.100000` +
    `&platform=in.(youtube,tiktok,twitch,kick,music)` +
    `&select=threshold,creators(platform,username)&order=threshold.desc,crossed_at.desc&limit=12`
  );
  const seen = new Set();
  const picks = (rows || []).map((r) => r.creators).filter((c) => c && !seen.has(c.platform + c.username) && seen.add(c.platform + c.username)).slice(0, 3);
  if (picks.length < 3) return [null];
  return Promise.all(picks.map((c) => loadCardData(c.platform, c.username)));
}

// Headliner first (center, on top). Amber on `promote` is deliberate: it is
// the site's one functional colour for the Premium tier.
const PAGES = {
  home:       { eyebrow: 'Creator analytics', headline: ['Track any creator.', 'Across 8 platforms.'], sub: 'Live counts, ranks and cards, daily.',
                cards: () => Promise.all([byRank('tiktok', 1), byRank('youtube', 1), byRank('twitch', 1)]) },
  rankings:   { eyebrow: 'Live rankings', headline: ['Who’s #1,', 'everywhere.'], sub: 'Top creators on 8 platforms, ranked daily.',
                cards: () => Promise.all([byRank('youtube', 1), byRank('twitch', 1), byRank('kick', 1)]) },
  compare:    { eyebrow: 'Head to head', headline: ['Two creators.', 'One scoreboard.'], sub: 'Growth, reach and totals side by side.',
                cards: () => Promise.all([byRank('youtube', 1), byRank('youtube', 2)]) },
  trending:   { eyebrow: 'Trending now', headline: ['Who’s moving', 'right now.'], sub: 'The fastest growing creators this month.',
                cards: () => Promise.all([byRank('tiktok', 1, 'growth'), byRank('twitch', 1, 'growth'), byRank('kick', 1, 'growth')]) },
  milestones: { eyebrow: 'Milestones', headline: ['Every threshold,', 'the day it broke.'], sub: 'New records, the day they land.',
                cards: recentMilestones },
  promote:    { eyebrow: 'Featured listings', accent: '#fcd34d', headline: ['Put your creator', 'in the rankings.'], sub: 'Sponsored placement where people look.',
                cards: () => Promise.all([byRank('twitch', 2), byRank('youtube', 3), byRank('tiktok', 2)]) },
  blog:       { eyebrow: 'The blog', headline: ['Creator data,', 'explained.'], sub: 'What the numbers behind the headlines say.',
                cards: () => Promise.all([byRank('kick', 1), byRank('youtube', 4), byRank('twitch', 3)]) },
  calculator: { eyebrow: 'Earnings calculator', headline: ['What a channel', 'can earn.'], sub: 'Estimates from live view and sub counts.',
                cards: () => Promise.all([byRank('youtube', 3)]) },
  profile:    { eyebrow: 'Creator profile', headline: ['Every number,', 'one page.'], sub: 'Daily history, growth and rank.',
                cards: () => Promise.all([byRank('twitch', 5), byRank('youtube', 5), byRank('tiktok', 4)]) },
  badge:      { eyebrow: 'Holographic creator cards', headline: ['Pull your', 'creator card.'], sub: 'Legendary to Common. Always free.',
                cards: () => rarityFan('twitch') },
};

mkdirSync(OUT, { recursive: true });
let made = 0, kept = 0, bytes = 0;
for (const [key, spec] of Object.entries(PAGES)) {
  try {
    const cards = await spec.cards();
    if (!cards.length || cards.some((c) => !c)) throw new Error('cards unavailable');
    const jpg = await renderPageShare({ ...spec, cards });
    writeFileSync(`${OUT}/${key}.jpg`, jpg);
    made++; bytes += jpg.length;
    console.log(`  ${key}.jpg  ${Math.round(jpg.length / 1024)}KB  (${cards.map((c) => `${c.platform}/${c.username}`).join(', ')})`);
  } catch (err) {
    kept++;
    console.warn(`  ${key}.jpg  kept existing (${err.message})`);
  }
}
console.log(`\nOG previews: ${made} generated (${Math.round(bytes / 1024)}KB), ${kept} kept -> ${OUT}/`);
