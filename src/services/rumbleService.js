/**
 * Rumble integration — public HTML scraping (no API exists).
 *
 * Rumble channels live at either `/c/{slug}` (channels) or `/user/{slug}`
 * (user accounts). We store the `c:slug` or `user:slug` prefix in
 * `platform_id` so we can rebuild the right URL on lookup. The `username`
 * column holds the bare slug for clean shinypull.com URLs.
 *
 * Parsing: Rumble's channel pages embed follower / video counts as plain
 * text in HTML elements with predictable class names. We grab the page,
 * regex out the numbers, and normalize to our schema.
 */

const BASE = 'https://rumble.com';

// Browser-ish UA so cloudfront doesn't 403 us
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Parse a "3.64M", "12.5K", "1.2B", or plain "1234" number into an integer.
 */
function parseAbbreviated(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/,/g, '').trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) {
    const direct = parseInt(cleaned, 10);
    return Number.isNaN(direct) ? 0 : direct;
  }
  const num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') return Math.round(num * 1_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

/**
 * Strip HTML entities + tags from a description blob.
 */
function cleanText(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

/**
 * Given a Rumble channel page HTML, extract the data points we store.
 * Returns the normalized profile shape used by the rest of the app.
 *
 * The parser is intentionally permissive — Rumble has changed class names
 * before. We try multiple selectors and fall back gracefully.
 */
export function parseChannelHtml(html, { slug, kind, profileUrl }) {
  if (!html) return null;

  // Display name — `<h1 class="channel-header--title">` or `<h1>` near top
  const titleMatch =
    html.match(/<h1[^>]*class="[^"]*channel-header--title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  const displayName = titleMatch ? cleanText(titleMatch[1]) : slug;

  // Avatar from og:image or the channel header img tag. `channel-header--img`
  // is the newer template's class; `channel-header--thumbnail` is the old one.
  const avatarMatch =
    html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
    html.match(/class="channel-header--img"[^>]*src="([^"]+)"/i) ||
    html.match(/class="channel-header--thumbnail"[^>]*src="([^"]+)"/i);
  const profileImage = avatarMatch ? avatarMatch[1] : null;

  // Description / bio
  const descMatch =
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
    html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  const description = descMatch ? cleanText(descMatch[1]) : null;

  // Followers — visible label is "Followers"; the number is in a span just before it.
  // Look for variants like `data-test="follower-count"` or the labeled pair.
  let followers = 0;
  const followerPatterns = [
    // Newer channel-header template: `<span>1 Follower</span>` / `<span>12.5K Followers</span>`
    // (note singular "Follower" when the count is 1).
    /<span>\s*([\d.,]+\s*[KMB]?)\s*Followers?\s*<\/span>/i,
    /<span[^>]*data-test="follower-count"[^>]*>([\d.,KMB\s]+)<\/span>/i,
    /([\d.,]+\s*[KMB]?)<\/span>\s*<span[^>]*>\s*Followers?/i,
    /<div[^>]*class="[^"]*listing-header--followers[^"]*"[^>]*>\s*<span[^>]*>([\d.,KMB\s]+)<\/span>/i,
    />\s*([\d.,]+\s*[KMB])\s*Followers?\b/i,
    />\s*([\d,]+)\s*Followers?\b/i,
  ];
  for (const re of followerPatterns) {
    const m = html.match(re);
    if (m && m[1]) {
      followers = parseAbbreviated(m[1]);
      if (followers > 0) break;
    }
  }

  // Video count — Rumble shows "X videos" near the channel header
  let totalPosts = 0;
  const videoPatterns = [
    /<span[^>]*data-test="video-count"[^>]*>([\d.,KMB\s]+)<\/span>/i,
    />\s*([\d.,]+\s*[KMB]?)\s*videos?\b/i,
    /<span[^>]*>([\d,]+)<\/span>\s*<span[^>]*>\s*Videos/i,
  ];
  for (const re of videoPatterns) {
    const m = html.match(re);
    if (m && m[1]) {
      totalPosts = parseAbbreviated(m[1]);
      if (totalPosts > 0) break;
    }
  }
  // Newer template has no "X videos" label. Fall back to counting the distinct
  // videos rendered in the listing (each has a `data-video-id`). Rumble pages
  // the listing at ~25 per page, so a count at/above that almost certainly means
  // there are more we can't see — in that case we DON'T guess (leave it unset)
  // rather than publish a misleadingly low number. Below the page size, the
  // whole catalog is on the page, so the count is exact. This is the small-
  // creator case, which is exactly who needs an accurate count.
  if (!totalPosts) {
    const ids = new Set([...html.matchAll(/data-video-id=["'](\d+)["']/g)].map((m) => m[1]));
    if (ids.size > 0 && ids.size < 24) totalPosts = ids.size;
  }

  // Banner image at the top of the channel
  let bannerImage = null;
  const bannerMatch = html.match(/class=["']?channel-header--backsplash-img["']?[^>]*src=["']([^"']+)["']/i);
  if (bannerMatch) bannerImage = bannerMatch[1];

  // Verified badge presence
  const verified = /channel-header--verified|verification-badge-icon/i.test(html);

  // Latest video (first thumbnail in the grid)
  let latestPost = null;
  const videoBlockMatch = html.match(/<div\s+class=["']videostream[^"']*["'][\s\S]*?data-video-id=["'](\d+)["'][\s\S]*?<\/address>/i);
  if (videoBlockMatch) {
    const block = videoBlockMatch[0];
    const linkMatch = block.match(/href=["'](\/v[^"'?]+\.html)/i);
    const titleAttrMatch = block.match(/<h3[^>]*title=["']([^"']+)["']/i)
      || block.match(/<h3[^>]*>\s*([^<]+?)\s*<\/h3>/i);
    const dateMatch = block.match(/<time[^>]*datetime=["']([^"']+)["']/i);
    const viewsMatch = block.match(/data-views=["'](\d+)["']/i);
    const thumbMatch = block.match(/class=["']thumbnail__image[^"']*["']\s+[^>]*src=["']([^"']+)["']/i);
    if (linkMatch && titleAttrMatch) {
      latestPost = {
        url: `${BASE}${linkMatch[1]}`,
        title: cleanText(titleAttrMatch[1]),
        publishedAt: dateMatch ? dateMatch[1] : null,
        views: viewsMatch ? parseInt(viewsMatch[1], 10) : null,
        thumbnail: thumbMatch ? thumbMatch[1] : null,
      };
    }
  }

  return {
    platform: 'rumble',
    platformId: `${kind}:${slug}`,
    username: slug,
    displayName,
    profileImage,
    bannerImage,
    verified,
    description,
    country: null,
    category: null,
    subscribers: followers,
    followers,
    totalPosts,
    totalViews: null, // Aggregating per-video view counts would require N extra requests; skip for v1
    latestPost,
    profileUrl,
  };
}

/**
 * Parse an input that might be:
 *   - a bare slug like `Bongino`
 *   - a `c:Bongino` or `user:Viva` platform_id
 *   - a full URL like `https://rumble.com/c/Bongino`
 * Returns `{ slug, kind, profileUrl }`.
 */
export function parseRumbleHandle(input, defaultKind = 'c') {
  if (!input) return null;
  const raw = String(input).trim();

  // Full URL
  const urlMatch = raw.match(/rumble\.com\/(c|user)\/([^/?#\s]+)/i);
  if (urlMatch) {
    const kind = urlMatch[1].toLowerCase();
    const slug = urlMatch[2];
    return { kind, slug, profileUrl: `${BASE}/${kind}/${slug}` };
  }

  // `c:Bongino` / `user:Viva` form
  const prefixed = raw.match(/^(c|user):(.+)$/i);
  if (prefixed) {
    const kind = prefixed[1].toLowerCase();
    const slug = prefixed[2];
    return { kind, slug, profileUrl: `${BASE}/${kind}/${slug}` };
  }

  // Bare slug — assume default kind (channel)
  return { kind: defaultKind, slug: raw, profileUrl: `${BASE}/${defaultKind}/${raw}` };
}

/**
 * Fetch a Rumble channel by slug, prefixed id (`c:slug` / `user:slug`), or URL.
 *
 * Routes through `/api/rumble` instead of hitting rumble.com directly so that
 * CORS doesn't reject the browser fetch (Rumble doesn't send
 * `Access-Control-Allow-Origin`). The serverless proxy fetches the HTML, parses
 * the data, and returns the normalized profile.
 *
 * For server-side scripts (collectDailyStats, seed, discovery) — those import
 * parseChannelHtml directly and hit rumble.com via plain fetch; that works
 * because there's no browser sandbox.
 */
export async function getRumbleChannel(input) {
  const parsed = parseRumbleHandle(input);
  if (!parsed) return null;

  const id = `${parsed.kind}:${parsed.slug}`;
  const url = `/api/rumble?id=${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Browse a Rumble category page (e.g. `news`, `gaming`, `entertainment`).
 * Returns an array of `{ kind, slug }` for channels discovered on that page.
 * Used by both the seed and discovery scripts.
 */
export async function browseCategoryChannels(category, page = 1) {
  const url = `${BASE}/browse/${category}${page > 1 ? `?page=${page}` : ''}`;
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
  // Rumble's edge returns HTTP 410 for /browse pages but serves the full HTML body anyway.
  const html = await res.text();
  if (!html || html.length < 1000) return [];

  // Pull all href="/c/foo" and href="/user/bar" occurrences. Dedupe.
  const seen = new Set();
  const out = [];
  // Rumble appends `?e9s=src_v1_clr` tracking params; match the slug only
  const re = /href="\/(c|user)\/([^"/?#]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = `${m[1]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: m[1], slug: m[2] });
  }
  return out;
}

/**
 * Search Rumble for channels matching a query. Routes through `/api/rumble`
 * with a `search` parameter (server-side handles the search HTML scrape).
 *
 * For now, search-based lookup is disabled in the browser path because doing
 * N+1 fetches through our proxy is expensive. The Search page will fall back
 * to its DB-only path for Rumble — which is fine because we have a seeded
 * catalog.
 */
export async function searchRumble(query, limit = 15) {
  if (!query || !query.trim()) return [];
  // Intentionally empty browser path. Live discovery happens server-side via
  // the daily discovery script and the on-demand /api/rumble lookup when a
  // user navigates to a not-yet-tracked profile URL.
  return [];
}
