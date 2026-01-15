import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Glance E2E tests.
 *
 * Run tests with: npm run test:e2e
 * Run specific test: npm run test:e2e -- --grep "search"
 * Debug mode: npm run test:e2e -- --debug
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    // Base URL for the local dev server
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying a failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure (helps debug CI issues)
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // Start local dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
