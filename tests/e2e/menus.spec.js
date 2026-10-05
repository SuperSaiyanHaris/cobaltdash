// Every dropdown, filter and menu on the public pages must open somewhere you
// can see and tap. Runs on desktop and phone (see playwright.config.js).
import { test, expect } from '@playwright/test';
import { auditMenus } from './menuAudit.js';

const PAGES = [
  '/', '/rankings', '/rankings/youtube', '/rankings/tiktok', '/rankings/twitch', '/rankings/kick',
  '/rankings/bluesky', '/rankings/music', '/rankings/mastodon', '/rankings/substack',
  '/trending', '/milestones', '/compare', '/best', '/blog', '/promote', '/card', '/pass',
  '/search?q=mr', '/youtube/money-calculator', '/kick/earnings', '/milestones?platform=youtube',
  '/youtube/mrbeast', '/twitch/kaicenat', '/kick/odablock',
];

for (const path of PAGES) {
  test(`menus are usable on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const res = await page.evaluate(auditMenus);
    expect(res.failures, JSON.stringify(res.failures)).toEqual([]);
  });
}
