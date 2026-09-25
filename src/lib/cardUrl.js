// URL of a creator's holographic card image (rendered by middleware.js).
// On our own pages the URL carries CARD_DESIGN_VERSION so a card redesign
// shows up immediately instead of waiting out browser/CDN caches; bump it
// whenever src/lib/badgeCard.js changes visibly. Embed codes handed to
// creators use the plain URL, which refreshes on the normal cache cycle.
export const CARD_DESIGN_VERSION = 4;

export function cardImageUrl(platform, username, { mark = true, absolute = false } = {}) {
  const params = new URLSearchParams({ v: String(CARD_DESIGN_VERSION) });
  if (!mark) params.set('mark', '0');
  return `${absolute ? 'https://shinypull.com' : ''}/card/${platform}/${encodeURIComponent(username)}?${params}`;
}
