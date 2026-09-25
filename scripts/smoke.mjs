/**
 * Live-site smoke test: fetches the pages and endpoints that matter and checks
 * each returns what it should. Read-only, no credentials. Runs after every
 * production deploy and every few hours (.github/workflows/live-checks.yml);
 * run by hand with `npm run smoke` (BASE_URL overrides the target).
 *
 * Exits non-zero listing every failed check, so a broken deploy shows up as a
 * red run (and GitHub's failure email) within minutes.
 */

const BASE = (process.env.BASE_URL || 'https://shinypull.com').replace(/\/$/, '');
const TIMEOUT_MS = 20000;

// One retry on a network-level failure (connection reset, DNS blip) so a
// transient hiccup isn't reported as an outage. Wrong status/content is never
// retried: that's a real failure.
async function fetchOnceMore(url, init) {
  try {
    return await fetch(url, init());
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    return fetch(url, init());
  }
}

async function get(path, headers = {}) {
  const res = await fetchOnceMore(BASE + path, () => ({ headers: { 'user-agent': 'ShinyPull-smoke/1.0', ...headers }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) }));
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') || '', text };
}

const robotsOf = (html) => (html.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || 'index';
const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const rowsOf = (html) => (html.match(/<tr>/g) || []).length;

const checks = [
  ['home page loads', async () => {
    const r = await get('/');
    expect(r.status === 200, `status ${r.status}`);
    expect(titleOf(r.text).includes('ShinyPull'), `title "${titleOf(r.text)}"`);
    const js = r.text.match(/src="(\/assets\/[^"]+\.js)"/);
    expect(js, 'no entry script tag');
    const bundle = await get(js[1]);
    expect(bundle.status === 200 && bundle.text.length > 1000, `entry bundle ${js[1]} -> ${bundle.status}`);
  }],
  ['big-name profile is server-rendered and indexable (MrBeast)', async () => {
    const r = await get('/youtube/mrbeast');
    expect(r.status === 200, `status ${r.status}`);
    expect(/MrBeast YouTube Stats: [\d.]+[MB] Subscribers/.test(titleOf(r.text)), `title "${titleOf(r.text)}"`);
    expect(robotsOf(r.text) === 'index', `robots ${robotsOf(r.text)}`);
    expect(r.text.includes('How much does MrBeast make?'), 'earnings section missing');
  }],
  ['Kick profile is indexable with earnings', async () => {
    const r = await get('/kick/xqc');
    expect(robotsOf(r.text) === 'index', `robots ${robotsOf(r.text)}`);
    expect(/Paid subscribers/i.test(titleOf(r.text)), `title "${titleOf(r.text)}"`);
    expect(/up to about \$[\d,]+ per month/.test(r.text), 'Kick earnings ceiling missing');
  }],
  ['rankings page lists creators', async () => {
    const r = await get('/rankings/twitch');
    expect(r.status === 200, `status ${r.status}`);
    expect(r.text.includes('KaiCenat') || r.text.includes('kaicenat'), 'top Twitch creator missing from server-rendered list');
  }],
  ['Kick earnings leaderboard has 100 rows', async () => {
    const r = await get('/kick/earnings');
    expect(rowsOf(r.text) >= 100, `${rowsOf(r.text)} rows`);
  }],
  ['live counter pages are noindexed', async () => {
    const r = await get('/live/twitch/kaicenat');
    expect(robotsOf(r.text).startsWith('noindex'), `robots ${robotsOf(r.text)}`);
  }],
  ['stats badge renders', async () => {
    const r = await get('/badge/youtube/mrbeast');
    expect(r.status === 200 && r.type.includes('image/svg+xml'), `status ${r.status} ${r.type}`);
    expect(/MrBeast: [\d.]+[MB] subscribers/.test(r.text), 'badge count missing');
  }],
  ['creator card renders with rarity and avatar', async () => {
    const r = await get('/card/twitch/kaicenat');
    expect(r.status === 200 && r.type.includes('image/svg+xml'), `status ${r.status} ${r.type}`);
    expect(r.text.includes('>LEGENDARY<'), 'rarity missing');
    expect(r.text.includes('href="data:image/'), 'avatar not embedded');
  }],
  ['unknown badge 404s', async () => {
    expect((await get('/badge/youtube/zz-no-such-creator-zz')).status === 404, 'expected 404');
  }],
  ['sitemap index and core sitemap', async () => {
    const idx = await get('/sitemap.xml');
    const n = (idx.text.match(/<sitemap>/g) || []).length;
    expect(idx.status === 200 && n >= 3, `sitemap index: status ${idx.status}, ${n} children`);
    const core = await get('/sitemap-core.xml');
    expect(core.text.includes('/kick/earnings') && core.text.includes('/badge<'), 'core sitemap missing new pages');

  }],
  ['removed platforms redirect away (Rumble)', async () => {
    for (const path of ['/rumble/Bongino', '/rankings/rumble']) {
      const r = await get(path);
      expect([301, 308].includes(r.status), `${path} -> ${r.status}, expected a permanent redirect`);
    }
  }],
  ['robots.txt', async () => {
    const r = await get('/robots.txt');
    expect(r.text.includes('Sitemap: https://shinypull.com/sitemap.xml'), 'sitemap line missing');
    expect(!/^Disallow: \/live\//m.test(r.text), '/live/ is disallowed again (hides its noindex)');
  }],
  ['platform proxy rejects outside callers', async () => {
    // Unique URL: a CDN-cached copy (from our own pages) is served without
    // reaching the guard by design, so bypass the cache to test the function.
    const r = await get(`/api/youtube?action=getChannel&id=UCX6OQ3DkcsbYNE6H8uQQuVA&smoke=${Date.now()}`);
    expect(r.status === 403, `expected 403, got ${r.status}`);
  }],
  ['platform proxy serves our pages', async () => {
    const r = await get('/api/youtube?action=getChannel&id=UCX6OQ3DkcsbYNE6H8uQQuVA', { 'sec-fetch-site': 'same-origin' });
    expect(r.status === 200 && r.text.includes('"platformId"'), `status ${r.status}`);
  }],
  ['cron endpoint requires the secret', async () => {
    const r = await get('/api/cron/stream-monitor');
    expect(r.status === 401, `expected 401 (503 means CRON_SECRET is missing), got ${r.status}`);
  }],
  ['update-creator rejects other origins', async () => {
    const res = await fetchOnceMore(BASE + '/api/update-creator', () => ({ method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(TIMEOUT_MS) }));
    expect(res.status === 403, `expected 403, got ${res.status}`);
  }],
  ['security headers', async () => {
    const res = await fetchOnceMore(BASE + '/', () => ({ signal: AbortSignal.timeout(TIMEOUT_MS) }));
    for (const h of ['content-security-policy', 'strict-transport-security', 'x-content-type-options']) {
      expect(res.headers.get(h), `${h} missing`);
    }
  }],
];

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

let failed = 0;
console.log(`Smoke testing ${BASE}\n`);
for (const [name, fn] of checks) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ✅ ${name} (${Date.now() - t0}ms)`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
