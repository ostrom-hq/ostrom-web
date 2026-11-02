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
import { ActivityScreen, activitySearchSchema } from '@/features/activity';
import { DecisionsScreen } from '@/features/decisions';
import { GithubScreen, githubSearchSchema } from '@/features/github';
import { ImportScreen } from '@/features/import';
import { HomeScreen, InviteScreen, inviteToken } from '@/features/onboarding';
import { MembersScreen } from '@/features/members';
import { ReceiptScreen, ReceiptsScreen } from '@/features/receipts';
import { RulesScreen } from '@/features/rules';
import { SessionScreen, SessionsScreen } from '@/features/sessions';
import { SettingsScreen } from '@/features/settings';
import { AccountsScreen, ArtifactsScreen } from '@/features/sharing';
import { EmailLinkScreen, fragmentValue, SignInScreen, useEmailLinkStore } from '@/features/signin';
import { SpendScreen } from '@/features/spend';
import { TokensScreen } from '@/features/tokens';
import { BillingScreen } from '@/features/billing';
import { PolicyScreen } from '@/features/policy';
import { McpScreen, SecretsScreen } from '@/features/tools';
import { NewWorkflowScreen, WorkflowScreen, WorkflowsScreen } from '@/features/workflows';
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

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeScreen });

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
/** `/github`, where GitHub's install comes back through the server's callback (`?installed=1` or `?error=<type>`). */
const githubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/github',
  validateSearch: githubSearchSchema,
  component: GithubScreen,
});
const approversRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvers',
  component: ApproversScreen,
});
const rulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules', component: RulesScreen });
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  validateSearch: activitySearchSchema,
  component: ActivityScreen,
});
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
const newWorkflowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/new',
  component: NewWorkflowScreen,
});
const workflowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/$workflowId',
  component: WorkflowScreen,
});
const mcpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/mcp', component: McpScreen });
const policyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/policy',
  component: PolicyScreen,
});
const secretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/secrets',
  component: SecretsScreen,
});
const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: ImportScreen,
});
const spendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/spend', component: SpendScreen });
const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/billing',
  component: BillingScreen,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsScreen,
});
const tokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tokens',
  component: TokensScreen,
});
const cloudRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cloud', component: CloudScreen });
const automationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/automations',
  component: AutomationsScreen,
});
const artifactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/artifacts',
  component: ArtifactsScreen,
});
const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts',
  component: AccountsScreen,
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

// A redirect that is not a single string (`?redirect=1`, repeated keys) is dropped, never an error page.
export const signInSearchSchema = z.object({ redirect: z.string().optional().catch(undefined) });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signin',
  staticData: { anonymous: true },
  validateSearch: signInSearchSchema,
  component: SignInScreen,
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
  component: EmailLinkScreen,
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
  component: InviteScreen,
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
  approversRoute,
  rulesRoute,
  activityRoute,
  decisionsRoute,
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
