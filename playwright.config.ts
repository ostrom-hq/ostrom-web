import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${String(port)}`, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // CI builds with VITE_MOCKS=true just before; locally, build the same way so the journeys test current code.
    command: isCi ? 'pnpm preview' : 'VITE_MOCKS=true pnpm build && pnpm preview',
    port,
    reuseExistingServer: false,
  },
});
