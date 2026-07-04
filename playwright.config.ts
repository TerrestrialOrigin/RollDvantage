import { defineConfig, devices } from '@playwright/test';

/* E2E config. The webServer block starts the app exactly the way a human does
   (`npm run dev` → vite), so the e2e path matches the human path. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* Firefox is scoped to the print spec: print pagination differs between
       engines, so the print break behaviour must be proven on Firefox too. */
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /printPageBreaks\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
