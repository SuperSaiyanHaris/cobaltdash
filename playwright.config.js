import { defineConfig, devices } from '@playwright/test';

// Browser tests against the live site (read-only, except the optional signed-in
// test, which only runs with E2E_EMAIL/E2E_PASSWORD set). Run in CI by
// .github/workflows/live-checks.yml after each deploy; locally: npm run test:e2e.
// PW_CHROMIUM_PATH / HTTPS_PROXY let it run inside a sandbox with a
// preinstalled browser behind a proxy.
const launchOptions = {};
if (process.env.PW_CHROMIUM_PATH) launchOptions.executablePath = process.env.PW_CHROMIUM_PATH;
if (process.env.HTTPS_PROXY) launchOptions.proxy = { server: process.env.HTTPS_PROXY };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'https://shinypull.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /public\.spec/ },
  ],
});
