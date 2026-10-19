// The routes the app really serves. middleware.js answers anything else with a
// real HTTP 404 (it used to answer 200 with the home page, which Google files
// as a soft 404). tests/unit/knownRoutes.test.js reads src/App.jsx and fails if
// a route is added there without being allowed here, so a new page can't be
// served with a 404 status by mistake.

const PLATFORMS = 'youtube|tiktok|twitch|kick|bluesky|music|mastodon|substack';

const STATIC_PATHS = new Set([
  '/', '/about', '/account', '/admin', '/auth/reset', '/auth/sign-in', '/auth/sign-up',
  '/badge', '/best', '/blog', '/blog/admin', '/card', '/compare', '/contact', '/dashboard',
  '/faq', '/kick/earnings', '/methodology', '/milestones', '/newsletter/unsubscribe',
  '/pass', '/privacy', '/promote', '/rankings', '/refunds', '/replies', '/search', '/support',
  '/terms', '/trending', '/youtube/money-calculator',
  // Served by the middleware's page map but not listed in App.jsx.
  '/reports', '/reset-password',
]);

const PATTERNS = [
  new RegExp(`^/(${PLATFORMS})/[^/]+$`),            // creator profile
  new RegExp(`^/live/(${PLATFORMS})/[^/]+$`),
  new RegExp(`^/s/(${PLATFORMS})/[^/]+$`),
  new RegExp(`^/(badge|card)/(${PLATFORMS})/[^/]+$`),
  new RegExp(`^/rankings/(${PLATFORMS})$`),
  /^\/best\/[^/]+$/,                                // unknown hub slugs 404 in getMeta
  /^\/blog\/[^/]+$/,                                // unknown posts 404 once the DB answers
  /^\/admin\/users\/[^/]+$/,
  /^\/u\/[^/]+$/,
];

/** True for a path the app serves. Tolerates one trailing slash. */
export function isKnownRoute(pathname) {
  if (/^\/(_vercel|_next|\.well-known)(\/|$)/.test(pathname)) return true;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (STATIC_PATHS.has(p)) return true;
  return PATTERNS.some((re) => re.test(p));
}
