// IndexNow: a free, open protocol that tells Bing (which also feeds ChatGPT
// search and Copilot), Yandex and other engines the moment a page is new or
// changed, instead of waiting for them to re-crawl. The key is public by
// design: the engine fetches /<key>.txt to confirm we own the host.
export const INDEXNOW_HOST = 'shinypull.com';
export const INDEXNOW_KEY = 'b0af7e406def6d05d655e1fc381ce46e';
export const INDEXNOW_KEY_URL = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/** Absolute URLs for the pages that change every day. */
export function dailyUrls(platformIds) {
  return [
    `https://${INDEXNOW_HOST}/rankings`,
    ...platformIds.map((p) => `https://${INDEXNOW_HOST}/rankings/${p}`),
    `https://${INDEXNOW_HOST}/best`,
    `https://${INDEXNOW_HOST}/blog`,
    `https://${INDEXNOW_HOST}/trending`,
    `https://${INDEXNOW_HOST}/milestones`,
  ];
}

/** Accepts "/blog/slug", "blog/slug" or a full URL on our host; returns an absolute URL or null. */
export function toAbsolute(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try { return new URL(s).hostname === INDEXNOW_HOST ? s : null; } catch { return null; }
  }
  return `https://${INDEXNOW_HOST}/${s.replace(/^\/+/, '')}`;
}
