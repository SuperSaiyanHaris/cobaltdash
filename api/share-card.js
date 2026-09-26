/**
 * Per-creator link preview: /og/card/:platform/:username.jpg (rewritten here
 * by vercel.json). middleware.js points every profile's og:image and
 * twitter:image at it, so a shared profile shows that creator's own card.
 *
 * Node runtime (resvg + sharp are native). CDN-cached for a day; social
 * scrapers cache on their side too. Any failure redirects to the static
 * profile preview, never a blank or broken image: a scraper that gets an
 * error caches the missing preview for days.
 */
import { loadCardData } from '../src/lib/cardData.js';
import { CARD_PLATFORMS } from '../src/lib/badgeCard.js';
import { renderCreatorShare } from './_shareCard.js';

const FALLBACK = '/og/profile.jpg';

export default async function handler(req, res) {
  const platform = String(req.query.platform || '');
  const username = String(req.query.file || '').replace(/\.jpe?g$/i, '');
  const fallback = () => {
    res.setHeader('cache-control', 'public, s-maxage=600');
    res.redirect(302, FALLBACK);
  };
  if (!CARD_PLATFORMS[platform] || !username || username.length > 120) return fallback();

  try {
    const data = await loadCardData(platform, username);
    if (!data) return fallback();
    const jpg = await renderCreatorShare(data);
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(jpg);
  } catch (err) {
    console.error('share-card', platform, username, err?.message);
    return fallback();
  }
}
