import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import { AppShell } from '@/app/AppShell';
import { ErrorScreen, NotFoundScreen } from '@/app/StatusScreens';
import { HomeScreen } from '@/features/home';

const rootRoute = createRootRoute({ component: AppShell });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeScreen });

export const routeTree = rootRoute.addChildren([homeRoute]);

const buildRouter = (history?: RouterHistory) =>
  createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFoundScreen,
    defaultErrorComponent: ErrorScreen,
    ...(history === undefined ? {} : { history }),
  });

export type AppRouter = ReturnType<typeof buildRouter>;

/** Browser history by default; tests pass a memory history. */
export function createAppRouter(history?: RouterHistory): AppRouter {
  return buildRouter(history);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
