import { describe, it, expect, vi } from 'vitest';
import { isFromOurSite } from '../../api/_guard.js';

process.env.YOUTUBE_API_KEY = 'test';
const { default: youtube } = await import('../../api/youtube.js');

async function call(handler, { method = 'GET', headers = {}, query = {} } = {}) {
  const out = { headers: {} };
  const res = { setHeader(k, v) { out.headers[k] = v; }, status(s) { out.status = s; return this; }, json(j) { out.body = j; return this; }, end() { return this; } };
  await handler({ method, headers: { 'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 250)}`, ...headers }, query }, res);
  return out;
}

describe('isFromOurSite', () => {
  it('accepts our pages', () => {
    expect(isFromOurSite({ headers: { origin: 'https://shinypull.com' } })).toBe(true);
    expect(isFromOurSite({ headers: { 'sec-fetch-site': 'same-origin' } })).toBe(true);
    expect(isFromOurSite({ headers: { referer: 'https://www.shinypull.com/youtube/mrbeast' } })).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isFromOurSite({ headers: {} })).toBe(false);
    expect(isFromOurSite({ headers: { origin: 'https://evil.example' } })).toBe(false);
    expect(isFromOurSite({ headers: { referer: 'https://shinypull.com.evil.example/' } })).toBe(false);
    expect(isFromOurSite({ headers: { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' } })).toBe(false);
  });
});

describe('/api/youtube proxy', () => {
  it('403s callers that are not our site (curl, other sites)', async () => {
    expect((await call(youtube, { query: { action: 'search', query: 'x' } })).status).toBe(403);
    expect((await call(youtube, { headers: { origin: 'https://evil.example' }, query: { action: 'search', query: 'x' } })).status).toBe(403);
  });
  it('only allows GET', async () => {
    expect((await call(youtube, { method: 'POST', headers: { origin: 'https://shinypull.com' } })).status).toBe(405);
  });
  it('caps searches per visitor (100 quota units each)', async () => {
    const headers = { 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '10.9.9.9' };
    const statuses = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ items: [] })));
    for (let i = 0; i < 10; i++) {
      statuses.push((await call(youtube, { headers, query: { action: 'search', query: 'mrbeast' } })).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});
