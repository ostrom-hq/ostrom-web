import { createMemoryHistory } from '@tanstack/react-router';
import { createAppRouter } from '@/app/router';

describe('the routes', () => {
  // Each screen comes from its feature's own chunk, fetched with its route: every one of them must load.
  it('load the screen of every route', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    const routes = Object.values(router.routesById).filter((route) => !route.isRoot);
    expect(routes.length).toBeGreaterThanOrEqual(31);
    await Promise.all(routes.map(async (route) => router.loadRouteChunk(route)));
    for (const route of routes) expect(route.options.component, route.id).toBeDefined();
  });
});
