import { test, expect } from '@playwright/test';

// Signed-in flow. Needs a dedicated test account: set E2E_EMAIL and
// E2E_PASSWORD as repository secrets. Skipped otherwise. It follows a creator,
// checks the dashboard, then unfollows, leaving the account as it found it.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set');

test('sign in, follow a creator, see it on the dashboard, unfollow', async ({ page }) => {
  await page.goto('/auth/sign-in');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth\//, { timeout: 20_000 });

  await page.goto('/kick/xqc');
  const follow = page.getByRole('button', { name: /^(Follow|Following)$/ });
  await expect(follow).toBeVisible();
  if ((await follow.textContent()).trim() === 'Following') await follow.click(); // start clean
  await expect(follow).toHaveText('Follow');
  await follow.click();
  await expect(follow).toHaveText('Following');

  await expect(page.getByRole('link', { name: /xQc/ }).first()).toBeVisible();
  await expect(page.getByText(/xQc/).first()).toBeVisible();

  await page.goto('/kick/xqc');
  await page.getByRole('button', { name: 'Following' }).click();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
});
