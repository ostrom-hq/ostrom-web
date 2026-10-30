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
import { ApproversScreen } from '@/features/approvers';
import { AutomationsScreen, CloudScreen } from '@/features/cloud';
import { DecisionsScreen } from '@/features/decisions';
import { HomeScreen } from '@/features/home';
import { MembersScreen } from '@/features/members';
import { ReceiptScreen, ReceiptsScreen } from '@/features/receipts';
import { RulesScreen } from '@/features/rules';
import { SessionScreen, SessionsScreen } from '@/features/sessions';
import { SpendScreen } from '@/features/spend';
import { McpScreen, SecretsScreen } from '@/features/tools';
import { WorkflowScreen, WorkflowsScreen } from '@/features/workflows';
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
    else return;
    throw redirect({ to: '/yes', search: {}, hash: '', replace: true });
  },
  component: YesQueueScreen,
});

const approvalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/yes/$approvalId',
  component: ApprovalScreen,
});

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  component: SessionsScreen,
});
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  component: SessionScreen,
});
const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members',
  component: MembersScreen,
});
const approversRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvers',
  component: ApproversScreen,
});
const rulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules', component: RulesScreen });
const decisionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decisions',
  component: DecisionsScreen,
});
const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: WorkflowsScreen,
});
const workflowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/$workflowId',
  component: WorkflowScreen,
});
const mcpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/mcp', component: McpScreen });
const secretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/secrets',
  component: SecretsScreen,
});
const spendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/spend', component: SpendScreen });
const cloudRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cloud', component: CloudScreen });
const automationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/automations',
  component: AutomationsScreen,
});
const receiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receipts',
  component: ReceiptsScreen,
});
const receiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receipts/$receiptId',
  component: ReceiptScreen,
});

export const routeTree = rootRoute.addChildren([
  homeRoute,
  yesRoute,
  approvalRoute,
  sessionsRoute,
  sessionRoute,
  receiptsRoute,
  receiptRoute,
  membersRoute,
  approversRoute,
  rulesRoute,
  decisionsRoute,
  workflowsRoute,
  workflowRoute,
  mcpRoute,
  secretsRoute,
  spendRoute,
  cloudRoute,
  automationsRoute,
]);

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
