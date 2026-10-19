import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isKnownRoute } from '../../src/lib/knownRoutes.js';

// Every route declared in src/App.jsx must be allowed, or the middleware would
// answer that page with a 404 status.
describe('isKnownRoute', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const declared = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');
  const sample = (p) => p
    .replace(':platform', 'twitch').replace(':username', 'someone')
    .replace(':slug', 'a-slug').replace(':handle', 'somebody').replace(':id', '123');

  it('finds the routes in App.jsx', () => {
    expect(declared.length).toBeGreaterThan(25);
  });

  it.each(declared)('allows %s', (p) => {
    expect(isKnownRoute(sample(p))).toBe(true);
  });

  it('allows profiles, rankings, hubs, posts and a trailing slash', () => {
    for (const p of ['/twitch/kaicenat', '/bluesky/someone.bsky.social', '/rankings/kick', '/best/anything', '/blog/a-post', '/rankings/', '/_vercel/insights/view']) {
      expect(isKnownRoute(p)).toBe(true);
    }
  });

  it('rejects paths the app does not serve', () => {
    for (const p of ['/nonexistent-page', '/instagram/someone', '/rankings/rumble', '/twitch', '/a/b/c', '/wp-login', '/phpmyadmin/index']) {
      expect(isKnownRoute(p)).toBe(false);
    }
  });
});
