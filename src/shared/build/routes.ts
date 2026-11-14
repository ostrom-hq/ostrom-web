// SPDX-License-Identifier: Apache-2.0
// No import: vite.config.ts and scripts/bundle-budget.ts read this file too, without the app's `@` alias.

/**
 * The routes whose screens are in the first download on purpose (src/app/router.ts says why), and `/login`, which has
 * no screen (it redirects to `/signin`): nothing of their own.
 */
export const IN_FIRST_DOWNLOAD: ReadonlySet<string> = new Set(['/yes', '/yes/$approvalId', '/login']);

/** A route of the router, and the feature its screen loads from lazily (`undefined`: in the first download). */
export interface RouteOfRouter {
  readonly path: string;
  readonly feature: string | undefined;
}

/**
 * Each route of the router (the text of src/app/router.ts) with the feature its screen loads from. Every route loads
 * its screen lazily: one that does not would put its screen back in the first download, so it fails here, as does a
 * route this reading cannot follow.
 */
export function routesOf(router: string): RouteOfRouter[] {
  // Each `path:` up to the next one is a route's definition, its screen's lazy import in it.
  return router
    .split(/(?=path: ['"`])/)
    .slice(1)
    .map((definition) => {
      const path = /^path: ['"`]([^'"`]+)['"`]/.exec(definition)?.[1];
      const feature = /import\(['"`]@\/features\/([A-Za-z-]+)['"`]\)/.exec(definition)?.[1];
      if (path !== undefined && feature === undefined && IN_FIRST_DOWNLOAD.has(path)) {
        return { path, feature: undefined };
      }
      if (path === undefined || feature === undefined) {
        throw new Error(`src/app/router.ts: a route without a lazy screen: ${definition.slice(0, 120)}`);
      }
      return { path, feature };
    });
}

/** A pattern of the router (`/sessions/$sessionId`) as a regular expression's source matching a whole pathname. */
export function patternOf(path: string): string {
  const escaped = path
    .split('/')
    .map((segment) => (segment.startsWith('$') ? '[^/]+' : segment.replace(/[.*+?^{}()|[\]\\]/g, '\\$&')))
    .join('/');
  return `^${escaped}/?$`;
}
