// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, devices } from '@playwright/test';

// The journeys against the real server (e2e-real/, CI only): a build without mocks in dist-real, served by `vite
// preview`, which proxies /api to OSTROM_E2E_API_UPSTREAM. One worker: the journeys share one server and database.
const port = 4173;

export default defineConfig({
  testDir: './e2e-real',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-real' }]],
  use: { baseURL: `http://localhost:${String(port)}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'pnpm exec vite preview --outDir dist-real', port, reuseExistingServer: false },
});
