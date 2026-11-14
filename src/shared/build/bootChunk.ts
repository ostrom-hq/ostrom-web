// SPDX-License-Identifier: Apache-2.0
// No import: vite.config.ts reads this file too, without the app's `@` alias.

/** What the build knows of a module, as rolldown's chunking context gives it. */
export interface ModuleNode {
  readonly isEntry: boolean;
  /** The modules that import it statically: a dynamic import is not one of them. */
  readonly importers: readonly string[];
}

/** The module graph of the build (rolldown's `ChunkingContext`). */
export interface ModuleGraph {
  getModuleInfo: (id: string) => ModuleNode | null;
}

/**
 * Parts the screens share beyond the first download: the console's own shared code, but not a language's wording (a
 * chunk of its own, src/shared/i18n/i18n.ts), and React Query's infinite lists (its core already is in the entry).
 */
const SHARED =
  /[\\/]src[\\/]shared[\\/](?!i18n[\\/]locales[\\/])|[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?@tanstack[\\/](?:react-query|query-core)[\\/]/;

/** A module of a screen's feature (src/features/<feature>/), which the router loads lazily. */
const FEATURE = /[\\/]src[\\/]features[\\/]([^\\/]+)[\\/]/;

/**
 * The chunking rule (vite.config.ts): everything the entry loads anyway goes in the boot chunk; every other part the
 * screens share goes in one `shared` chunk, beside it. Shared parts left to the automatic splitting became a dozen
 * files of under a kilobyte each (the page, the current organization, a list's "show more"), and a screen asked for up
 * to nine of them: on a slow link each waits for one of the six connections behind the entry, a round trip each. In
 * one chunk they cost a few kilobytes, once, preloaded with the first screen's own chunk (/boot.js).
 *
 * They are not in the entry itself: every first download then carried them, and ran them before the first screen, used
 * or not. As the console grew (the generated calls and schemas of each feature shared by two of them), the entry did
 * too, and the largest paint on Fast 3G with a CPU four times slower went past 2.5 s (e2e-real/vitals.spec.ts).
 *
 * A module `shareable` says is small (a generated call or schema, src/shared/build/splitModule.ts) is in the shared
 * chunk too once the screens of two features use it: left to the automatic splitting, each such set became a file of
 * its own, and `/` asked for four of them.
 *
 * Returns the group's name for `id`, or `null` to leave the module to the automatic splitting. The answers of a build
 * are kept in `known`: one build, one graph.
 */
export function bootChunkOf(
  id: string,
  graph: ModuleGraph,
  known = new Map<string, boolean>(),
  shareable: (id: string) => boolean = () => false,
): 'boot' | 'shared' | null {
  if (loadedWithEntry(id, graph, known)) return 'boot';
  if (SHARED.test(id)) return 'shared';
  return shareable(id) && featuresUsing(id, graph, new Set()).size > 1 ? 'shared' : null;
}

/** The features whose modules import `id`, directly or through modules of no feature. */
function featuresUsing(id: string, graph: ModuleGraph, walking: Set<string>): Set<string> {
  const features = new Set<string>();
  const feature = FEATURE.exec(id)?.[1];
  if (feature !== undefined) return features.add(feature);
  if (walking.has(id)) return features;
  walking.add(id);
  for (const importer of graph.getModuleInfo(id)?.importers ?? []) {
    for (const found of featuresUsing(importer, graph, walking)) features.add(found);
  }
  return features;
}

/**
 * An entry, or a module an entry imports statically, directly or through others: rolldown's `$initial`. A module met
 * again on the way up (an import cycle) adds nothing; an answer reached through such a cut is kept only if it is a yes,
 * or once the whole way up is walked.
 */
function loadedWithEntry(
  id: string,
  graph: ModuleGraph,
  known: Map<string, boolean>,
  walking = new Set<string>(),
): boolean {
  const answered = known.get(id);
  if (answered !== undefined) return answered;
  if (walking.has(id)) return false;
  walking.add(id);
  const node = graph.getModuleInfo(id);
  const initial =
    node !== null &&
    (node.isEntry || node.importers.some((importer) => loadedWithEntry(importer, graph, known, walking)));
  walking.delete(id);
  if (initial || walking.size === 0) known.set(id, initial);
  return initial;
}
