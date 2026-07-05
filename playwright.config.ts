import { defineConfig, devices } from '@playwright/test';

/* E2E config. The webServer block starts the app exactly the way a human does
   (`npm run dev` → vite), so the e2e path matches the human path. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  /* Vite serves the app unbundled in dev, so a cold page load can spike past
     Playwright's 30s default on a low-core machine as the suite grows. Give
     each test headroom rather than letting infra tail-latency flake the run. */
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /electron\.smoke\.spec\.ts/,
    },
    /* Firefox is scoped to the print spec: print pagination differs between
       engines, so the print break behaviour must be proven on Firefox too. */
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /printPageBreaks\.spec\.ts/,
    },
    /* Desktop-shell security smoke: launches the real Electron build (no vite
       webServer involved) and proves the hardened posture end-to-end. */
    {
      name: 'electron',
      testMatch: /electron\.smoke\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
