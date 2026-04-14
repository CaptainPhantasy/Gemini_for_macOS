import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for GEMINI for MacOS.
 *
 * The Vite dev server listens on port 13000 (see package.json `dev` script).
 * Tests under ./playwright run against that origin via `baseURL`.
 *
 * `webServer` boots `npm run dev` if no instance is already running so CI
 * runs are self-contained while local re-runs reuse a hot dev server.
 *
 * See Plan v3 Phase 10 for the broader test strategy.
 */
export default defineConfig({
  testDir: './playwright',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:13000',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 13000,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
