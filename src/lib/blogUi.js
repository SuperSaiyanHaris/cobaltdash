// Small helpers shared by the Blog page and the profile News tab, so a story
// card looks the same wherever it appears.

// Category identity is a small dot tint plus a quiet pill (precision system).
const CATEGORY_COLORS = {
  'YouTube News':      { pill: 'bg-red-50 text-red-700 border border-red-200/80',           dot: 'bg-red-500' },
  'Platform Updates':  { pill: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',   dot: 'bg-indigo-500' },
  'Industry News':     { pill: 'bg-sky-50 text-sky-700 border border-sky-200/80',           dot: 'bg-sky-500' },
  'Industry Insights': { pill: 'bg-sky-50 text-sky-700 border border-sky-200/80',           dot: 'bg-sky-400' },
  'Analytics':          { pill: 'bg-violet-50 text-violet-700 border border-violet-200/80',  dot: 'bg-violet-500' },
  'Creator Economy':   { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', dot: 'bg-emerald-500' },
  'Creator Spotlight': { pill: 'bg-pink-50 text-pink-700 border border-pink-200/80',        dot: 'bg-pink-500' },
  'Twitch Trends':     { pill: 'bg-purple-50 text-purple-700 border border-purple-200/80',  dot: 'bg-purple-500' },
  'Rankings':          { pill: 'bg-amber-50 text-amber-700 border border-amber-200/80',     dot: 'bg-amber-500' },
};
const DEFAULT_COLORS = { pill: 'bg-neutral-50 text-neutral-600 border border-neutral-200/80', dot: 'bg-indigo-500' };

export function getCatColors(category) {
  return CATEGORY_COLORS[category] || DEFAULT_COLORS;
}

export function isNewPost(publishedAt) {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

export function formatPostDate(dateStr) {
  // published_at is a bare DATE ("2026-07-25"), which JS parses as UTC
  // midnight. Displaying that via toLocaleDateString in a timezone behind
  // UTC (e.g. America/New_York) rolls it back to the previous day. Forcing
  // local noon avoids crossing any day boundary.
  const d = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
