import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));
const ee = fileURLToPath(new URL('./ee', import.meta.url));
const gen = fileURLToPath(new URL('./gen', import.meta.url));
const apiUpstream = process.env['OSTROM_E2E_API_UPSTREAM'];

/** A build without VITE_MOCKS ships no Mock Service Worker at all, so mock data cannot reach a real deploy. */
function dropMockWorkerUnlessMocks(): Plugin {
  let outDir = 'dist';
  return {
    name: 'ostrom:drop-mock-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env['VITE_MOCKS'] !== 'true')
        rmSync(resolve(outDir, 'mockServiceWorker.js'), { force: true });
    },
  };
}

/**
 * The console image's security headers (docker/security-headers.conf), sent by `vite preview` too: the
 * Playwright journeys run under the very policy the image ships (audit S2-09). The image's one variable, the
 * analytics origin of connect-src, is empty here, as in an image without analytics.
 */
function imageSecurityHeaders(): Record<string, string> {
  const path = fileURLToPath(new URL('./docker/security-headers.conf', import.meta.url));
  const conf = readFileSync(path, 'utf8');
  const headers: Record<string, string> = {};
  for (const [, name, value] of conf.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"\s+always;$/gm)) {
    if (name !== undefined && value !== undefined) {
      headers[name] = value.replace(' $ostrom_csp_connect_extra', '');
    }
  }
  if (headers['Content-Security-Policy'] === undefined) {
    throw new Error('docker/security-headers.conf: no Content-Security-Policy line');
  }
  return headers;
}

export default defineConfig({
  plugins: [react(), dropMockWorkerUnlessMocks()],
  resolve: { alias: { '@': src, '@ee': ee, '@gen': gen } },
  server: { port: 5173, strictPort: true },
  preview: {
    port: 4173,
    strictPort: true,
    headers: imageSecurityHeaders(),
    // The journeys against the real server (playwright.real.config.ts): /api goes to it, from the console's origin,
    // as the console image proxies it, so the session cookie and its CSRF token stay first-party.
    ...(apiUpstream === undefined ? {} : { proxy: { '/api': { target: apiUpstream } } }),
  },
  // Nothing inlined as a data: URL: fonts and images come from 'self', the only source the CSP allows.
  build: {
    sourcemap: true,
    target: 'es2023',
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // zod and its configuration in one chunk: every module that parses imports zod, so jitless is set before
          // any schema parses, whichever chunk parses first (a store reading storage as its module loads). Split
          // from the entry, the configuration would run after the shared chunks, and zod's eval probe would be a CSP
          // violation (audit S2-09).
          groups: [
            {
              name: 'zod',
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?zod[\\/]|[\\/]src[\\/]shared[\\/]lib[\\/]zodConfig\.ts$/,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'ee/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Dates read as people see them depend on the zone: every run reads them in UTC, as the CI does.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx only mounts <App/> into the real DOM: covered by the Playwright journeys, not by Vitest.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/test/**', 'src/main.tsx'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
