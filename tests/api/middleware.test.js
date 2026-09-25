import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

process.env.VITE_SUPABASE_URL = 'https://db.test';
process.env.VITE_SUPABASE_ANON_KEY = 'anon';
const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const { default: middleware } = await import('../../middleware.js');

const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
function creatorRow(over = {}) {
  return {
    id: 'c1', platform_id: '1', username: 'xqc', display_name: 'xQc', description: 'bio', category: null, country: null,
    created_at: '2026-02-10T00:00:00Z', profile_image: null, banner_image: null, verified: false,
    creator_stats: [{ subscribers: 1264, recorded_at: day(0) }, { subscribers: 571, recorded_at: day(30) }],
    rankings_cache: [{ rank_type: 'subscribers', rank_position: 78 }],
    ...over,
  };
}

let rows;
beforeEach(() => {
  rows = [creatorRow()];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/index.html')) return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://db.test/rest/v1/creators')) return new Response(JSON.stringify(rows));
    return new Response('[]');
  });
});

const render = async (path) => (await middleware(new Request('https://shinypull.com' + path))).text();

describe('server-rendered profile pages', () => {
  it('escapes creator-controlled text (no stored XSS)', async () => {
    rows = [creatorRow({ display_name: '<img src=x onerror=alert(1)>', description: '<script>alert("pwned")</script>' })];
    const html = await render('/kick/xqc');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;script&gt;');
    // JSON-LD must not be breakable out of either.
    expect(html).not.toMatch(/<\/script><script>/);
  });

  it('indexes a top-500 Kick streamer and shows the earnings ceiling', async () => {
    const html = await render('/kick/xqc');
    expect(html).not.toContain('name="robots" content="noindex');
    expect(html).toContain('up to about $5,992 per month');
    expect(html).toContain('"@type":"FAQPage"');
  });

  it('noindexes a small creator outside the top tier', async () => {
    rows = [creatorRow({ rankings_cache: [{ rank_type: 'subscribers', rank_position: 15641 }], creator_stats: [{ subscribers: 19995, recorded_at: day(0) }] })];
    expect(await render('/twitch/joker171bet')).toContain('name="robots" content="noindex');
  });

  it('serves the real channel when a copycat shares the username', async () => {
    rows = [
      creatorRow({ id: 'fan', display_name: 'MrBeast Fan', creator_stats: [{ subscribers: 12000, recorded_at: day(0) }] }),
      creatorRow({ id: 'real', display_name: 'MrBeast', creator_stats: [{ subscribers: 518_000_000, recorded_at: day(0) }] }),
    ];
    const html = await render('/youtube/mrbeast');
    expect(html).toContain('MrBeast YouTube Stats: 518');
    expect(html).not.toContain('MrBeast Fan');
  });

  it('noindexes an unknown creator', async () => {
    rows = [];
    expect(await render('/kick/nobody-here')).toContain('name="robots" content="noindex');
  });
});
