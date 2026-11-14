import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { z } from 'zod/mini';
import { AppShell } from '@/app/AppShell';
import { ErrorScreen, NotFoundScreen, PendingScreen } from '@/app/StatusScreens';
import { activitySearchSchema } from '@/features/activity/route';
import { deviceSearchSchema } from '@/features/device/route';
import { githubSearchSchema } from '@/features/github/route';
import { inviteToken } from '@/features/onboarding/route';
import { fragmentValue, useEmailLinkStore, useSetupLinkStore } from '@/features/signin/route';
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
  signin: z.optional(z.unknown()),
  signout: z.optional(
    z.pipe(
      z.unknown(),
      z.transform(() => true as const),
    ),
  ),
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

/**
 * `/confirm/gc-…` is the link `ostrom` prints when a governance write made with a CLI token waits for a person
 * (core#57): an owner or an admin reads the exact change here, then confirms or refuses it.
 */
const confirmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/confirm/$confirmationId',
  component: lazyRouteComponent(async () => import('@/features/confirm'), 'ConfirmScreen'),
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
const waitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/waits',
  component: lazyRouteComponent(async () => import('@/features/waits'), 'WaitsScreen'),
});
const waitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/waits/$waitId',
  component: lazyRouteComponent(async () => import('@/features/waits'), 'WaitScreen'),
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
const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs',
  component: lazyRouteComponent(async () => import('@/features/workflows'), 'RunsScreen'),
});
const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs/$runId',
  component: lazyRouteComponent(async () => import('@/features/workflows'), 'RunScreen'),
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
/** The team's skills and hooks, pinned by an administrator and delivered to members; what a member receives. */
const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'SkillsScreen'),
});
const skillRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills/$name',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'SkillScreen'),
});
const hooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hooks',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'HooksScreen'),
});
const hookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hooks/$name',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'HookScreen'),
});
const hookVersionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hooks/$name/versions/$version',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'HookVersionScreen'),
});
const memberSkillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members/$memberId/skills',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'MemberSkillsScreen'),
});
const memberHooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members/$memberId/hooks',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'MemberHooksScreen'),
});
const personalSkillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/me/skills',
  component: lazyRouteComponent(async () => import('@/features/delivery'), 'PersonalSkillsScreen'),
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
/** The organization's environment variants, their assignments and exclusions (`environment.v1`). */
const environmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/environment',
  component: lazyRouteComponent(async () => import('@/features/environment'), 'EnvironmentScreen'),
});
/** What the person's agents receive, by name, and their own environment values. */
const myEnvironmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/me/environment',
  component: lazyRouteComponent(async () => import('@/features/environment'), 'MyEnvironmentScreen'),
});
/** The person's own MCP servers (`mcp.personal.v1`). */
const myMcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/me/mcp',
  component: lazyRouteComponent(async () => import('@/features/tools'), 'PersonalMcpScreen'),
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
/** The person's own account, read in no organization: sessions, workstations and their GitHub. */
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: lazyRouteComponent(async () => import('@/features/settings'), 'AccountScreen'),
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
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: lazyRouteComponent(async () => import('@/features/admin'), 'AdministratorsScreen'),
});
const adminSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/settings',
  component: lazyRouteComponent(async () => import('@/features/admin'), 'InstanceSettingsScreen'),
});
const cloudAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cloud/admin',
  component: lazyRouteComponent(async () => import('@/features/cloudAdmin'), 'CloudAdminScreen'),
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
const webhooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/webhooks',
  component: lazyRouteComponent(async () => import('@/features/webhooks'), 'WebhooksScreen'),
});
const webhookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/webhooks/$webhookId',
  component: lazyRouteComponent(async () => import('@/features/webhooks'), 'WebhookScreen'),
});
const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts',
  component: lazyRouteComponent(async () => import('@/features/sharing'), 'AccountsScreen'),
});
/** `?gone` says, above the list, that the group just asked for no longer exists. */
export const groupsSearchSchema = z.object({
  gone: z.optional(
    z.pipe(
      z.unknown(),
      z.transform(() => true as const),
    ),
  ),
});

const groupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts/groups',
  validateSearch: groupsSearchSchema,
  component: lazyRouteComponent(async () => import('@/features/sharing'), 'GroupsScreen'),
});
const groupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts/groups/$groupId',
  component: lazyRouteComponent(async () => import('@/features/sharing'), 'GroupScreen'),
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

// A redirect or an error that is not a single string (`?redirect=1`, repeated keys) is dropped, never an error page.
// `error` is what the server's sign-in callbacks add when they refuse a person (`signup_closed`).
export const signInSearchSchema = z.object({
  redirect: z.catch(z.optional(z.string()), undefined),
  error: z.catch(z.optional(z.string()), undefined),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signin',
  staticData: { anonymous: true },
  validateSearch: signInSearchSchema,
  component: lazyRouteComponent(async () => import('@/features/signin'), 'SignInScreen'),
});

/**
 * `/login?error=…` is where the server's OAuth callbacks send a refused sign-in (`/login?error=signup_closed`): the
 * console's sign-in page is `/signin`, so the address goes there with its error, whatever it is. No screen of its own.
 */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  staticData: { anonymous: true },
  validateSearch: signInSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/signin', search, replace: true });
  },
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

/**
 * `/setup#token=osb_…` is the link `ostrom-server bootstrap` prints for the first owner of an invite-only instance.
 * As for an invitation, the token leaves the address bar before the page renders; it stays in memory only, and the
 * screen presents it to the server before offering the sign-in.
 */
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  staticData: { anonymous: true },
  beforeLoad: ({ location }) => {
    const token = fragmentValue(location.hash, 'token');
    if (token === undefined) return;
    dropFragment();
    useSetupLinkStore.getState().hold(token);
    throw redirect({ to: '/setup', hash: '', replace: true });
  },
  component: lazyRouteComponent(async () => import('@/features/signin'), 'SetupScreen'),
});

export const routeTree = rootRoute.addChildren([
  homeRoute,
  inviteRoute,
  setupRoute,
  signInRoute,
  loginRoute,
  emailLinkRoute,
  yesRoute,
  approvalRoute,
  confirmRoute,
  sessionsRoute,
  sessionRoute,
  waitsRoute,
  waitRoute,
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
  runsRoute,
  runRoute,
  newWorkflowRoute,
  workflowRoute,
  mcpRoute,
  policyRoute,
  secretsRoute,
  environmentRoute,
  myEnvironmentRoute,
  myMcpRoute,
  skillsRoute,
  skillRoute,
  hooksRoute,
  hookRoute,
  hookVersionRoute,
  memberSkillsRoute,
  memberHooksRoute,
  personalSkillsRoute,
  importRoute,
  spendRoute,
  billingRoute,
  settingsRoute,
  accountRoute,
  tokensRoute,
  cloudRoute,
  cloudAdminRoute,
  adminRoute,
  adminSettingsRoute,
  automationsRoute,
  artifactsRoute,
  webhooksRoute,
  webhookRoute,
  accountsRoute,
  groupsRoute,
  groupRoute,
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
