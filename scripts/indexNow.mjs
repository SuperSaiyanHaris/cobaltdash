// Tell IndexNow search engines about pages that just changed.
//
//   node scripts/indexNow.mjs --daily                 rankings, hubs, blog index, trending, milestones,
//                                                     plus any story published in the last 3 days
//   node scripts/indexNow.mjs --blog <slug> [...]     specific stories
//   node scripts/indexNow.mjs <url-or-path> [...]     anything else on shinypull.com
//
// Never fails the caller: a ping that doesn't land just means the engines find
// the page on their normal crawl.
import 'dotenv/config';
import { PLATFORM_IDS } from '../src/lib/constants.js';
import { INDEXNOW_HOST, INDEXNOW_KEY, INDEXNOW_KEY_URL, dailyUrls, toAbsolute } from '../src/lib/indexNow.js';

const args = process.argv.slice(2);
const urls = new Set();

// Stories from the last few days, so a post is never missed even if nobody
// pinged for it.
async function recentStories() {
  try {
    const base = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return [];
    const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`${base}/rest/v1/blog_posts?is_published=eq.true&published_at=gte.${since}&select=slug&limit=50`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? (await res.json()).map((r) => r.slug) : [];
  } catch {
    return [];
  }
}

let mode = 'url';
for (const a of args) {
  if (a === '--daily') {
    dailyUrls(PLATFORM_IDS).forEach((u) => urls.add(u));
    for (const slug of await recentStories()) urls.add(`https://${INDEXNOW_HOST}/blog/${slug}`);
  } else if (a === '--blog') {
    mode = 'blog';
  } else if (!a.startsWith('--')) {
    if (mode === 'blog') urls.add(`https://${INDEXNOW_HOST}/blog/${a.replace(/^\/?blog\//, '')}`);
    else {
      const abs = toAbsolute(a);
      if (abs) urls.add(abs);
    }
  }
}

const urlList = [...urls];
if (!urlList.length) {
  console.log('IndexNow: nothing to send.');
  process.exit(0);
}

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_URL, urlList }),
    signal: AbortSignal.timeout(15000),
  });
  // 200 and 202 both mean accepted.
  console.log(`IndexNow: ${urlList.length} URL(s) sent, HTTP ${res.status}`);
  for (const u of urlList.slice(0, 15)) console.log('  ' + u);
} catch (err) {
  console.log(`IndexNow: could not send (${err.message}). The engines will find the pages on their next crawl.`);
}
