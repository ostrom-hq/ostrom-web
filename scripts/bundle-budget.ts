// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The console's download budget, per route: what a first visit to a route fetches, gzipped. That is the entry with
 * the chunks it imports and the wording of one language, the heaviest (the first download, shared by every route), plus
 * the route's own chunk and the chunks it imports. Above its budget (bundle-budget.json), the job fails, and the table says which route and by how much.
 *
 * Usage: node scripts/bundle-budget.ts <dist built with --manifest>
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';

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

/** The routes whose screens are in the first download on purpose (src/app/router.ts says why): nothing of their own. */
const IN_FIRST_DOWNLOAD = new Set(['/yes', '/yes/$approvalId']);

/**
 * Each route of the router with the feature its screen loads from. Every route loads its screen lazily: one that does
 * not would put its screen back in the first download, so it fails here, as does a route this reading cannot follow.
 */
function routesOf(router: string): { path: string; feature: string | undefined }[] {
  // Each `path:` up to the next one is a route's definition, its screen's lazy import in it.
  return router
    .split(/(?=path: ['"`])/)
    .slice(1)
    .map((definition) => {
      const path = /^path: ['"`]([^'"`]+)['"`]/.exec(definition)?.[1];
      const feature = /import\(['"`]@\/features\/([a-z-]+)['"`]\)/.exec(definition)?.[1];
      if (path !== undefined && feature === undefined && IN_FIRST_DOWNLOAD.has(path))
        return { path, feature: undefined };
      if (path === undefined || feature === undefined) {
        throw new Error(`src/app/router.ts: a route without a lazy screen: ${definition.slice(0, 120)}`);
      }
      return { path, feature };
    });
}

/** The manifest key of a feature's index, whatever its extension. */
function indexOf(manifest: Manifest, feature: string): string {
  const key = Object.keys(manifest).find((name) => name.startsWith(`src/features/${feature}/index.`));
  if (key === undefined) throw new Error(`manifest: no chunk for the feature ${feature}`);
  return key;
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
  const entry = filesOf(manifest, entryKey);
  // The wording of one language is part of every first visit (src/shared/i18n/i18n.ts loads it before the first
  // render): counted here with the heaviest language, so the budget holds whichever language the person reads.
  const languages = Object.keys(manifest).filter((key) => key.startsWith('src/shared/i18n/locales/'));
  if (languages.length === 0) throw new Error('manifest: no language chunk in src/shared/i18n/locales/');
  const heaviest = languages
    .map((key) => [...filesOf(manifest, key)].filter((file) => !entry.has(file)))
    .reduce((a, b) => (kib(b) > kib(a) ? b : a));
  for (const file of heaviest) entry.add(file);
  const entryKiB = kib(entry);

  const rows = [
    `| Route | Own chunks (KiB gzip) | First visit (KiB gzip) | Budget |`,
    `|---|---:|---:|---:|`,
  ];
  const over: string[] = [];
  rows.push(`| (first download) | | ${entryKiB.toFixed(1)} | ${String(budget.entryKiB)} |`);
  if (entryKiB > budget.entryKiB) over.push(`the first download: ${entryKiB.toFixed(1)} KiB`);
  for (const route of routesOf(readFileSync('src/app/router.ts', 'utf8'))) {
    const own = new Set(
      route.feature === undefined
        ? []
        : [...filesOf(manifest, indexOf(manifest, route.feature))].filter((f) => !entry.has(f)),
    );
    const ownKiB = kib(own);
    const total = entryKiB + ownKiB;
    rows.push(
      `| \`${route.path}\` | ${ownKiB.toFixed(1)} | ${total.toFixed(1)} | ${String(budget.routeKiB)} |`,
    );
    if (total > budget.routeKiB) over.push(`${route.path}: ${total.toFixed(1)} KiB`);
  }

  const table = rows.join('\n');
  process.stdout.write(`${table}\n`);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, `### Download per route\n\n${table}\n`);
  if (over.length > 0) {
    console.error(`Over budget (bundle-budget.json): ${over.join(', ')}`);
    process.exitCode = 1;
  }
}

main(process.argv[2] ?? 'dist');
