import { defineConfig } from 'vitest/config';

// Unit + API tests (npm test). Browser tests live in tests/e2e and run with
// Playwright (npm run test:e2e); the live-site smoke check is scripts/smoke.mjs.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/api/**/*.test.js'],
    restoreMocks: true,
  },
});
