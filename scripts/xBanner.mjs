// Renders the @ShinyPull X profile banner (1500x500) from live cards.
//   node scripts/xBanner.mjs [out.jpg]
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { loadCardData, restGet } from '../src/lib/cardData.js';
import { renderBanner } from '../api/_shareCard.js';

async function byRank(platform, rank) {
  const rows = await restGet(`rankings_cache?platform=eq.${platform}&rank_type=eq.subscribers&rank_position=eq.${rank}&select=username&limit=1`);
  return rows?.[0]?.username ? loadCardData(platform, rows[0].username) : null;
}

const out = process.argv[2] || 'x-banner.jpg';
// Five #1s, the biggest in the middle.
const cards = await Promise.all([byRank('tiktok', 1), byRank('twitch', 1), byRank('youtube', 1), byRank('kick', 1), byRank('tiktok', 2)]);
if (cards.some((c) => !c)) throw new Error('a card failed to load');
const jpg = await renderBanner({
  headline: ['Every creator.', 'One holographic card.'],
  sub: 'Live stats across 8 platforms · shinypull.com',
  cards,
});
writeFileSync(out, jpg);
console.log(`wrote ${out} (${Math.round(jpg.length / 1024)} KB)`, cards.map((c) => `${c.platform}/${c.username}`).join(', '));
