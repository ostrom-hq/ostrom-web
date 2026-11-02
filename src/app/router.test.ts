// SPDX-License-Identifier: AGPL-3.0-only
import { createMemoryHistory } from '@tanstack/react-router';
import { createAppRouter } from '@/app/router';

describe('the routes', () => {
  // Each screen comes from its feature's own chunk, fetched with its route: every one of them must load. A chunk that
  // loaded drops its `preload` (lazyRouteComponent); one that failed keeps it, its error kept for the render.
  it('load the screen of every route', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    const routes = Object.values(router.routesById).filter((route) => !route.isRoot);
    expect(routes.length).toBeGreaterThan(0);
    await Promise.all(routes.map(async (route) => router.loadRouteChunk(route)));
    for (const route of routes) expect(route.options.component?.preload, route.id).toBeUndefined();
  });
});
