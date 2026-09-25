import { test, expect } from '@playwright/test';

// Signed-in flow. Needs a dedicated test account: set E2E_EMAIL and
// E2E_PASSWORD as repository secrets. Skipped otherwise. It follows a creator,
// checks the dashboard, and leaves the account's follows exactly as it found them.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set');

test('sign in, follow a creator, see it on the dashboard, unfollow', async ({ page }) => {
  await page.goto('/auth/sign-in');
  // Scope to the sign-in form: the footer's newsletter box is also an email field.
  const form = page.locator('form').filter({ has: page.locator('input[type="password"]') });
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth\//, { timeout: 20_000 });

  // This can be a real account, so leave its follows exactly as found:
  // only follow (and later unfollow) xQc if it wasn't followed already.
  await page.goto('/kick/xqc', { waitUntil: 'networkidle' });
  const follow = page.getByRole('button', { name: /^(Follow|Following)$/ });
  await expect(follow).toBeVisible();
  // The button renders "Follow" first and flips once the follow check
  // returns, so give it a moment before reading the real state.
  await page.waitForTimeout(2000);
  const wasFollowing = (await follow.textContent()).trim() === 'Following';
  if (!wasFollowing) {
    await follow.click();
    await expect(follow).toHaveText('Following');
  }

  try {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /xqc/i }).first()).toBeVisible();
  } finally {
    // Undo our follow even when a check above fails.
    if (!wasFollowing) {
      await page.goto('/kick/xqc');
      await page.getByRole('button', { name: 'Following' }).click();
      await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
    }
  }
});
