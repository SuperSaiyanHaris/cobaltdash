/**
 * Substack integration — public leaderboard API (no auth, no key).
 *
 * Substack deliberately does NOT expose exact subscriber counts to
 * logged-out users. The only structured public signal is the category
 * leaderboard (`substack.com/api/v1/category/public/{id}/paid`), which
 * returns publications in precise ranked order plus an order-of-magnitude
 * bucket for subscriber count (1K / 10K / 100K / 1M).
 *
 * Schema mapping (see CLAUDE.md):
 *   platform_id      = the numeric publication id (stable, unique)
 *   username         = the subdomain slug (e.g. `bytebytego`) for clean URLs
 *   subscribers      = total-subscribers order-of-magnitude bucket
 *   leaderboard_rank = global position across category leaderboards — this is
 *                      what rankings sort by, NOT the (tied) bucket value
 *   total_views      = null (no views metric)
 *   total_posts      = null (leaderboard doesn't expose a clean post count)
 *
 * Substack natively uses the word "subscribers" (not followers), so it sits
 * in the same label group as YouTube.
 *
 * Profile + search are DB-first: live federated lookup of an arbitrary
 * publication can't return the bucket reliably, and the daily collection
 * (running from GitHub Actions IPs) keeps the catalog fresh.
 */

// Top-level Substack categories. Shared by the seed + discovery scripts'
// reference; the scripts keep their own copies since they run in Node.
export const SUBSTACK_CATEGORIES = [
  { id: 96, slug: 'culture' },
  { id: 4, slug: 'technology' },
  { id: 62, slug: 'business' },
  { id: 76739, slug: 'us-politics' },
  { id: 153, slug: 'finance' },
  { id: 13645, slug: 'food' },
  { id: 94, slug: 'sports' },
  { id: 15417, slug: 'art' },
  { id: 76740, slug: 'world-politics' },
  { id: 103, slug: 'news' },
  { id: 49715, slug: 'fashionandbeauty' },
  { id: 11, slug: 'music' },
  { id: 223, slug: 'faith' },
];

/**
 * Parse an input that might be:
 *   - a bare slug like `bytebytego`
 *   - a subdomain URL `https://bytebytego.substack.com`
 *   - a custom domain URL `https://www.thefp.com` (can't recover slug — returns null)
 * Returns `{ slug }` or null.
 */
export function parseSubstackHandle(input) {
  if (!input) return null;
  const raw = String(input).trim();

  // Subdomain URL form
  const subMatch = raw.match(/^https?:\/\/([^.]+)\.substack\.com/i);
  if (subMatch) return { slug: subMatch[1].toLowerCase() };

  // Bare slug (no protocol, no dots) — assume it's a subdomain slug
  if (/^[a-z0-9-]+$/i.test(raw)) return { slug: raw.toLowerCase() };

  return null;
}

/**
 * Build the canonical public URL for a publication. The subdomain form
 * always resolves (Substack redirects to the custom domain if one is set),
 * so it's safe even when we only know the slug.
 */
export function buildSubstackUrl(slug) {
  return `https://${slug}.substack.com`;
}

/**
 * Human label for an order-of-magnitude subscriber bucket.
 * 1000 -> "1K+", 10000 -> "10K+", 100000 -> "100K+", 1000000 -> "1M+".
 * Used where we want to signal the value is a floor, not an exact count.
 */
export function oomLabel(value) {
  if (!value || value < 1000) return null;
  if (value >= 1_000_000) return '1M+';
  if (value >= 100_000) return '100K+';
  if (value >= 10_000) return '10K+';
  return '1K+';
}

/**
 * Normalize a raw Substack leaderboard publication object into our shape.
 * `globalRank` is supplied by the caller after merging category leaderboards.
 */
export function normalizePublication(pub, globalRank = null) {
  if (!pub || !pub.id || !pub.subdomain) return null;
  // Precise total subscribers ("freeSubscriberCount": "2,900,000") when Substack
  // exposes it, else the order-of-magnitude band floor.
  let subscribers = 0;
  if (pub.freeSubscriberCount) {
    const n = parseInt(String(pub.freeSubscriberCount).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) subscribers = n;
  }
  if (!subscribers) {
    subscribers = pub.rankingDetailFreeIncludedOrderOfMagnitude || pub.rankingDetailOrderOfMagnitude || 0;
  }
  return {
    platform: 'substack',
    platformId: String(pub.id),
    username: pub.subdomain,
    displayName: pub.name || pub.subdomain,
    profileImage: pub.logo_url || pub.author_photo_url || null,
    description: pub.hero_text || pub.author_bio || null,
    country: null,
    category: null,
    subscribers,
    followers: subscribers,
    totalViews: null,
    totalPosts: null,
    leaderboardRank: globalRank,
    profileUrl: buildSubstackUrl(pub.subdomain),
  };
}

/**
 * Browser search path. DB-only (same as Mastodon/Rumble) — the live
 * leaderboard API can't do free-text lookup, and we have a seeded catalog.
 * Search.jsx performs the actual DB fuzzy match via searchCreators().
 */
export async function searchSubstack() {
  return [];
}

/**
 * Fetch the latest published post for a Substack publication via its public
 * archive API (`{slug}.substack.com/api/v1/archive`). Returns the post's
 * title, canonical URL, publish date, and engagement counts. Used to render
 * the "Latest post" card on the profile (same shape as Rumble/Mastodon).
 */
export async function getSubstackLatestPost(slug) {
  if (!slug) return null;
  try {
    const res = await fetch(`https://${slug}.substack.com/api/v1/archive?sort=new&limit=1&offset=0`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const post = Array.isArray(arr) ? arr[0] : null;
    if (!post) return null;
    // reactions is a map like {"❤":277}; sum the values for a single count.
    const reactionCount = post.reaction_count
      || (post.reactions ? Object.values(post.reactions).reduce((a, b) => a + (b || 0), 0) : 0);
    return {
      title: post.title || post.social_title || null,
      url: post.canonical_url || null,
      publishedAt: post.post_date || null,
      reactions: reactionCount,
      comments: post.comment_count || 0,
      thumbnail: post.cover_image || null,
    };
  } catch {
    return null;
  }
}

/**
 * Lazy-hydration fallback for a publication not yet in our DB. Best-effort
 * identity only (name + logo via the subdomain homepage API). The subscriber
 * bucket isn't available here — it only comes from the category leaderboard —
 * so the profile renders identity now and fills metrics on the next daily
 * collection once discovery picks the publication up.
 */
export async function getSubstackPublication(input) {
  const parsed = parseSubstackHandle(input);
  if (!parsed) return null;
  try {
    const res = await fetch(`https://${parsed.slug}.substack.com/api/v1/homepage_data`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // homepage_data nests the publication under various blocks; the most
    // reliable identity is in the first content block's publication fields.
    const pub = data?.pub || data?.publication || null;
    if (!pub) {
      // Minimal shell so the page can render the slug as a name.
      return {
        platform: 'substack',
        platformId: null,
        username: parsed.slug,
        displayName: parsed.slug,
        profileImage: null,
        description: null,
        subscribers: null,
        followers: null,
        totalViews: null,
        totalPosts: null,
        profileUrl: buildSubstackUrl(parsed.slug),
      };
    }
    return normalizePublication(pub);
  } catch {
    return null;
  }
}
