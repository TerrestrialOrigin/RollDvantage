import { defineConfig, devices } from '@playwright/test';

/* E2E config. The webServer block starts the app exactly the way a human does
   (`npm run dev` → vite), so the e2e path matches the human path. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  /* The dev script no longer forces a Vite dependency re-optimization on every
     start (`--force` removed), so runs reuse the optimize cache and cold-start
     latency is gone — the slowest observed test is ~3.7s. 30s (Playwright's
     default) keeps ~8x headroom over that, ample on a loaded shared machine,
     without the inflated 60s the `--force` cold start used to need. */
  timeout: 30_000,
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
