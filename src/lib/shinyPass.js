// ShinyPass: the free, yearly 1-99 progression track for signed-in users.
// Pure data and maths, shared by the site (src/) and the API (api/progress.js)
// so the numbers a user sees are the numbers the server enforces. No fetches,
// no randomness of its own: rollPack() takes the random source as an argument
// (the server passes crypto), which keeps it unit-testable.
//
// Seasons are calendar years (owner decision, 2026-09-27): Season 1 is the
// launch season, Sep 27 to Dec 31, 2026; Season 2 is 2027; and so on. Level,
// XP and packs reset each Jan 1; badges, cosmetics, streaks and vouchers are
// kept. XP to go from level L to L+1 is 40 + 0.6 * L^1.5, about 27,000 XP to
// reach 99: roughly six months for someone active every day (~150 XP/day
// with the daily caps below). The short launch season runs at 45% of that
// (about 12,200 XP, under three months) so 99 is still reachable by New Year.

export const MAX_LEVEL = 99;

// ── Seasons ───────────────────────────────────────────────────────────────
// Mirrors current_season() in supabase/migrations/20260927k_shinypass_calendar_seasons.sql.
/** Season for a YYYY-MM-DD day in New York. */
export function seasonForDate(day) {
  const [y] = String(day).split('-').map(Number);
  return Math.max(1, y - 2025);
}
/** Last day of a season, YYYY-MM-DD. */
export const seasonLastDay = (season) => `${2025 + season}-12-31`;
/** Whole days left in a season, counting today. */
export function seasonDaysLeft(season, today) {
  const end = Date.UTC(...seasonLastDay(season).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const now = Date.UTC(...String(today).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.max(0, Math.round((end - now) / 86400000) + 1);
}
/** The season it is right now in New York. */
export function currentSeason() {
  return seasonForDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
}

/** Share of the normal XP curve a season uses (the launch season is short). */
export const seasonScale = (season) => (season === 1 ? 0.45 : 1);

export const xpToNext = (level, season = currentSeason()) => Math.round((40 + 0.6 * Math.pow(level, 1.5)) * seasonScale(season));

// Cumulative XP needed to *reach* each level, per season. [1] = 0.
const totals = new Map();
export function totalXp(season = currentSeason()) {
  if (!totals.has(season)) {
    const t = [0, 0];
    for (let l = 1; l < MAX_LEVEL; l++) t[l + 1] = t[l] + xpToNext(l, season);
    totals.set(season, t);
  }
  return totals.get(season);
}
/** Cumulative XP table for the current season (see totalXp for others). */
export const TOTAL_XP = totalXp();

/** { level, into, need, pct } for a season's XP total. At 99, need is 0. */
export function levelFromXp(xp, season = currentSeason()) {
  const T = totalXp(season);
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < MAX_LEVEL && x >= T[level + 1]) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, into: 0, need: 0, pct: 1 };
  const into = x - T[level];
  const need = xpToNext(level, season);
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
  steel:   { name: 'Steel ring',   rarity: 'common',   a: '#CBD5E1', b: '#475569' },
  lime:    { name: 'Lime ring',    rarity: 'uncommon', a: '#D9F99D', b: '#4D7C0F' },
  rose:    { name: 'Rose ring',    rarity: 'rare',     a: '#FDA4AF', b: '#BE123C' },
  ice:     { name: 'Ice ring',     rarity: 'rare',     a: '#F0FDFF', b: '#38BDF8' },
  cosmic:  { name: 'Cosmic ring',  rarity: 'epic',     a: '#A5B4FC', b: '#312E81' },
  prism:   { name: 'Prism ring',   rarity: 'epic',     a: '#FF7AD9', b: '#67E8F9' },
  mythic:  { name: 'Mythic ring',  rarity: 'legendary', a: '#F472B6', b: '#22D3EE' },
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
  talentscout: { name: 'Talent Scout',     rarity: 'rare' },
  bigpull:     { name: 'Big Pull Energy',  rarity: 'epic' },
  topone:      { name: 'Top 1% Energy',    rarity: 'epic' },
  streakdemon: { name: 'Streak Demon',     rarity: 'epic' },
  finalboss:   { name: 'Final Boss',       rarity: 'legendary' },
};

// Stickers sit on the corner of your card and on your public page.
// `a` is the sticker color, `t` its text color.
export const STICKERS = {
  gg:        { name: 'GG',             rarity: 'common',    a: '#E4E4E7', t: '#18181B' },
  w:         { name: 'W',              rarity: 'common',    a: '#86EFAC', t: '#052E16' },
  lurking:   { name: 'Lurking',        rarity: 'common',    a: '#CBD5E1', t: '#0F172A' },
  live:      { name: 'LIVE',           rarity: 'common',    a: '#F87171', t: '#FFFFFF' },
  subbed:    { name: 'Subbed',         rarity: 'common',    a: '#A5B4FC', t: '#1E1B4B' },
  pog:       { name: 'POG',            rarity: 'uncommon',  a: '#FDE047', t: '#1C1917' },
  hype:      { name: 'Hype',           rarity: 'uncommon',  a: '#F9A8D4', t: '#500724' },
  clutch:    { name: 'Clutch',         rarity: 'uncommon',  a: '#67E8F9', t: '#083344' },
  dayone:    { name: 'Day One',        rarity: 'uncommon',  a: '#FDBA74', t: '#431407' },
  rising:    { name: 'Rising',         rarity: 'uncommon',  a: '#6EE7B7', t: '#022C22' },
  calledit:  { name: 'Called It',      rarity: 'rare',      a: '#7DD3FC', t: '#082F49' },
  statnerd:  { name: 'Stat Nerd',      rarity: 'rare',      a: '#C4B5FD', t: '#2E1065' },
  ngu:       { name: 'Number Go Up',   rarity: 'rare',      a: '#BEF264', t: '#1A2E05' },
  onfire:    { name: 'On Fire',        rarity: 'rare',      a: '#FB923C', t: '#FFFFFF' },
  goat:      { name: 'GOAT',           rarity: 'epic',      a: '#E9D5FF', t: '#3B0764' },
  topone:    { name: 'Top 1%',         rarity: 'epic',      a: '#F0ABFC', t: '#4A044E' },
  maincharacter: { name: 'Main Character', rarity: 'epic',  a: '#FDA4AF', t: '#4C0519' },
  legend:    { name: 'Legend',         rarity: 'legendary', a: '#FFF3C4', t: '#422006' },
  mythicpull:{ name: 'Mythic Pull',    rarity: 'legendary', a: '#FBCFE8', t: '#500724' },
  season1:   { name: 'Season 1',       rarity: 'legendary', a: '#FFFFFF', t: '#0A0A0F' },
};

// Name effects color your handle in comments and on your page.
export const NAME_EFFECTS = {
  chrome:  { name: 'Chrome name',  rarity: 'common',    stops: ['#F4F4F5', '#A1A1AA', '#F4F4F5'] },
  mint:    { name: 'Mint name',    rarity: 'common',    stops: ['#6EE7B7', '#10B981', '#A7F3D0'] },
  ocean:   { name: 'Ocean name',   rarity: 'uncommon',  stops: ['#7DD3FC', '#2563EB', '#67E8F9'] },
  violet:  { name: 'Violet name',  rarity: 'uncommon',  stops: ['#C4B5FD', '#7C3AED', '#E9D5FF'] },
  ember:   { name: 'Ember name',   rarity: 'rare',      stops: ['#FDBA74', '#EF4444', '#FDE68A'] },
  ice:     { name: 'Ice name',     rarity: 'rare',      stops: ['#F0FDFF', '#38BDF8', '#E0F2FE'] },
  holo:    { name: 'Holo name',    rarity: 'epic',      stops: ['#7DF9FF', '#FF7AD9', '#B69CFF'] },
  cosmic:  { name: 'Cosmic name',  rarity: 'epic',      stops: ['#A5B4FC', '#6366F1', '#F0ABFC'] },
  prism:   { name: 'Prism name',   rarity: 'legendary', stops: ['#FF7AD9', '#FDE68A', '#67E8F9'] },
  mythic:  { name: 'Mythic name',  rarity: 'legendary', stops: ['#F472B6', '#8B5CF6', '#22D3EE'] },
};

// Card backs show when your card flips (public page, pack openings).
export const CARD_BACKS = {
  carbon:   { name: 'Carbon back',   rarity: 'common',    a: '#27272A', b: '#09090B', line: '#3F3F46' },
  midnight: { name: 'Midnight back', rarity: 'common',    a: '#1E293B', b: '#020617', line: '#334155' },
  grid:     { name: 'Grid back',     rarity: 'uncommon',  a: '#14532D', b: '#052E16', line: '#22C55E' },
  chrome:   { name: 'Chrome back',   rarity: 'uncommon',  a: '#9CA3AF', b: '#1F2937', line: '#E5E7EB' },
  holo:     { name: 'Holo back',     rarity: 'rare',      a: '#7DF9FF', b: '#6D28D9', line: '#FF7AD9' },
  crystal:  { name: 'Crystal back',  rarity: 'rare',      a: '#A5F3FC', b: '#0E7490', line: '#F0FDFF' },
  cosmic:   { name: 'Cosmic back',   rarity: 'epic',      a: '#6366F1', b: '#1E1B4B', line: '#A5B4FC' },
  obsidian: { name: 'Obsidian back', rarity: 'epic',      a: '#3F3F46', b: '#000000', line: '#A1A1AA' },
  prism:    { name: 'Prism back',    rarity: 'legendary', a: '#FF7AD9', b: '#4C1D95', line: '#FDE68A' },
  mythic:   { name: 'Mythic back',   rarity: 'legendary', a: '#F472B6', b: '#312E81', line: '#22D3EE' },
};

// What a random slot can be. Weights are relative. `xp` is a share of the
// XP for the pack's own level (25-60% of a level), so packs add a few levels
// over the whole track and never shortcut it.
export const SLOT_WEIGHTS = [
  { kind: 'xp',       w: 24 },
  { kind: 'ring',     w: 12 },
  { kind: 'title',    w: 12 },
  { kind: 'sticker',  w: 12 },
  { kind: 'freeze',   w: 10 },
  { kind: 'name',     w: 8 },
  { kind: 'back',     w: 8 },
  { kind: 'banner',   w: 7 },
  { kind: 'showcase', w: 4 },
  { kind: 'shiny',    w: 3 },
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
    if (kind === 'ring' || kind === 'title' || kind === 'sticker' || kind === 'name' || kind === 'back') {
      const cat = CATALOG[kind];
      const keys = Object.keys(cat).filter((k) => !better || cat[k].rarity !== 'common');
      const key = pick(keys, rnd);
      items.push({ kind, key, rarity: cat[key].rarity });
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
    case 'sticker': return `Sticker: ${STICKERS[item.key]?.name || item.key}`;
    case 'name': return NAME_EFFECTS[item.key]?.name || 'Name effect';
    case 'back': return CARD_BACKS[item.key]?.name || 'Card back';
    case 'boost': return 'XP Boost';
    case 'tier': return `${item.key.charAt(0)}${item.key.slice(1).toLowerCase()} card`;
    case 'pack': return `${PACK_BY_KEY[item.key]?.name || ''} pack`;
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
    case 'sticker': return 'Sits on the corner of your card and on your page.';
    case 'name': return 'Colors your name in comments and on your page.';
    case 'back': return 'The back of your card when it flips.';
    case 'boost': return `+25% XP on everything you earn for ${BOOST_DAYS} days.`;
    case 'tier': return item.key === 'RARE' ? 'Your card turns Rare, with drifting foil.' : item.key === 'EPIC' ? 'Your card turns Epic: holo stripes and a spinning ring.' : 'Your card turns Legendary: double glint, prism sweep and sparkles.';
    case 'pack': {
      const p = PACK_BY_KEY[item.key];
      return p && p.items === 5 ? '5 items, always with a free month of a Featured Listing.' : '3 items plus its own card frame.';
    }
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

// ── The track: a reward at every level ─────────────────────────────────────
// Packs every 10 levels and at 99, card upgrades at 25/50/75, and a drop on
// every other level, granted automatically when you reach it. Drops follow
// a fixed rotation; each catalog is walked from its most common item to its
// rarest, so rewards get better as the season goes on and nothing repeats.
export const BOOST_DAYS = 3;
const ROTATION = ['sticker', 'boost', 'title', 'ring', 'sticker', 'back', 'name', 'banner', 'freeze'];
const CATALOG = {
  sticker: STICKERS, title: TITLES, ring: RINGS, name: NAME_EFFECTS, back: CARD_BACKS,
  banner: Object.fromEntries(PACKS.map((p, i) => [p.key, { name: `${p.name} banner`, rarity: RARITY_BY_INDEX(i) }])),
};
function RARITY_BY_INDEX(i) { return ['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary'][i]; }
const byRarity = (cat) => Object.keys(cat).sort((a, b) => RARITY_ORDER.indexOf(cat[a].rarity) - RARITY_ORDER.indexOf(cat[b].rarity));
const bandRarity = (l) => (l >= 80 ? 'epic' : l >= 50 ? 'rare' : l >= 20 ? 'uncommon' : 'common');

/** Every level's reward, index = level. Built once. */
export const TRACK = (() => {
  const out = [null];
  const seen = {};
  let step = 0;
  const TIERS_AT = { 25: 'RARE', 50: 'EPIC', 75: 'LEGENDARY' };
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (PACK_BY_LEVEL[l]) {
      const p = PACK_BY_LEVEL[l];
      out.push({ level: l, kind: 'pack', key: p.key, rarity: l === 99 ? 'legendary' : l >= 50 ? 'epic' : bandRarity(l) === 'common' ? 'uncommon' : 'rare', ...(TIERS_AT[l] ? { alsoTier: TIERS_AT[l] } : {}) });
      continue;
    }
    if (TIERS_AT[l]) { out.push({ level: l, kind: 'tier', key: TIERS_AT[l], rarity: TIERS_AT[l].toLowerCase() }); continue; }
    const kind = ROTATION[step++ % ROTATION.length];
    if (kind === 'boost' || kind === 'freeze') {
      out.push({ level: l, kind, key: kind, rarity: bandRarity(l) });
      continue;
    }
    const keys = byRarity(CATALOG[kind]);
    const n = seen[kind] || 0;
    seen[kind] = n + 1;
    const key = keys[Math.min(n, keys.length - 1)];
    out.push({ level: l, kind, key, rarity: CATALOG[kind][key].rarity });
  }
  return out;
})();

export const trackReward = (level) => TRACK[level] || null;

/** Levels whose reward is a drop granted on level up (not a pack or tier). */
export const DROP_LEVELS = TRACK.filter((r) => r && r.kind !== 'pack' && r.kind !== 'tier').map((r) => r.level);
