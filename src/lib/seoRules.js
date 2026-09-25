// Indexing rules shared by middleware.js (noindex tag) and
// scripts/generateSitemap.js (what gets submitted), so a page can never be in
// the sitemap yet noindexed or the reverse. Plain ESM, no imports: the edge
// middleware bundles it. Full history of the thresholds is in middleware.js.

/** A creator in their platform's top N by subscribers is always indexable. */
export const TOP_TIER_RANK_LIMIT = 500;
/** Outside the top tier, a page needs at least this many followers/subs. */
export const THIN_COUNT_FLOOR = 50000;

/** True when a profile page should be noindexed as thin content. */
export function isThinProfile({ count, subsRank }) {
  if (count === null || count === undefined) return true;
  const inHead = subsRank !== null && subsRank !== undefined && subsRank <= TOP_TIER_RANK_LIMIT;
  return !inHead && count < THIN_COUNT_FLOOR;
}

/**
 * Resolve a username lookup that may match several rows (copycat channels can
 * share our derived username). Returns the only row, or the row whose latest
 * count is 10x+ the runner-up's, else null (genuinely ambiguous). Rows embed
 * creator_stats ordered newest first.
 */
export function pickCreatorRow(rows) {
  if (!rows || !rows.length) return null;
  if (rows.length === 1) return rows[0];
  const latestCount = (r) => r.creator_stats?.[0]?.subscribers ?? 0;
  const sorted = [...rows].sort((x, y) => latestCount(y) - latestCount(x));
  const top = latestCount(sorted[0]);
  if (!top || top < latestCount(sorted[1]) * 10) return null;
  return sorted[0];
}
