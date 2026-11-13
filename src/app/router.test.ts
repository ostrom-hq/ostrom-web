// SPDX-License-Identifier: Apache-2.0
import { createMemoryHistory } from '@tanstack/react-router';
import { createAppRouter } from '@/app/router';

describe('the routes', () => {
  // Each screen comes from its feature's own chunk, fetched with its route: every one of them must load. A lazy screen
  // has a `preload` until its chunk loaded (lazyRouteComponent); one that failed keeps it, its error kept for the render.
  it('load the screen of every route', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    const routes = Object.values(router.routesById).filter((route) => !route.isRoot);
    // Every screen the console has (31 today), each one lazy but the yes screens, in the first download (router.ts).
    expect(routes.length).toBeGreaterThanOrEqual(31);
    const inFirstDownload = new Set(['/yes', '/yes/$approvalId', '/login']);
    for (const route of routes)
      expect(typeof route.options.component?.preload, route.id).toBe(
        inFirstDownload.has(route.id) ? 'undefined' : 'function',
      );
    await Promise.all(routes.map(async (route) => router.loadRouteChunk(route)));
    // `/login` has no screen: it redirects to `/signin` before any would render.
    for (const route of routes.filter((item) => item.id !== '/login')) {
      expect(route.options.component, route.id).toBeDefined();
      expect(route.options.component?.preload, route.id).toBeUndefined();
    }
  });
});
