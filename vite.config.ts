import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import {
  BOOTED,
  type BootCall,
  type BootRoute,
  bootScript,
  ORG_CHOICE_KEY,
} from './src/shared/build/bootScript';
import { patternOf, routesOf } from './src/shared/build/routes';
import { languageScript } from './src/shared/i18n/languageScript';

const here = fileURLToPath(new URL('./', import.meta.url));
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

/** The wording chunk of each language, by the module it comes from (src/shared/i18n/locales/<language>.ts). */
const LANGUAGE_MODULE = /[\\/]src[\\/]shared[\\/]i18n[\\/]locales[\\/]([a-z]{2})\.ts$/;

/**
 * The reads every signed-in screen's first paint waits for, as the console asks them at its start (vitals.spec.ts
 * lists them): who is signed in, their organizations, and who they are in the one they chose and kept.
 */
const FIRST_READS: readonly BootCall[] = [
  { path: '/api/v1/auth/me', org: 'none' },
  { path: '/api/v1/me/organizations', org: 'none' },
  { path: '/api/v1/auth/me', org: 'chosen' },
];

/** The person's organizations, read by the screens that show or act in one (src/shared/org/useCurrentOrg.ts). */
const ORGS: BootCall = { path: '/api/v1/orgs', org: 'none' };

/** The reads a screen's own first paint waits for, beyond FIRST_READS, as the console asks them at its start. */
const SCREEN_READS: Readonly<Record<string, readonly BootCall[]>> = {
  '/': [ORGS],
  '/yes': [
    ORGS,
    { path: '/api/v1/approvals?mine=true', org: 'if-chosen' },
    { path: '/api/v1/approvals?status=approved', org: 'if-chosen' },
    { path: '/api/v1/approvals?status=rejected', org: 'if-chosen' },
    { path: '/api/v1/approvals?status=expired', org: 'if-chosen' },
  ],
  '/rules': [ORGS, { path: '/api/v1/rules', org: 'if-chosen' }],
  '/sessions': [
    { path: '/api/v1/sessions?open=true', org: 'if-chosen' },
    { path: '/api/v1/sessions?open=false', org: 'if-chosen' },
  ],
  '/spend': [
    ORGS,
    { path: '/api/v1/spending?period=month', org: 'if-chosen' },
    { path: '/api/v1/budgets', org: 'if-chosen' },
  ],
};

/** The screens open to someone not signed in: nothing to read for them before the entry. */
const SIGNED_OUT = new Set(['/signin', '/auth/email', '/invite']);

/**
 * Starts, from the page's head, what the first screen needs, instead of once the entry has run: `/boot.js`, a file
 * from 'self' as the CSP allows, loaded `async` so it holds nothing up.
 * - The wording of the person's language, first (src/shared/i18n/languageScript.ts): src/shared/i18n/i18n.ts waits
 *   for it before the first render. Measured on slow 4G, CPU ×4: without it, about 90 ms more before the first paint.
 * - For the route opened, its screen's chunks (`modulepreload`), its stylesheets (`preload`) and its first API reads,
 *   which the console then takes up instead of asking again (src/shared/build/bootScript.ts,
 *   src/shared/api/bootFetch.ts). Not with the mock API: its worker starts with the entry, and the reads would miss it.
 * One script for both: on a slow link each file is a request of its own, waiting for a connection.
 */
function preloadBoot(): Plugin {
  let base = '/';
  const mocks = process.env['VITE_MOCKS'] === 'true';
  return {
    name: 'ostrom:preload-boot',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: () => [
      { tag: 'script', attrs: { async: true, src: `${base}boot.js` }, injectTo: 'head-prepend' },
    ],
    generateBundle(_options, bundle) {
      const wording: Record<string, string> = {};
      for (const file of Object.values(bundle)) {
        const language =
          file.type === 'chunk' ? LANGUAGE_MODULE.exec(file.facadeModuleId ?? '')?.[1] : undefined;
        if (language !== undefined) wording[language] = `${base}${file.fileName}`;
      }
      // Every language the console speaks has its file there (LANGUAGES of src/shared/i18n/types.ts).
      const languages = readdirSync(fileURLToPath(new URL('./src/shared/i18n/locales', import.meta.url))).map(
        (name) => name.replace(/\.ts$/, ''),
      );
      const language = languageScript(wording, languages);
      if (mocks) {
        this.emitFile({ type: 'asset', fileName: 'boot.js', source: language });
        return;
      }
      const chunks = Object.values(bundle).flatMap((file) => (file.type === 'chunk' ? [file] : []));
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const closure = (fileName: string, seen: Set<string>): Set<string> => {
        if (seen.has(fileName)) return seen;
        seen.add(fileName);
        for (const imported of byName.get(fileName)?.imports ?? []) closure(imported, seen);
        return seen;
      };
      const entry = new Set<string>();
      for (const chunk of chunks) if (chunk.isEntry) closure(chunk.fileName, entry);
      const routes = routesOf(readFileSync(resolve(src, 'app', 'router.ts'), 'utf8')).map(
        (route): BootRoute => {
          const feature = route.feature;
          const screen =
            feature === undefined
              ? undefined
              : chunks.find((chunk) =>
                  new RegExp(`[\\/]src[\\/]features[\\/]${feature}[\\/]index\\.`).test(
                    chunk.facadeModuleId ?? '',
                  ),
                );
          if (feature !== undefined && screen === undefined)
            throw new Error(`no chunk for the feature ${feature}`);
          const own =
            screen === undefined
              ? []
              : [...closure(screen.fileName, new Set())].filter((file) => !entry.has(file));
          const styles = own.flatMap((file) => [...(byName.get(file)?.viteMetadata?.importedCss ?? [])]);
          return {
            pattern: patternOf(route.path),
            chunks: own.map((file) => `${base}${file}`),
            styles: styles.map((file) => `${base}${file}`),
            calls: SIGNED_OUT.has(route.path) ? [] : [...FIRST_READS, ...(SCREEN_READS[route.path] ?? [])],
          };
        },
      );
      this.emitFile({
        type: 'asset',
        fileName: 'boot.js',
        source: `${language}${bootScript(routes, { storageKey: ORG_CHOICE_KEY, store: BOOTED })}`,
      });
    },
  };
}

/**
 * What each chunk is made of, module by module, as the build rendered it (bytes before compression): written to
 * `.vite/modules.json` beside the manifest, and only when the manifest is asked for (the budget's build, never the
 * image's), for scripts/bundle-budget.ts to name what weighs most in the first download.
 */
function reportModules(): Plugin {
  let manifest = false;
  return {
    name: 'ostrom:report-modules',
    apply: 'build',
    configResolved(config) {
      manifest = config.build.manifest !== false;
    },
    generateBundle(_options, bundle) {
      if (!manifest) return;
      const chunks: Record<string, { id: string; bytes: number }[]> = {};
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        chunks[file.fileName] = Object.entries(file.modules).map(([id, module]) => ({
          // Where it comes from, not the machine's path: a package's name, or the path in the repository.
          id: id
            .replace(/^.*[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?/, 'npm:')
            .replace(here, ''),
          bytes: module.renderedLength,
        }));
      }
      this.emitFile({ type: 'asset', fileName: '.vite/modules.json', source: JSON.stringify(chunks) });
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
  plugins: [react(), dropMockWorkerUnlessMocks(), preloadBoot(), reportModules()],
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
      // A schema is a call (`z.object(…)`), which the build keeps by default even when nothing reads it: the API's
      // 1 032 generated schemas (gen/api/zod.gen.ts) all came in the first download. Every `z.…` call is taken for
      // pure, so a schema nothing reads is dropped. zod's configuration is called as `config(…)` for that reason
      // (src/shared/lib/zodConfig.ts), and scripts/bundle-budget.ts fails a build where it is gone.
      treeshake: { manualPureFunctions: ['z'] },
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
            // Everything the entry loads anyway in one chunk (react, the router, i18n, the API client, the shared
            // screens' parts): on a slow link, fifteen small files share the bandwidth and each waits its turn,
            // where one comes in a single response. What a lazy screen alone uses stays in its own chunk.
            { name: 'boot', tags: ['$initial'] },
            // What several screens share, outside the first download, in one chunk too: split, it came as twenty files
            // of under 1 KB, each waiting for one of the six connections a browser opens on HTTP/1.1 and costing a
            // round trip (/yes: the last one asked at 1.26 s, sent at 2.47 s, in at 3.03 s; console-journey
            // 41722651188). One file, alongside the screen's own, is in after a single round trip.
            { name: 'shared', minShareCount: 2 },
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
