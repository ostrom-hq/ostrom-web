import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from '@/app/AppShell';
import { ErrorScreen, NotFoundScreen } from '@/app/StatusScreens';
import { HomeScreen } from '@/features/home';
import { ApprovalScreen, YesQueueScreen } from '@/features/yes';
import { useAuthStore } from '@/shared/auth/authStore';

const rootRoute = createRootRoute({ component: AppShell });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeScreen });

/**
 * `/yes#signin=opk_…` is the link an approver opens on their phone. The token rides in the fragment, which the
 * browser never sends to a server nor writes in its logs: it is kept in memory, then dropped from the address bar
 * (and the history) at once. `/yes?signout` forgets it.
 */
export const yesSearchSchema = z.object({
  /** A token in the query string is never used (servers log it), only wiped from the address. */
  signin: z.unknown().optional(),
  signout: z
    .unknown()
    .transform(() => true as const)
    .optional(),
});

/** The sign-in token a link carries in its fragment (`signin=…`), if any. */
export function signInFromHash(hash: string): string | undefined {
  return new URLSearchParams(hash.replace(/^#/, '')).get('signin') ?? undefined;
}

const yesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/yes',
  validateSearch: yesSearchSchema,
  beforeLoad: ({ search, location }) => {
    const signin = signInFromHash(location.hash);
    if (search.signout === true) useAuthStore.getState().signOut();
    else if (signin !== undefined) useAuthStore.getState().offer(signin);
    else if (search.signin === undefined) return;
    throw redirect({ to: '/yes', search: {}, hash: '', replace: true });
  },
  component: YesQueueScreen,
});

const approvalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/yes/$approvalId',
  component: ApprovalScreen,
});

export const routeTree = rootRoute.addChildren([homeRoute, yesRoute, approvalRoute]);

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
