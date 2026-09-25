// Earnings estimates shown on the site. Plain ESM with no imports so the edge
// middleware (middleware.js) can bundle it too: one formula, one place.
//
// Kick: public terms, a $4.99 (US) sub with a 95% creator share. A ceiling for
// subscription income only (fees, taxes, regional pricing lower it).
// YouTube: typical ad revenue of $2-$5 per 1,000 views (matches the range the
// in-app CPM calculator defaults sit inside).

export const KICK_SUB_PRICE = 4.99;
export const KICK_CREATOR_SHARE = 0.95;
export const YOUTUBE_CPM_LOW = 2;
export const YOUTUBE_CPM_HIGH = 5;

/** Kick sub income ceiling for a paid-subscriber count. */
export function kickSubEarnings(subs) {
  const perSub = KICK_SUB_PRICE * KICK_CREATOR_SHARE;
  const monthly = Math.max(0, Number(subs) || 0) * perSub;
  return { perSub, monthly, yearly: monthly * 12 };
}

/** YouTube ad revenue range for a monthly view count. */
export function youtubeAdEarnings(monthlyViews) {
  const v = Math.max(0, Number(monthlyViews) || 0) / 1000;
  return { low: v * YOUTUBE_CPM_LOW, high: v * YOUTUBE_CPM_HIGH };
}

/** Compact dollar amount: $950, $12K, $1.3M. */
export function formatMoney(n) {
  if (!n || n < 0) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
}
