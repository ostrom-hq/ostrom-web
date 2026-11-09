import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { parseSync, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import {
  BOOTED,
  type BootCall,
  type BootRoute,
  bootScript,
  ORG_CHOICE_KEY,
} from './src/shared/build/bootScript';
import { bootChunkOf } from './src/shared/build/bootChunk';
import { patternOf, routesOf } from './src/shared/build/routes';
import { screenWording, sectionsIn } from './src/shared/build/screenWording';
import { importParts, importSources, type PartsByName, splitModule } from './src/shared/build/splitModule';
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

/** The API client the generator writes, a module each for every call, schema and query of the contract. */
const GENERATED = /[\\/]gen[\\/]api[\\/](?:zod\.gen|sdk\.gen|@tanstack[\\/]react-query\.gen)\.ts$/;
/** The id of one declaration of a generated module, as its own module: `<prefix><file>#<name>`. */
const GENERATED_PART = '\0ostrom-generated:';

/**
 * Each call, schema and query of the generated API client in a module of its own (src/shared/build/splitModule.ts):
 * the build puts a module in one chunk, whole, and the three generated modules held every call and schema of the
 * console, all of it in the first download, built and parsed before the first paint. Split, a screen loaded later
 * brings the calls and schemas it uses. The build fails on a generated module it cannot split, rather than leave
 * the client whole without a word.
 */
function splitGenerated(): Plugin {
  // By generated file, the part of each name it exports.
  const split = new Map<string, PartsByName>();
  const parts = new Map<string, string>();
  const fileOf = (part: string): string => part.slice(GENERATED_PART.length, part.lastIndexOf('#'));
  return {
    name: 'ostrom:split-generated',
    apply: 'build',
    enforce: 'post',
    async resolveId(source, importer) {
      if (source.startsWith(GENERATED_PART)) return source;
      // A part imports as the generated module did: relative to its file.
      if (importer?.startsWith(GENERATED_PART) === true)
        return this.resolve(source, fileOf(importer), { skipSelf: true });
      return null;
    },
    load(id) {
      return id.startsWith(GENERATED_PART) ? (parts.get(id) ?? null) : null;
    },
    async transform(code, id) {
      // The imports of a module from the generated ones, taken from their parts (`importer`: where they resolve from).
      const fromParts = async (source: string, importer: string): Promise<string | undefined> => {
        if (!source.includes('.gen')) return undefined;
        const program = parseSync('module.js', source).program;
        const bySource = new Map<string, PartsByName>();
        for (const imported of importSources(program)) {
          const resolved = await this.resolve(imported, importer);
          if (resolved === null || !GENERATED.test(resolved.id)) continue;
          // Split before its first importer is rewritten: the parts are named by the split.
          if (!split.has(resolved.id)) await this.load({ id: resolved.id });
          const byName = split.get(resolved.id);
          if (byName !== undefined) bySource.set(imported, byName);
        }
        return importParts(source, program, bySource);
      };
      if (!GENERATED.test(id)) {
        const rewritten = await fromParts(code, id);
        return rewritten === undefined ? null : { code: rewritten, map: null };
      }
      const done = splitModule(
        code,
        parseSync('module.js', code).program,
        (name) => `${GENERATED_PART}${id}#${name}`,
      );
      if (done === undefined) throw new Error(`${id}: not only imports and declarations, it cannot be split`);
      const byName = new Map<string, string>();
      for (const part of done.parts) {
        const address = `${GENERATED_PART}${id}#${part.names[0] ?? ''}`;
        // A part of the queries imports the calls, and a call its schemas: from their parts too.
        parts.set(address, (await fromParts(part.code, id)) ?? part.code);
        for (const name of part.names) byName.set(name, address);
      }
      split.set(id, byName);
      return { code: done.facade, map: null };
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

/**
 * The screens of one organization (src/shared/org/WithOrg.tsx, and the shared accounts' screens): each reads `/orgs`
 * before anything of its own, since those reads name the organization the list says it is. Left to the console,
 * `/orgs` would start once the entry has run, after the reads of `/boot.js` are in, and the screen's own reads one
 * answer later still: a chain of three calls (loading.spec.ts). Started from the head, it is in with the others.
 */
const IN_ONE_ORG = [
  '/members',
  '/github',
  '/mcp',
  '/policy',
  '/secrets',
  '/import',
  '/billing',
  '/settings',
  '/accounts',
  '/accounts/groups',
  '/accounts/groups/$groupId',
] as const;

/** The reads a screen's own first paint waits for, beyond FIRST_READS, as the console asks them at its start. */
const SCREEN_READS: Readonly<Record<string, readonly BootCall[]>> = {
  ...Object.fromEntries(IN_ONE_ORG.map((path) => [path, [ORGS]])),
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

/** The boot chunk's answers, module by module (src/shared/build/bootChunk.ts): the graph of the one build. */
const initialModules = new Map<string, boolean>();

/** The screens open to someone not signed in: nothing to read for them before the entry. */
const SIGNED_OUT = new Set(['/signin', '/auth/email', '/invite']);

/** An object read as a record of its keys: a module's namespace, a wording. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Starts, from the page's head, what the first screen needs, instead of once the entry has run: `/boot.js`, a file
 * from 'self' as the CSP allows, loaded `async` so it holds nothing up.
 * - The wording of the person's language, first: src/shared/i18n/i18n.ts waits for it before the first render.
 *   Measured on slow 4G, CPU ×4: without it, about 90 ms more before the first paint. For a route of the router, only
 *   the sections its first download and screen chunks name (src/shared/build/screenWording.ts), a JSON file of a few
 *   KB fetched in place of the whole language, which the console loads once the screen is up
 *   (src/shared/i18n/firstWording.ts); elsewhere, and with the mock API, the whole language's chunk
 *   (src/shared/i18n/languageScript.ts).
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
    async generateBundle(_options, bundle) {
      const wording: Record<string, string> = {};
      const words = new Map<string, Readonly<Record<string, unknown>>>();
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        const language = LANGUAGE_MODULE.exec(file.facadeModuleId ?? '')?.[1];
        if (language === undefined) continue;
        wording[language] = `${base}${file.fileName}`;
        // Read from the chunk the build wrote, a module that imports nothing (`export { … as en }`).
        const module: unknown = await import(
          `data:text/javascript;base64,${Buffer.from(file.code).toString('base64')}`
        );
        const read: unknown = isRecord(module) ? module[language] : undefined;
        if (!isRecord(read)) throw new Error(`the wording chunk of ${language} exports no ${language}`);
        words.set(language, read);
      }
      // Every language the console speaks has its file there (LANGUAGES of src/shared/i18n/types.ts).
      const languages = readdirSync(fileURLToPath(new URL('./src/shared/i18n/locales', import.meta.url))).map(
        (name) => name.replace(/\.ts$/, ''),
      );
      // Fails the build on a language without its chunk, as with mocks, where it is the whole of /boot.js.
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
      const sectionsOf = new Map<string, ReadonlySet<string>>();
      const sectionNames = Object.keys(words.get('en') ?? {});
      const named = (file: string): ReadonlySet<string> => {
        const known = sectionsOf.get(file);
        if (known !== undefined) return known;
        const found = sectionsIn(byName.get(file)?.code ?? '', sectionNames);
        sectionsOf.set(file, found);
        return found;
      };
      // One file per set of sections and language, however many routes share it.
      const emitted = new Map<string, string>();
      const wordingsOf = (files: Iterable<string>): Record<string, string> => {
        const sections = new Set<string>();
        for (const file of files) for (const section of named(file)) sections.add(section);
        const urls: Record<string, string> = {};
        for (const [spoken, all] of words) {
          const source = JSON.stringify(screenWording(all, sections));
          let url = emitted.get(source);
          if (url === undefined) {
            const reference = this.emitFile({ type: 'asset', name: `wording-${spoken}.json`, source });
            url = `${base}${this.getFileName(reference)}`;
            emitted.set(source, url);
          }
          urls[spoken] = url;
        }
        return urls;
      };
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
            // What the first download and the screen's own chunks name: all its first paint can show.
            wordings: wordingsOf([...entry, ...own]),
            // The screen's own reads first: on a slow link the six connections are taken, and the reads asked last wait
            // for one to come free. Who is signed in and their organizations show in the top bar, not in the screen's
            // first paint (its organization is `/orgs`, src/shared/org/useCurrentOrg.ts): they can wait their turn.
            calls: SIGNED_OUT.has(route.path) ? [] : [...(SCREEN_READS[route.path] ?? []), ...FIRST_READS],
          };
        },
      );
      this.emitFile({
        type: 'asset',
        fileName: 'boot.js',
        source: bootScript(routes, { languages: wording, storageKey: ORG_CHOICE_KEY, store: BOOTED }),
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

/** The console's own version, shown in the settings next to the server's (`package.json`, bumped by release-please). */
const consoleVersion = (
  JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8')) as { version: string }
).version;

export default defineConfig({
  define: { 'import.meta.env.VITE_OSTROM_CONSOLE_VERSION': JSON.stringify(consoleVersion) },
  plugins: [react(), splitGenerated(), dropMockWorkerUnlessMocks(), preloadBoot(), reportModules()],
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
              priority: 1,
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?zod[\\/]|[\\/]src[\\/]shared[\\/]lib[\\/]zodConfig\.ts$/,
            },
            // Everything the entry loads anyway in one chunk (react, the router, i18n, the API client), and the parts
            // the screens share (src/shared/build/bootChunk.ts): on a slow link, fifteen small files share the
            // bandwidth and each waits its turn, where one comes in a single response. What a lazy screen alone uses
            // stays in its own chunk.
            {
              name: (id, graph) =>
                bootChunkOf(id, graph, initialModules, (module) => module.startsWith(GENERATED_PART)),
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
