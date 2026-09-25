import { test, expect } from '@playwright/test';

// Fail any test whose page throws an uncaught error.
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => { throw err; });
});

test('home search finds a creator and opens their profile', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search any creator').fill('mrbeast');
  await page.getByLabel('Search any creator').press('Enter');
  await expect(page).toHaveURL(/\/search\?q=mrbeast/);
  await page.getByRole('link', { name: /MrBeast/ }).first().click();
  await expect(page).toHaveURL(/\/youtube\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/MrBeast/i);
});

test('profile shows real stats, chart and consistent 30-day numbers', async ({ page }) => {
  await page.goto('/twitch/kaicenat');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/KaiCenat/i);
  await expect(page.getByText('Hours watched', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/daily readings/).first()).toBeVisible();
  // The 30-day stat card and the chart's net must agree (regression test).
  const net = (await page.getByText(/^net [+-]/).first().textContent()).replace(/^net /, '').trim();
  const card = page.locator('p', { hasText: /^30-day followers$/i }).locator('xpath=following-sibling::p[1]');
  await expect(card).toHaveText(net);
});

test('Kick profile shows the sub earnings card', async ({ page }) => {
  await page.goto('/kick/xqc');
  await expect(page.getByText('Estimated sub revenue')).toBeVisible();
  await expect(page.getByText(/^up to \$/).first()).toBeVisible();
});

test('rankings: Twitch Most Watched tab ranks by hours watched', async ({ page }) => {
  await page.goto('/rankings/twitch');
  await expect(page.getByRole('button', { name: /Most Views/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Most Watched/ }).click();
  const rows = page.locator('a[href^="/twitch/"]');
  await expect(rows.nth(9)).toBeVisible();
  await expect(page).toHaveTitle(/Most Watched/);
});

test('rankings: switching platform loads that platform', async ({ page }) => {
  await page.goto('/rankings/youtube');
  await expect(page.locator('a[href^="/youtube/"]').first()).toBeVisible();
  await page.goto('/rankings/kick');
  await expect(page.locator('a[href^="/kick/"]').nth(4)).toBeVisible();
});

test('compare page loads two creators from the URL', async ({ page }) => {
  await page.goto('/compare?creators=youtube:mrbeast,twitch:kaicenat');
  await expect(page.getByText(/MrBeast/).first()).toBeVisible();
  await expect(page.getByText(/KaiCenat/).first()).toBeVisible();
});

test('Kick earnings calculator and leaderboard', async ({ page }) => {
  await page.goto('/kick/earnings');
  await page.getByRole('spinbutton').fill('1000');
  await expect(page.getByText('up to $4,741', { exact: false })).toBeVisible();
  await expect(page.locator('a[href^="/kick/"]').nth(49)).toBeVisible();
});

test('badge maker previews a live badge and gives embed code', async ({ page }) => {
  await page.goto('/badge');
  await page.getByRole('combobox').selectOption('twitch');
  await page.getByLabel('Username').fill('kaicenat');
  await page.getByRole('button', { name: 'Create badge' }).click();
  const preview = page.getByAltText('Your badge preview');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('input[readonly]').first()).toHaveValue(/shinypull\.com\/badge\/twitch\/kaicenat/);
});

test('live counter shows a real count and refresh note', async ({ page }) => {
  await page.goto('/live/twitch/kaicenat');
  await expect(page.getByText(/refreshes every minute/)).toBeVisible();
  await expect(page.getByText(/^Updated /)).toBeVisible();
});
