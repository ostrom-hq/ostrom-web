// SPDX-License-Identifier: AGPL-3.0-only
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

/**
 * The boot chunk's rule (vite.config.ts): everything the entry loads anyway, and every part the screens share. Shared
 * parts left to the automatic splitting became a dozen files of under a kilobyte each (the page, the current
 * organization, a list's "show more"), and a screen asked for up to nine of them: on a slow link each waits for one of
 * the six connections behind the entry, a round trip each. In the boot chunk they cost a few kilobytes, once. A
 * screen's own code stays in its chunk, loaded when it opens.
 *
 * Returns the group's name for `id`, or `null` to leave the module to the automatic splitting. The answers of a build
 * are kept in `known`: one build, one graph.
 */
export function bootChunkOf(
  id: string,
  graph: ModuleGraph,
  known = new Map<string, boolean>(),
): 'boot' | null {
  return SHARED.test(id) || loadedWithEntry(id, graph, known) ? 'boot' : null;
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
