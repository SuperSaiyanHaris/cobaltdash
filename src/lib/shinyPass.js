// ShinyPass: the free, yearly 1-99 progression track for signed-in users.
// Pure data and maths, shared by the site (src/) and the API (api/progress.js)
// so the numbers a user sees are the numbers the server enforces. No fetches,
// no randomness of its own: rollPack() takes the random source as an argument
// (the server passes crypto), which keeps it unit-testable.
//
// Seasons last a year and turn over on Oct 1 (Season 1: launch to Sep 30,
// 2027). Level, XP and packs reset each season; badges, cosmetics, streaks
// and vouchers are kept. XP to go from level L to L+1 is 40 + 0.6 * L^1.5,
// about 27,000 XP to reach 99: roughly six months for someone active every
// day (~150 XP/day with the daily caps below), so finishing a season is a
// real achievement but doable. Packs arrive every 10 levels and at 99.

export const MAX_LEVEL = 99;

export const xpToNext = (level) => Math.round(40 + 0.6 * Math.pow(level, 1.5));

// ── Seasons ───────────────────────────────────────────────────────────────
// Mirrors current_season() in supabase/migrations/20260927h_shinypass_seasons.sql.
/** Season for a YYYY-MM-DD day in New York. */
export function seasonForDate(day) {
  const [y, m] = String(day).split('-').map(Number);
  return Math.max(1, (m >= 10 ? y : y - 1) - 2025);
}
/** Last day of a season, YYYY-MM-DD. */
export const seasonLastDay = (season) => `${2026 + season}-09-30`;
/** Whole days left in a season, counting today. */
export function seasonDaysLeft(season, today) {
  const end = Date.UTC(...seasonLastDay(season).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const now = Date.UTC(...String(today).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.max(0, Math.round((end - now) / 86400000) + 1);
}

// Cumulative XP needed to *reach* each level. TOTAL_XP[1] = 0.
export const TOTAL_XP = (() => {
  const t = [0, 0];
  for (let l = 1; l < MAX_LEVEL; l++) t[l + 1] = t[l] + xpToNext(l);
  return t;
})();

/** { level, into, need, pct } for a lifetime XP total. At 99, need is 0. */
export function levelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < MAX_LEVEL && x >= TOTAL_XP[level + 1]) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, into: 0, need: 0, pct: 1 };
  const into = x - TOTAL_XP[level];
  const need = xpToNext(level);
  return { level, into, need, pct: into / need };
}

/** Card rarity from level, same four names as creator cards. */
export function tierForLevel(level) {
  if (level >= 75) return 'LEGENDARY';
  if (level >= 50) return 'EPIC';
  if (level >= 25) return 'RARE';
  return 'COMMON';
}
export const TIER_LEVELS = { COMMON: 1, RARE: 25, EPIC: 50, LEGENDARY: 75 };

// ── Earning XP ────────────────────────────────────────────────────────────
// Every grant happens server-side (api/progress.js, api/comments.js) against
// these caps. `perDay` counts events, not XP.
export const XP_RULES = {
  visit:   { xp: 20, perDay: 1, label: 'Visit ShinyPull', note: 'Once a day' },
  streak:  { xp: 5,  max: 50,   label: 'Streak bonus', note: '+5 per day of your streak, up to +50' },
  comment: { xp: 15, perDay: 5, label: 'Comment on a creator', note: 'Taken back if the comment is removed' },
  upvote:  { xp: 3,  perDay: 10, label: 'Upvote on your comment', note: 'From accounts older than 3 days' },
  follow:  { xp: 5,  perDay: 5, label: 'Follow a creator', note: 'Once per creator' },
  compare: { xp: 10, perDay: 2, label: 'Save a matchup', note: 'Once per matchup' },
  explore: { xp: 4,  perDay: 3, label: 'Open a creator profile', note: 'Different creators each day' },
};

export const streakBonus = (streak) => Math.min(XP_RULES.streak.max, XP_RULES.streak.xp * Math.max(0, streak - 1));

// ── Packs ─────────────────────────────────────────────────────────────────
// Each pack has its own look (a/b/c/d foil stops, base color, which effects
// run) that escalates with level, and its own signature card frame that is
// always the first thing inside it.
export const PACKS = [
  { level: 10, key: 'cardstock', face: 'paper', name: 'Cardstock', items: 3, a: '#E9E1D0', b: '#FFFFFF', c: '#B5A98F', d: '#D8CCB2', base: '#17150f', fx: [] },
  { level: 20, key: 'chrome', face: .62,    name: 'Chrome',    items: 3, a: '#C7D0DA', b: '#FFFFFF', c: '#7F8B99', d: '#E3E9F0', base: '#0f1318', fx: ['sheen'] },
  { level: 30, key: 'holo', face: .5,      name: 'Holo',      items: 3, a: '#7DF9FF', b: '#FFFFFF', c: '#FF7AD9', d: '#B69CFF', base: '#0d0b18', fx: ['sheen', 'foil'] },
  { level: 40, key: 'cosmic', face: .16,    name: 'Cosmic',    items: 3, a: '#9B8CFF', b: '#ECE8FF', c: '#4B3BB8', d: '#5EC8FF', base: '#07061a', fx: ['sheen', 'foil', 'stars'] },
  { level: 50, key: 'prism', face: .42,     name: 'Prism',     items: 5, a: '#FF7AD9', b: '#FFF3C4', c: '#67E8F9', d: '#C084FC', base: '#0c0816', fx: ['sheen', 'foil', 'stripes', 'prism'] },
  { level: 60, key: 'crystal', face: .34,   name: 'Crystal',   items: 3, a: '#A5F3FC', b: '#F0FDFF', c: '#38BDF8', d: '#DDF4FF', base: '#061219', fx: ['sheen', 'foil', 'stripes', 'facets'] },
  { level: 70, key: 'obsidian', face: .08,  name: 'Obsidian',  items: 3, a: '#71717A', b: '#E4E4E7', c: '#27272A', d: '#A1A1AA', base: '#050506', fx: ['sheen', 'foil', 'stripes', 'facets'] },
  { level: 80, key: 'platinum', face: .66,  name: 'Platinum',  items: 4, a: '#E5E4E2', b: '#FFFFFF', c: '#9CA3AF', d: '#CBD5E1', base: '#0e1014', fx: ['sheen', 'double', 'foil', 'stripes', 'facets'] },
  { level: 90, key: 'mythic', face: .46,    name: 'Mythic',    items: 4, a: '#F472B6', b: '#FDE68A', c: '#8B5CF6', d: '#22D3EE', base: '#0b0614', fx: ['sheen', 'double', 'foil', 'stripes', 'prism', 'sparkles'] },
  { level: 99, key: 'final', face: .52,     name: 'The Final Pull', items: 5, a: '#FFD76A', b: '#FFF3C4', c: '#C084FC', d: '#5EC8FF', base: '#0a0a0f', fx: ['sheen', 'double', 'foil', 'stripes', 'prism', 'facets', 'stars', 'sparkles'] },
];
export const PACK_BY_LEVEL = Object.fromEntries(PACKS.map((p) => [p.level, p]));
export const PACK_BY_KEY = Object.fromEntries(PACKS.map((p) => [p.key, p]));

/** Chance a pack contains a free month of a Basic featured listing. */
export function voucherChance(packLevel) {
  if (packLevel === 50 || packLevel === 99) return 1;
  return packLevel >= 60 ? 0.10 : 0.05;
}

// ── Cosmetics ─────────────────────────────────────────────────────────────
// Frames reuse pack palettes (key = pack key). Rings recolor the avatar ring
// in comments and on the card. Titles sit under the handle. Banners top the
// public page.
export const RINGS = {
  silver:  { name: 'Silver ring',  rarity: 'common',   a: '#E5E7EB', b: '#9CA3AF' },
  mint:    { name: 'Mint ring',    rarity: 'common',   a: '#6EE7B7', b: '#059669' },
  ocean:   { name: 'Ocean ring',   rarity: 'common',   a: '#7DD3FC', b: '#0369A1' },
  violet:  { name: 'Violet ring',  rarity: 'uncommon', a: '#C4B5FD', b: '#6D28D9' },
  sunset:  { name: 'Sunset ring',  rarity: 'uncommon', a: '#FDBA74', b: '#DB2777' },
  ice:     { name: 'Ice ring',     rarity: 'rare',     a: '#F0FDFF', b: '#38BDF8' },
  prism:   { name: 'Prism ring',   rarity: 'epic',     a: '#FF7AD9', b: '#67E8F9' },
};

export const TITLES = {
  lurker:      { name: 'Certified Lurker', rarity: 'common' },
  subcounter:  { name: 'Sub Counter',      rarity: 'common' },
  tabhoarder:  { name: 'Tab Hoarder',      rarity: 'common' },
  nightowl:    { name: 'Night Owl',        rarity: 'common' },
  chartchaser: { name: 'Chart Chaser',     rarity: 'uncommon' },
  statnerd:    { name: 'Stat Nerd',        rarity: 'uncommon' },
  livelurker:  { name: 'Live Lurker',      rarity: 'uncommon' },
  rankwatcher: { name: 'Rank Watcher',     rarity: 'uncommon' },
  numbergoup:  { name: 'Number Go Up',     rarity: 'rare' },
  foilfanatic: { name: 'Foil Fanatic',     rarity: 'rare' },
  bigpull:     { name: 'Big Pull Energy',  rarity: 'epic' },
  topone:      { name: 'Top 1% Energy',    rarity: 'epic' },
};

// What a random slot can be. Weights are relative. `xp` is a share of the
// XP for the pack's own level (25-60% of a level), so packs add a few levels
// over the whole track and never shortcut it.
export const SLOT_WEIGHTS = [
  { kind: 'xp',       w: 30 },
  { kind: 'ring',     w: 20 },
  { kind: 'title',    w: 18 },
  { kind: 'freeze',   w: 12 },
  { kind: 'banner',   w: 10 },
  { kind: 'showcase', w: 6 },
  { kind: 'shiny',    w: 4 },
];

export const KIND_RARITY = { frame: 'rare', xp: 'uncommon', freeze: 'uncommon', banner: 'uncommon', showcase: 'rare', shiny: 'epic', voucher: 'legendary' };
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const pick = (list, rnd) => list[Math.floor(rnd() * list.length) % list.length];
function weighted(entries, rnd) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rnd() * total;
  for (const e of entries) { r -= e.w; if (r < 0) return e; }
  return entries[entries.length - 1];
}

/**
 * The contents of a pack, before the server resolves duplicates and applies
 * XP/freezes. `rnd` returns [0, 1). Rarest item is sorted last so the reveal
 * builds up to it.
 */
export function rollPack(packLevel, rnd) {
  const pack = PACK_BY_LEVEL[packLevel];
  if (!pack) throw new Error(`No pack at level ${packLevel}`);
  const items = [{ kind: 'frame', key: pack.key, rarity: KIND_RARITY.frame }];
  if (rnd() < voucherChance(packLevel)) items.push({ kind: 'voucher', key: 'basic-month', rarity: 'legendary' });
  // The last random slot is a "better" slot: no plain XP, no common rings/titles.
  while (items.length < pack.items) {
    const better = items.length === pack.items - 1;
    const pool = better ? SLOT_WEIGHTS.filter((e) => e.kind !== 'xp') : SLOT_WEIGHTS;
    const { kind } = weighted(pool, rnd);
    if (kind === 'ring') {
      const keys = Object.keys(RINGS).filter((k) => !better || RINGS[k].rarity !== 'common');
      const key = pick(keys, rnd);
      items.push({ kind, key, rarity: RINGS[key].rarity });
    } else if (kind === 'title') {
      const keys = Object.keys(TITLES).filter((k) => !better || TITLES[k].rarity !== 'common');
      const key = pick(keys, rnd);
      items.push({ kind, key, rarity: TITLES[key].rarity });
    } else if (kind === 'banner') {
      const unlocked = PACKS.filter((p) => p.level <= packLevel);
      items.push({ kind, key: pick(unlocked, rnd).key, rarity: KIND_RARITY.banner });
    } else if (kind === 'xp') {
      const amount = Math.round(xpToNext(packLevel) * (0.25 + rnd() * 0.35));
      items.push({ kind, key: 'xp', amount, rarity: KIND_RARITY.xp });
    } else {
      items.push({ kind, key: kind, rarity: KIND_RARITY[kind] });
    }
  }
  return items.sort((x, y) => RARITY_ORDER.indexOf(x.rarity) - RARITY_ORDER.indexOf(y.rarity));
}

/** Human name for an inventory item. */
export function itemName(item) {
  switch (item.kind) {
    case 'frame': return `${PACK_BY_KEY[item.key]?.name || 'Foil'} card frame`;
    case 'banner': return `${PACK_BY_KEY[item.key]?.name || 'Foil'} banner`;
    case 'ring': return RINGS[item.key]?.name || 'Avatar ring';
    case 'title': return `Title: ${TITLES[item.key]?.name || item.key}`;
    case 'xp': return `+${(item.amount || 0).toLocaleString('en-US')} XP`;
    case 'freeze': return 'Streak Freeze';
    case 'showcase': return 'Showcase slot';
    case 'shiny': return 'Shiny variant';
    case 'voucher': return '1 free month: Featured Listing';
    case 'dupe': return `Duplicate, +${(item.amount || 0).toLocaleString('en-US')} XP`;
    default: return item.key;
  }
}

export function itemBlurb(item) {
  switch (item.kind) {
    case 'frame': return 'New foil for your card.';
    case 'banner': return 'Artwork for the top of your public page.';
    case 'ring': return 'A new ring around your avatar.';
    case 'title': return 'Shown under your name.';
    case 'xp': return 'Added to your level.';
    case 'freeze': return 'Saves your streak if you miss a day.';
    case 'showcase': return 'Show one more creator on your page.';
    case 'shiny': return 'Your own foil version of a creator you follow.';
    case 'voucher': return 'A Basic spot in the rankings for any creator you pick, for 30 days.';
    case 'dupe': return 'Already had it, so you get XP instead.';
    default: return '';
  }
}

// ── Badges ────────────────────────────────────────────────────────────────
// `icon` is a lucide-react icon name resolved by the UI.
export const BADGES = {
  og2026:   { name: 'OG 2026',     desc: 'Joined ShinyPull in 2026, the year it launched.', icon: 'Gem',        a: '#FFD76A', b: '#C084FC' },
  streak7:  { name: '7-Day Streak', desc: 'Visited 7 days in a row.',    icon: 'Flame',      a: '#FDBA74', b: '#EF4444' },
  streak10: { name: '10-Day Streak', desc: 'Visited 10 days in a row.',  icon: 'Flame',      a: '#FDE68A', b: '#F97316' },
  streak30: { name: '30-Day Streak', desc: 'Visited 30 days in a row.',  icon: 'Flame',      a: '#F0ABFC', b: '#DB2777' },
  streak100:{ name: '100-Day Streak', desc: 'Visited 100 days in a row.', icon: 'Flame',     a: '#A5F3FC', b: '#7C3AED' },
  voice:    { name: 'Voice',       desc: 'Your comments collected 100 upvotes.',   icon: 'MessageCircle', a: '#7DD3FC', b: '#2563EB' },
  collector:{ name: 'Collector',   desc: 'Following creators on all 8 platforms.', icon: 'LayoutGrid',    a: '#6EE7B7', b: '#0D9488' },
  scout:    { name: 'Scout',       desc: 'Followed a creator before their card moved up a rarity.', icon: 'Telescope', a: '#C4B5FD', b: '#7C3AED' },
};
export const STREAK_BADGES = [[7, 'streak7'], [10, 'streak10'], [30, 'streak30'], [100, 'streak100']];

/** Key of the badge for reaching level 99 in a season. */
export const seasonMaxBadge = (season) => `season${season}_99`;

/** Badge details for any key, including the per-season "Max" badges. */
export function badgeMeta(key) {
  if (BADGES[key]) return BADGES[key];
  const m = /^season(\d+)_99$/.exec(String(key));
  if (m) return { name: `Season ${m[1]} Max`, desc: `Reached level 99 in Season ${m[1]}.`, icon: 'Crown', a: '#FFD76A', b: '#E0A526' };
  return null;
}

// Fixed drops halfway between packs, granted automatically on level up.
export const LEVEL_DROPS = {
  5:  { kind: 'title', key: 'lurker', rarity: 'common' },
  15: { kind: 'ring', key: 'mint', rarity: 'common' },
  25: { kind: 'title', key: 'statnerd', rarity: 'uncommon' },
  35: { kind: 'freeze', key: 'freeze', rarity: 'uncommon' },
  45: { kind: 'ring', key: 'violet', rarity: 'uncommon' },
  55: { kind: 'title', key: 'rankwatcher', rarity: 'uncommon' },
  65: { kind: 'freeze', key: 'freeze', rarity: 'uncommon' },
  75: { kind: 'ring', key: 'ice', rarity: 'rare' },
  85: { kind: 'title', key: 'foilfanatic', rarity: 'rare' },
  95: { kind: 'ring', key: 'prism', rarity: 'epic' },
};

/** What unlocks at a level, for the track (packs, tiers, drops). */
export function unlockAt(level) {
  const out = {};
  if (PACK_BY_LEVEL[level]) out.pack = PACK_BY_LEVEL[level];
  const tier = Object.entries(TIER_LEVELS).find(([, l]) => l === level && l > 1);
  if (tier) out.tier = tier[0];
  if (LEVEL_DROPS[level]) out.drop = LEVEL_DROPS[level];
  return Object.keys(out).length ? out : null;
}
