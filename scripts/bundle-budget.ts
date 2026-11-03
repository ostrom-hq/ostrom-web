// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The console's download budget, per route: what a first visit to a route fetches, gzipped. That is the entry with
 * the chunks it imports and the wording of one language, the heaviest (the first download, shared by every route),
 * plus the route's own chunk and the chunks it imports. Above its budget (bundle-budget.json: the first download, each
 * route's own chunks, and a ceiling on any first visit), the job fails, and the table says which route and by how much.
 *
 * Usage: node scripts/bundle-budget.ts <dist built with --manifest>
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { checkRouteBudgets, type MeasuredRoute } from '../src/shared/build/routeBudget.ts';
import { routesOf } from '../src/shared/build/routes.ts';

const zManifest = z.record(
  z.string(),
  z.object({
    file: z.string(),
    imports: z.array(z.string()).optional(),
    css: z.array(z.string()).optional(),
    isEntry: z.boolean().optional(),
  }),
);
type Manifest = z.infer<typeof zManifest>;

const zBudget = z.object({
  /** The first download, KiB gzipped. */
  entryKiB: z.number().positive(),
  /** A first visit to any route: the first download plus the route's own chunks, KiB gzipped. */
  routeKiB: z.number().positive(),
  /**
   * Each lazy route's own chunks, KiB gzipped: its measure plus 2 % and 0.2 KiB. A lazy route missing here fails, as
   * does a line without its lazy route (src/shared/build/routeBudget.ts).
   */
  routes: z.record(z.string(), z.number().nonnegative()),
});

/** Every file a chunk brings, its CSS and the chunks it imports, each once. */
function filesOf(manifest: Manifest, key: string, seen = new Set<string>()): Set<string> {
  const chunk = manifest[key];
  if (chunk === undefined) throw new Error(`manifest: no chunk ${key}`);
  if (seen.has(chunk.file)) return seen;
  seen.add(chunk.file);
  for (const css of chunk.css ?? []) seen.add(css);
  for (const imported of chunk.imports ?? []) filesOf(manifest, imported, seen);
  return seen;
}

/** The manifest key of a feature's index, whatever its extension. */
function indexOf(manifest: Manifest, feature: string): string {
  const key = Object.keys(manifest).find((name) => name.startsWith(`src/features/${feature}/index.`));
  if (key === undefined) throw new Error(`manifest: no chunk for the feature ${feature}`);
  return key;
}

const zModules = z.record(z.string(), z.array(z.object({ id: z.string(), bytes: z.number() })));

/** A module's package (`npm:react-dom`) or its place in the repository (`src/features/approvals`). */
function groupOf(id: string): string {
  if (id.startsWith('npm:')) {
    const [scope = '', name = ''] = id.slice(4).split('/');
    return scope.startsWith('@') ? `npm:${scope}/${name}` : `npm:${scope}`;
  }
  return id.split('/').slice(0, 3).join('/');
}

/**
 * The heaviest packages and folders of the first download, before compression, from `.vite/modules.json`
 * (vite.config.ts, `reportModules`): what a smaller first download would have to leave out.
 */
function heaviestOf(dist: string, entry: ReadonlySet<string>): string[] {
  const modules = zModules.parse(JSON.parse(readFileSync(join(dist, '.vite', 'modules.json'), 'utf8')));
  const bytes = new Map<string, number>();
  for (const [file, parts] of Object.entries(modules)) {
    if (!entry.has(file)) continue;
    for (const { id, bytes: size } of parts) bytes.set(groupOf(id), (bytes.get(groupOf(id)) ?? 0) + size);
  }
  const heaviest = [...bytes].toSorted((a, b) => b[1] - a[1]).slice(0, 15);
  return [
    '',
    '**The first download, heaviest first** (KiB before compression):',
    '',
    '| Package or folder | KiB |',
    '|---|---:|',
    ...heaviest.map(([group, size]) => `| \`${group}\` | ${(size / 1024).toFixed(1)} |`),
  ];
}

function main(dist: string): void {
  const manifest = zManifest.parse(JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8')));
  const budget = zBudget.parse(JSON.parse(readFileSync('bundle-budget.json', 'utf8')));
  const sizes = new Map<string, number>();
  const kib = (files: Iterable<string>): number => {
    let bytes = 0;
    for (const file of files) {
      let size = sizes.get(file);
      if (size === undefined) {
        size = gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
        sizes.set(file, size);
      }
      bytes += size;
    }
    return bytes / 1024;
  };

  const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry === true);
  if (entryKey === undefined) throw new Error('manifest: no entry');
  // The first download: `entry` grows with the wording of one language below.
  const entry = filesOf(manifest, entryKey);
  // The wording of one language is part of every first visit (src/shared/i18n/i18n.ts loads it before the first
  // render): counted here with the heaviest language, so the budget holds whichever language the person reads.
  const languages = Object.keys(manifest).filter((key) =>
    /^src\/shared\/i18n\/locales\/[a-z]{2}\.ts$/.test(key),
  );
  if (languages.length === 0) throw new Error('manifest: no language chunk in src/shared/i18n/locales/');
  const heaviest = languages
    .map((key) => [...filesOf(manifest, key)].filter((file) => !entry.has(file)))
    .reduce((a, b) => (kib(b) > kib(a) ? b : a));
  for (const file of heaviest) entry.add(file);
  const entryKiB = kib(entry);

  const rows = [
    `| Route | Own chunks (KiB gzip) | Own budget | First visit (KiB gzip) | Budget |`,
    `|---|---:|---:|---:|---:|`,
  ];
  const over: string[] = [];
  // Its files too: on a slow link each one is a request of its own, sharing the bandwidth with the others.
  const files = `${String(entry.size)} files`;
  rows.push(`| (first download, ${files}) | | | ${entryKiB.toFixed(1)} | ${String(budget.entryKiB)} |`);
  if (entryKiB > budget.entryKiB) over.push(`the first download: ${entryKiB.toFixed(1)} KiB`);
  const measured: MeasuredRoute[] = [];
  for (const route of routesOf(readFileSync('src/app/router.ts', 'utf8'))) {
    const own = new Set(
      route.feature === undefined
        ? []
        : [...filesOf(manifest, indexOf(manifest, route.feature))].filter((f) => !entry.has(f)),
    );
    const ownKiB = kib(own);
    const total = entryKiB + ownKiB;
    const ownBudget = route.feature === undefined ? 'in the first download' : budget.routes[route.path];
    rows.push(
      `| \`${route.path}\` | ${ownKiB.toFixed(1)} | ${String(ownBudget ?? 'none')} | ${total.toFixed(1)} | ${String(budget.routeKiB)} |`,
    );
    measured.push({ path: route.path, ownKiB: route.feature === undefined ? undefined : ownKiB });
    if (total > budget.routeKiB) over.push(`${route.path}: ${total.toFixed(1)} KiB`);
  }
  const routes = checkRouteBudgets(measured, budget.routes);
  over.push(...routes.over);

  const table = [rows.join('\n'), ...heaviestOf(dist, entry)].join('\n');
  process.stdout.write(`${table}\n`);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, `### Download per route\n\n${table}\n`);
  if (over.length > 0) {
    console.error(`Over budget (bundle-budget.json): ${over.join(', ')}`);
    process.exitCode = 1;
  }
  // Not a size: the lines of bundle-budget.json no longer match the router's lazy routes.
  if (routes.outOfStep.length > 0) {
    console.error(`bundle-budget.json out of step with src/app/router.ts: ${routes.outOfStep.join(', ')}`);
    process.exitCode = 1;
  }
}

main(process.argv[2] ?? 'dist');
