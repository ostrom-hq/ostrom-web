import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from '@/app/AppShell';
import { ErrorScreen, NotFoundScreen, PendingScreen } from '@/app/StatusScreens';
import { activitySearchSchema } from '@/features/activity/route';
import { deviceSearchSchema } from '@/features/device/route';
import { githubSearchSchema } from '@/features/github/route';
import { inviteToken } from '@/features/onboarding/route';
import { fragmentValue, useEmailLinkStore } from '@/features/signin/route';
// The yes screens are in the first download: an approver opens a link to one on a phone, and a screen fetched after the
// entry costs a round trip more on a slow network (first paint 1.9 s with it, 2.2 s split; e2e-real/firstPaint.spec.ts).
import { ApprovalScreen, YesQueueScreen } from '@/features/yes';
import { useAuthStore } from '@/shared/auth/authStore';
import { dropFragment } from '@/shared/lib/dropFragment';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** A page for people not signed in yet: the top bar asks nobody who they are. */
    readonly anonymous?: boolean;
  }
}

const rootRoute = createRootRoute({ component: AppShell });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(async () => import('@/features/onboarding'), 'HomeScreen'),
});

/**
 * `/yes#signin=opk_…` is the link an approver opens on their phone. The token rides in the fragment, which the
 * browser never sends to a server nor writes in its logs: it is wiped from the address bar and the history at once
 * (`history.replaceState`), held in memory, and the yes screens exchange it for the session cookie
 * (`POST /auth/link`). `/yes?signout` asks whether to end the session (`POST /auth/logout`) once the person says so.
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
    if (signin !== undefined) {
      dropFragment();
      useAuthStore.getState().offer(signin);
    } else if (search.signin === undefined) return;
    // `?signout` stays in the address: the queue asks from it, and nothing is ended before a yes (audit
    // AUDIT-SECU-WEB-2 M2: a page of another site can open this address).
    throw redirect({
      to: '/yes',
      search: search.signout === true ? { signout: true } : {},
      hash: '',
      replace: true,
    });
  },
  component: YesQueueScreen,
});

/** A link to one request (`/yes/apr-1#signin=opk_…`) signs in the same way, then shows that request. */
const approvalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/yes/$approvalId',
  beforeLoad: ({ location, params }) => {
    const signin = signInFromHash(location.hash);
    if (signin === undefined) return;
    dropFragment();
    useAuthStore.getState().offer(signin);
    throw redirect({ to: '/yes/$approvalId', params, hash: '', replace: true });
  },
  component: ApprovalScreen,
});

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  component: lazyRouteComponent(async () => import('@/features/sessions'), 'SessionsScreen'),
});
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  component: lazyRouteComponent(async () => import('@/features/sessions'), 'SessionScreen'),
});
const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members',
  component: lazyRouteComponent(async () => import('@/features/members'), 'MembersScreen'),
});
/** `/github`, where GitHub's install comes back through the server's callback (`?installed=1` or `?error=<type>`). */
const githubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/github',
  validateSearch: githubSearchSchema,
  component: lazyRouteComponent(async () => import('@/features/github'), 'GithubScreen'),
});
/**
 * `/device?code=…`, where `ostrom login` sends the person to approve their terminal (RFC 8628). Signed in only: the
 * page offers a sign-in that comes back to it, its code kept.
 */
const deviceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/device',
  validateSearch: deviceSearchSchema,
  component: lazyRouteComponent(async () => import('@/features/device'), 'DeviceScreen'),
});
const approversRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvers',
  component: lazyRouteComponent(async () => import('@/features/approvers'), 'ApproversScreen'),
});
const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules',
  component: lazyRouteComponent(async () => import('@/features/rules'), 'RulesScreen'),
});
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  validateSearch: activitySearchSchema,
  component: lazyRouteComponent(async () => import('@/features/activity'), 'ActivityScreen'),
});
const decisionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decisions',
  component: lazyRouteComponent(async () => import('@/features/decisions'), 'DecisionsScreen'),
});
const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit',
  component: lazyRouteComponent(async () => import('@/features/audit'), 'AuditScreen'),
});
const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: lazyRouteComponent(async () => import('@/features/workflows'), 'WorkflowsScreen'),
});
const newWorkflowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/new',
  component: lazyRouteComponent(async () => import('@/features/workflows'), 'NewWorkflowScreen'),
});
const workflowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/$workflowId',
  component: lazyRouteComponent(async () => import('@/features/workflows'), 'WorkflowScreen'),
});
const mcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mcp',
  component: lazyRouteComponent(async () => import('@/features/tools'), 'McpScreen'),
});
const policyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/policy',
  component: lazyRouteComponent(async () => import('@/features/policy'), 'PolicyScreen'),
});
const secretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/secrets',
  component: lazyRouteComponent(async () => import('@/features/tools'), 'SecretsScreen'),
});
const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: lazyRouteComponent(async () => import('@/features/import'), 'ImportScreen'),
});
const spendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spend',
  component: lazyRouteComponent(async () => import('@/features/spend'), 'SpendScreen'),
});
const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/billing',
  component: lazyRouteComponent(async () => import('@/features/billing'), 'BillingScreen'),
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(async () => import('@/features/settings'), 'SettingsScreen'),
});
const tokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tokens',
  component: lazyRouteComponent(async () => import('@/features/tokens'), 'TokensScreen'),
});
const cloudRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cloud',
  component: lazyRouteComponent(async () => import('@/features/cloud'), 'CloudScreen'),
});
const automationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/automations',
  component: lazyRouteComponent(async () => import('@/features/cloud'), 'AutomationsScreen'),
});
const artifactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/artifacts',
  component: lazyRouteComponent(async () => import('@/features/sharing'), 'ArtifactsScreen'),
});
const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts',
  component: lazyRouteComponent(async () => import('@/features/sharing'), 'AccountsScreen'),
});
const receiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receipts',
  component: lazyRouteComponent(async () => import('@/features/receipts'), 'ReceiptsScreen'),
});
const receiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receipts/$receiptId',
  component: lazyRouteComponent(async () => import('@/features/receipts'), 'ReceiptScreen'),
});

// A redirect that is not a single string (`?redirect=1`, repeated keys) is dropped, never an error page.
export const signInSearchSchema = z.object({ redirect: z.string().optional().catch(undefined) });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signin',
  staticData: { anonymous: true },
  validateSearch: signInSearchSchema,
  component: lazyRouteComponent(async () => import('@/features/signin'), 'SignInScreen'),
});

/**
 * `/auth/email#token=…` is the link the sign-in e-mail carries. As for the approver link, the token is taken from
 * the fragment, kept in memory and wiped from the address bar before the page renders; the screen then spends it.
 */
const emailLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/email',
  staticData: { anonymous: true },
  beforeLoad: ({ location }) => {
    const token = fragmentValue(location.hash, 'token');
    if (token === undefined) return;
    dropFragment();
    useEmailLinkStore.getState().hold(token);
    throw redirect({ to: '/auth/email', hash: '', replace: true });
  },
  // A link left unanswered goes with the page: never spent later, when nobody would be asked any more.
  onLeave: () => {
    useEmailLinkStore.getState().take();
  },
  component: lazyRouteComponent(async () => import('@/features/signin'), 'EmailLinkScreen'),
});

/**
 * `/invite#token=…` is the link an invitation carries (the server's `$consoleUrl/invite#token=…`). The token leaves
 * the address bar before the page renders and waits in this tab while its person signs in (onboarding/inviteLink.ts).
 */
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite',
  // Read signed out as well: the preview needs no session.
  staticData: { anonymous: true },
  beforeLoad: ({ location }) => {
    const token = fragmentValue(location.hash, 'token');
    if (token === undefined) return;
    dropFragment();
    inviteToken.hold(token);
    throw redirect({ to: '/invite', hash: '', replace: true });
  },
  component: lazyRouteComponent(async () => import('@/features/onboarding'), 'InviteScreen'),
});

export const routeTree = rootRoute.addChildren([
  homeRoute,
  inviteRoute,
  signInRoute,
  emailLinkRoute,
  yesRoute,
  approvalRoute,
  sessionsRoute,
  sessionRoute,
  receiptsRoute,
  receiptRoute,
  membersRoute,
  githubRoute,
  deviceRoute,
  approversRoute,
  rulesRoute,
  activityRoute,
  decisionsRoute,
  auditRoute,
  workflowsRoute,
  newWorkflowRoute,
  workflowRoute,
  mcpRoute,
  policyRoute,
  secretsRoute,
  importRoute,
  spendRoute,
  billingRoute,
  settingsRoute,
  tokensRoute,
  cloudRoute,
  automationsRoute,
  artifactsRoute,
  accountsRoute,
]);

const buildRouter = (history?: RouterHistory) =>
  createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFoundScreen,
    defaultErrorComponent: ErrorScreen,
    // A route still pending after a second (its screen's chunk, or anything it waits for) shows the shape of a page,
    // not an empty main area; once shown, it stays half a second (the router's default) so it does not flash.
    defaultPendingComponent: PendingScreen,
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
