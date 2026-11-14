// SPDX-License-Identifier: Apache-2.0
import {
  handleAnswerApproval,
  handleCapabilities,
  handleBulkUpdateRules,
  handleCreateRule,
  handleDeleteRule,
  handleGetGateCatalog,
  handleCreateCloudSession,
  handleCreateMcpServer,
  handleDeleteArtifact,
  handleCreateSecret,
  handleDeleteMcpServer,
  handleDeleteSecret,
  handleDisableAutomation,
  handleEnrollSharedAccount,
  handleEnableAutomation,
  handleGetMcpUsage,
  handleGetSpending,
  handleGetApproval,
  handleGetApprovalQueue,
  handleGetApprovalView,
  handleGetGatePolicy,
  handleExchangeSignInLink,
  handleGetMe,
  handleGetOrganization,
  handleGetReceipt,
  handleGetReceiptBundle,
  handleGetSession,
  handleCreateWorkflow,
  handleDeleteWorkflow,
  handleGetWorkflow,
  handleListApprovals,
  handleListArtifactMembers,
  handleListArtifacts,
  handleListArtifactVersions,
  handleListAutomationRuns,
  handleListAutomations,
  handleListBudgets,
  handleListCloudSessions,
  handleListDecisions,
  handleListMcpCalls,
  handleListMcpServers,
  handleListMembers,
  handleListReceipts,
  handleListRules,
  handleListRunners,
  handleListSecrets,
  handleHandOverSharedAccount,
  handleListSharedAccounts,
  handleRemoveSharedAccount,
  handleLogout,
  handleRequestSignInEmail,
  handleListSessions,
  handleListWorkflows,
  handleSaveWorkflow,
  handleSetGatePolicy,
  handleUpdateRule,
  handleRotateAutomationSecret,
  handleRotateSecret,
  handleSaveMcpServer,
  handleSetBudget,
  handleShareArtifact,
  handleSetCloudSessionGithubAccess,
  handleStopCloudSession,
  handleTestAutomation,
  handleUnshareArtifact,
  handleUpdateSharedAccount,
  handleVerifySignInEmail,
  handleVerifyReceipt,
} from '@gen/api/msw.gen';
import type {
  ApiError,
  Approval,
  ApprovalView,
  ApprovalAnswer,
  ApprovalCallerView,
  ApprovalQueue,
  Artifact,
  ArtifactVersion,
  Automation,
  AutomationDryRun,
  AutomationRun,
  Budget,
  CloudEnvironment,
  CloudSession,
  Decision,
  McpCall,
  McpHostedProcess,
  McpServer,
  Member,
  Organization,
  PublicKey,
  Receipt,
  Rule,
  RuleStatus,
  GateAction,
  RuleGate,
  Runner,
  Secret,
  SharedAccount,
  Session,
  Spending,
  Team,
  Workflow,
  WorkflowRun,
} from '@gen/api/types.gen';
import {
  type zRuleGate,
  zAnswerApprovalRequest,
  zBudget,
  zBulkUpdateRulesBody,
  zCloudAgentKind,
  zCreateCloudSessionBody,
  zRuleStatus,
  zRuleStrength,
  zSetCloudSessionGithubAccessBody,
  zCreateRuleBody,
  zCreateWorkflowBody,
  zEnrollSharedAccountBody,
  zExchangeSignInLinkBody,
  zMcpServer,
  zRequestSignInEmailBody,
  zSaveWorkflowBody,
  zSecretWrite,
  zTestAutomationBody,
  zUpdateRuleBody,
  zUpdateSharedAccountBody,
  zVerifySignInEmailBody,
} from '@gen/api/zod.gen';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { isKnown, knownValues } from '@/shared/lib/openEnum';
import { type AccountState, createAccountHandlers } from '@/mocks/account';
import { type ActivityState, createActivityHandlers } from '@/mocks/activity';
import { type AuditState, createAuditHandlers } from '@/mocks/audit';
import { createApproversGraphHandlers } from '@/mocks/approversGraph';
import { type BillingState, createBillingHandlers } from '@/mocks/billing';
import { demoCapabilities } from '@/mocks/capabilities';
import { createDeviceHandlers, type DeviceState } from '@/mocks/device';
import { createGithubHandlers, type GithubState } from '@/mocks/github';
import { initialDeviceLogins } from '@/mocks/fixtures/device';
import { initialGithubLinks, initialRepos } from '@/mocks/fixtures/github';
import {
  initialAuthSessions,
  initialDevices,
  initialServiceKeys,
  initialTokens,
} from '@/mocks/fixtures/account';
import { initialActivity } from '@/mocks/fixtures/activity';
import { initialAudit } from '@/mocks/fixtures/audit';
import { createOrgDeletionHandlers } from '@/mocks/orgDeletion';
import { createTodosHandlers, type TodosState } from '@/mocks/todos';
import { initialTodos } from '@/mocks/fixtures/todos';
import { createKeysAndDevicesHandlers, type KeysAndDevicesState } from '@/mocks/keysAndDevices';
import { createTokensHandlers, type TokensState } from '@/mocks/tokens';
import { createAutomationWriteHandlers } from '@/mocks/automationWrites';
import {
  createOrgsHandlers,
  DEMO_LOGIN,
  demoRoleIn,
  membersIn,
  membershipsOf,
  type OrgsState,
} from '@/mocks/orgs';
import { z } from 'zod/mini';
import { initialApprovals, initialApprovers, me } from '@/mocks/fixtures/approvals';
import {
  initialInvitations,
  initialMembers,
  initialOrganization,
  initialOrgMembers,
  initialTeams,
  invitedOrganization,
  MEMBER_IDS,
} from '@/mocks/fixtures/organization';
import { actsInOrganization, ORG_HEADER, ORG_REQUIRED } from '@/shared/api/orgHeader';
import { managesBilling, managesMembers, orgRoleOf } from '@/shared/org/roles';
import { initialDecisions, initialRules } from '@/mocks/fixtures/rules';
import {
  initialAutomationRuns,
  initialAutomations,
  initialCloudSessions,
  initialRunners,
} from '@/mocks/fixtures/cloud';
import {
  initialArtifactMembers,
  initialArtifacts,
  initialArtifactVersions,
  initialGroups,
  initialSharedAccounts,
} from '@/mocks/fixtures/sharing';
import { initialBilling, initialInvoices } from '@/mocks/fixtures/billing';
import { initialBudgets, spendingFor } from '@/mocks/fixtures/spend';
import {
  initialMcpAssignments,
  initialMcpCalls,
  initialMcpHosted,
  initialMcpPolicies,
  initialMcpServers,
  initialSecrets,
} from '@/mocks/fixtures/tools';
import { createConfirmationHandlers, type ConfirmationsState } from '@/mocks/confirmations';
import { createWaitsHandlers, type WaitsState } from '@/mocks/waits';
import { createWebhooksHandlers, type WebhooksState } from '@/mocks/webhooks';
import { initialWebhookDeliveries, initialWebhooks } from '@/mocks/fixtures/webhooks';
import { initialWaits } from '@/mocks/fixtures/waits';
import { initialConfirmations, initialRefusedWrites } from '@/mocks/fixtures/confirmations';
import { FRESH_SIGN_IN_MS } from '@/mocks/http';
import { createDeliveryHandlers, type DeliveryState } from '@/mocks/delivery';
import {
  initialHookAssignments,
  initialHookFiles,
  initialHooks,
  initialHookVersions,
  initialSkillAssignments,
  initialSkillInstallations,
  initialSkills,
  initialSkillVersions,
} from '@/mocks/fixtures/delivery';
import { createMcpAccessHandlers, type McpAccessState } from '@/mocks/mcpAccess';
import { type CloudAdminState, createCloudAdminHandlers, initialCloudAdmin } from '@/mocks/cloudAdmin';
import { createMcpHostedHandlers, type McpHostedState } from '@/mocks/mcpHosted';
import { createEnvironmentHandlers, type EnvironmentState } from '@/mocks/environment';
import { createPersonalMcpHandlers, type PersonalMcpState } from '@/mocks/personalMcp';
import {
  initialEnvironmentAssignments,
  initialEnvironmentExclusions,
  initialEnvironmentVariants,
} from '@/mocks/fixtures/environment';
import {
  type AdminState,
  createAdminHandlers,
  initialInstanceAdmins,
  initialInstanceSettings,
} from '@/mocks/admin';
import { createPolicyHandlers, initialModelPolicy, type PolicyState } from '@/mocks/policy';
import { createRunHandlers } from '@/mocks/runs';
import { createGroupsHandlers, type GroupsState } from '@/mocks/groups';
import { createTeamCodeImportHandlers, type TeamCodeImportState } from '@/mocks/teamcodeImport';
import { initialReceipts, initialSessions } from '@/mocks/fixtures/sessions';
import { initialWorkflowRuns } from '@/mocks/fixtures/runs';
import { initialWorkflows } from '@/mocks/fixtures/workflows';
import { sameValue } from '@/features/workflows/model';

export interface MockDb
  extends
    AccountState,
    AdminState,
    CloudAdminState,
    ActivityState,
    AuditState,
    BillingState,
    ConfirmationsState,
    DeliveryState,
    DeviceState,
    EnvironmentState,
    PersonalMcpState,
    GithubState,
    GroupsState,
    OrgsState,
    TokensState,
    KeysAndDevicesState,
    McpAccessState,
    McpHostedState,
    PolicyState,
    TeamCodeImportState,
    TodosState,
    WaitsState,
    WebhooksState {
  approvals: Approval[];
  /** Who may answer each approval, by id. */
  approvers: Record<string, readonly string[]>;
  /**
   * The approvals of a pull request whose author linked no Ostrom person (Q-GATES-G1 a): under `never`, a yes waits for
   * an approver who linked a GitHub account, as the server's `GateRules.needsLink` says.
   */
  unlinkedAuthors: string[];
  sessions: Session[];
  /** Newest first, as the server lists them; an answer adds its receipt at the top. */
  receipts: Receipt[];
  organization: Organization;
  /**
   * The person's other active memberships. With none, a call that names no organization acts in `organization`; with
   * any, it must name one with `Ostrom-Org` or is refused with 409 `org_required`, as `MembershipOrgResolver` does.
   * The demo keeps one set of data, Acme's; another organization reads none of its artifacts.
   */
  otherOrganizations: Organization[];
  members: Member[];
  teams: Team[];
  workflows: Workflow[];
  /** The organization's workflow runs, newest first. */
  workflowRuns: WorkflowRun[];
  /**
   * `never` (the server's default since core#66 and server#159, S2-15): the asker never approves their own request;
   * `sole-approver`, chosen by the organization: the asker who is the only approver may, and the receipt says so.
   */
  selfApproval: string;
  rules: Rule[];
  /** Signed decisions on rules, workflows, owners and policies; newest first. */
  decisions: Decision[];
  mcpServers: McpServer[];
  /** Secrets as the server lists them: names and metadata, never a value. */
  secrets: Secret[];
  mcpCalls: McpCall[];
  /** The MCP host's processes; a restart clears a failure and a backoff. */
  mcpHosted: McpHostedProcess[];
  budgets: Budget[];
  /** The spending served instead of the fixture's: the large organization's (PERF-CONSOLE). */
  spending?: (period: 'month' | 'week') => Spending;
  cloudSessions: CloudSession[];
  runners: Runner[];
  automations: Automation[];
  automationRuns: AutomationRun[];
  artifacts: Artifact[];
  artifactVersions: Record<string, ArtifactVersion[]>;
  /** Who reads an artifact shared with people, by artifact. */
  artifactMembers: Record<string, string[]>;
  sharedAccounts: SharedAccount[];
  /** The run each idempotency key queued, by `automation id:key`: a replay answers it, never a second run. */
  runsByKey: Record<string, AutomationRun>;
  /** The next shared account id; ids are never reused, even after a removal. */
  nextAccountId: number;
  /**
   * When the person signed in (ms since the epoch): when the demo opened, then each sign-in link. A yes needs a
   * sign-in of no more than five minutes, as on the server (S2-54), so the demo asks to sign in again once it has been
   * open that long. Opening the link in a new page starts the demo afresh, its data with it.
   */
  signedInAt: number;
  /** The session cookie holds an account: the demo opens signed in, a sign-out empties it, a link fills it. */
  signedIn: boolean;
  /** Approver links already exchanged: each signs in once (server#58). */
  usedLinks: string[];
}

export function createMockDb(): MockDb {
  const opened = Date.now();
  return {
    instanceAdmin: false,
    ...initialCloudAdmin(),
    instanceAdmins: initialInstanceAdmins(),
    instanceSettings: initialInstanceSettings(),
    activity: initialActivity(),
    audit: initialAudit(),
    approvals: initialApprovals(),
    approvers: initialApprovers(),
    unlinkedAuthors: ['apr-merge-412'],
    sessions: initialSessions(),
    todos: initialTodos(),
    stopHookOff: [],
    receipts: initialReceipts(),
    organization: initialOrganization(),
    otherOrganizations: [],
    noOrganization: false,
    signUp: 'open',
    grants: [],
    setupUsed: false,
    orgMembers: { [initialOrganization().id]: initialOrgMembers() },
    slugs: { [initialOrganization().id]: 'acme' },
    invitations: initialInvitations(),
    elsewhere: [invitedOrganization()],
    nextInvitation: 1,
    githubInstalled: { [initialOrganization().id]: true },
    repos: { [initialOrganization().id]: initialRepos() },
    githubLinks: { [initialOrganization().id]: initialGithubLinks() },
    analyses: {},
    members: initialMembers(),
    teams: initialTeams(),
    workflows: initialWorkflows(),
    workflowRuns: initialWorkflowRuns(),
    selfApproval: 'never',
    rules: initialRules(),
    decisions: initialDecisions(),
    mcpServers: initialMcpServers(),
    secrets: initialSecrets(),
    mcpCalls: initialMcpCalls(),
    mcpHosted: initialMcpHosted(),
    environmentVariants: initialEnvironmentVariants(),
    environmentAssignments: initialEnvironmentAssignments(),
    environmentExclusions: initialEnvironmentExclusions(),
    nextEnvironmentVariant: 6,
    environmentUnavailable: [],
    myMcpServers: [
      {
        name: 'maya-notes',
        url: 'https://notes.maya.dev/mcp',
        transport: 'http',
        enabled: true,
        scope: 'per-member',
        secretNames: [],
        owner: MEMBER_IDS.maya,
      },
    ],
    mcpAssignments: initialMcpAssignments(),
    mcpPolicies: initialMcpPolicies(),
    mcpPrefixes: {},
    skills: initialSkills(),
    skillVersions: initialSkillVersions(),
    skillAssignments: initialSkillAssignments(),
    skillInstallations: initialSkillInstallations(),
    hooks: initialHooks(),
    hookVersions: initialHookVersions(),
    hookAssignments: initialHookAssignments(),
    hookFiles: initialHookFiles(),
    modelPolicies: { [initialOrganization().id]: initialModelPolicy(MEMBER_IDS.theo) },
    inferenceSettings: {
      [initialOrganization().id]: { anthropicKeySecret: 'ANTHROPIC_API_KEY', useSharedAccounts: true },
    },
    nextPolicyId: 3,
    imported: {},
    cutoverAvailable: true,
    budgets: initialBudgets(),
    cloudSessions: initialCloudSessions(),
    runners: initialRunners(),
    automations: initialAutomations(),
    automationRuns: initialAutomationRuns(),
    artifacts: initialArtifacts(),
    artifactVersions: initialArtifactVersions(),
    artifactMembers: initialArtifactMembers(),
    sharedAccounts: initialSharedAccounts(),
    groups: initialGroups(opened),
    nextGroup: 3,
    runsByKey: {},
    nextAccountId: 100,
    signedInAt: opened,
    signedIn: true,
    confirmations: initialConfirmations(opened),
    waits: initialWaits(opened),
    webhooks: initialWebhooks(),
    webhookDeliveries: initialWebhookDeliveries(),
    webhookTests: {},
    nextWebhook: 4,
    nextDelivery: 4,
    nextWebhookSecret: 100,
    staleConfirmations: ['gc-models-stale'],
    refusedWrites: initialRefusedWrites(),
    usedLinks: [],
    deviceLogins: initialDeviceLogins(),
    authSessions: initialAuthSessions(),
    providers: ['github'],
    tokens: initialTokens(),
    nextToken: 3,
    devices: initialDevices(),
    serviceKeys: initialServiceKeys(),
    nextServiceKey: 2,
    billing: initialBilling(),
    invoices: initialInvoices(),
  };
}

/** The server's own checks on top of the contract's shape: a name it can route to, an https URL. */
const zMcpServerWrite = z.extend(zMcpServer, {
  name: z.string().check(z.regex(/^[a-z][a-z0-9-]{0,39}$/)),
  url: z.url({ protocol: /^https$/ }),
  // The relay's two scopes (`McpRules`): one shared credential, or each member's own.
  scope: z.enum(['shared', 'per-member']),
});
/** A parsed write as the contract's server: an absent list stays absent, never `undefined`. */
function serverFrom(write: z.infer<typeof zMcpServerWrite>): McpServer {
  const server: McpServer = {
    name: write.name,
    url: write.url,
    transport: write.transport,
    enabled: write.enabled,
    scope: write.scope,
  };
  if (write.secretNames !== undefined) server.secretNames = write.secretNames;
  if (write.tools !== undefined) server.tools = write.tools;
  return server;
}
/** Secrets are environment variables in the agent's sandbox: CAPITALS, digits and underscores. */
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
/**
 * A budget names who it limits (no subject for the organization; for members, a member's id, or none for every
 * member) and at least one positive amount. As the server, no workflow budget.
 */
const zBudgetWrite = z
  .extend(zBudget, {
    scope: z.enum(['org', 'member']),
    usdPerMonth: z.optional(z.number().check(z.positive())),
    usdPerDay: z.optional(z.number().check(z.positive())),
  })
  .check(
    z.refine((budget) => budget.scope === 'member' || budget.subject === undefined),
    z.refine((budget) => budget.usdPerMonth !== undefined || budget.usdPerDay !== undefined),
  );
// The body as the server reads it: any agent name parses, and an unknown one is refused in the server's words below.
const SENT_CLOUD_SESSION = z.extend(zCreateCloudSessionBody, { agent: z.string() });
/** A recipe as the server stores it: the fields sent, none left `undefined` (the body's parse keeps them so). */
function storedRecipe(
  sent: NonNullable<z.infer<typeof SENT_CLOUD_SESSION>['environment']>,
): CloudEnvironment {
  const { repositories, workingDirectory, setup, requiredVariables, requireGitHub, gitEmailDomain } = sent;
  return {
    ...(repositories === undefined
      ? {}
      : {
          repositories: repositories.map(({ url, path, ref, branch }) => ({
            url,
            ...(path === undefined ? {} : { path }),
            ...(ref === undefined ? {} : { ref }),
            ...(branch === undefined ? {} : { branch }),
          })),
        }),
    ...(workingDirectory === undefined ? {} : { workingDirectory }),
    ...(setup === undefined
      ? {}
      : {
          setup: {
            ...(setup.create === undefined ? {} : { create: setup.create }),
            ...(setup.start === undefined ? {} : { start: setup.start }),
          },
        }),
    ...(requiredVariables === undefined ? {} : { requiredVariables }),
    ...(requireGitHub === undefined ? {} : { requireGitHub }),
    ...(gitEmailDomain === undefined ? {} : { gitEmailDomain }),
  };
}
/** A session that still holds a runner: it can be stopped. */
const LIVE = new Set(['queued', 'starting', 'running']);
/** The server's page of sessions (ostrom-server `SessionsRoutes`): 50 lines, and never more. */
const SESSIONS_PAGE = 50;
/** The server's largest page of rules, and its default (`ListRulesUseCase.MAX_RULES`). */
const RULES_PAGE = 1000;
/** What a pause or a resume leaves of a shared account's status, as ostrom-server's `AccountStatus.awaitsSignIn`. */
function statusAfterPause(status: string, paused: boolean): string {
  if (status === 'reconnect_required' || status === 'wrong_account') return status;
  if (paused) return 'disabled';
  return status === 'disabled' ? 'ready' : status;
}

/** The server reports an account paused exactly when its status is disabled (ostrom-server `SharedAccount`). */
function pausedAs(status: string): { paused: boolean; status: string } {
  return { paused: status === 'disabled', status };
}

/** The vendor's name the console sends, and the agent the server keeps for it (ostrom-server `AccountProvider`). */
const PROVIDERS = new Map([
  ['anthropic', 'claude'],
  ['claude', 'claude'],
  ['openai', 'codex'],
  ['codex', 'codex'],
]);
const zPolicy = z.object({ selfApproval: z.enum(['sole-approver', 'never']) });

/** Owners and admins manage the members, as the server's `orgs:write` scope does. */
function canManage(db: MockDb): boolean {
  const role = db.members.find((member) => member.login === me.dev.login)?.role;
  return role === 'owner' || role === 'admin';
}

/** An automation changes by its owner, or by an owner or an admin of the organization. */
function mayChange(db: MockDb, automation: Automation): boolean {
  return automation.owner === me.dev.login || canManage(db);
}

function switchAutomation(
  db: MockDb,
  id: string,
  enabled: boolean,
  at: string,
): HttpResponse<Automation | ApiError> {
  const index = db.automations.findIndex((item) => item.id === id);
  const automation = db.automations[index];
  if (automation === undefined) return refusal(404, 'not_found', 'automation not found');
  if (!mayChange(db, automation)) return refusal(403, 'forbidden', 'only its owner, an owner or an admin');
  const switched: Automation = { ...automation, enabled, updatedAt: at };
  db.automations[index] = switched;
  return HttpResponse.json(switched);
}

/** The mock's stand-in for the server's check: a receipt whose signature names no key does not verify. */
export const MOCK_KEY: PublicKey = {
  kid: '4f2a9c1b',
  alg: 'ed25519',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----',
};

/** A person who just signed up: in no organization, with no shared account, workflow nor rule of their own yet. */
export function freshAccount(db: MockDb): void {
  db.noOrganization = true;
  db.sharedAccounts = [];
  db.workflows = [];
}

/** Puts a database back to its first state in place: the running handlers keep their reference. */
export function resetMockDb(db: MockDb): void {
  Object.assign(db, createMockDb());
}

function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

/** The routes that act in an organization only when the call names one (`namedMember` on the server). */
const WITH_ORG_IF_NAMED = /^\/api\/v1\/devices(?:\/[^/]+)?$/;

/** The organization a call acts in, once the first handler let it through. */
function organizationOf(db: MockDb, request: Request): Organization {
  const named = request.headers.get(ORG_HEADER);
  return membershipsOf(db).find((organization) => organization.id === named) ?? db.organization;
}

/** The organization a call acts in, as `MembershipOrgResolver` resolves it; a refusal when it cannot. */
function resolveOrganization(db: MockDb, request: Request): Organization | HttpResponse<ApiError> {
  const named = request.headers.get(ORG_HEADER);
  if (membershipsOf(db).length === 0)
    return refusal(404, 'not_found', 'You are not a member of any organization yet.');
  if (named === null) {
    return db.otherOrganizations.length === 0
      ? db.organization
      : refusal(
          409,
          ORG_REQUIRED,
          'You are a member of several organizations: name one with the Ostrom-Org header.',
        );
  }
  // An organization the person is not a member of is not found, like anything of another organization.
  const found = membershipsOf(db).find((organization) => organization.id === named);
  return found ?? refusal(404, 'not_found', 'organization not found');
}

function isAsker(approval: Approval, login: string): boolean {
  return (approval.askedBy ?? []).some((author) => author.toLowerCase() === login.toLowerCase());
}

/**
 * The server's rule (prototype `selfCheck`): by default (`never`) the person who asked never approves; under
 * `sole-approver` they cannot while another approver exists, and as the only approver the approval passes and is
 * marked self-approved. A refusal always passes.
 */
export function selfApprovalRefusal(
  approval: Approval,
  approvers: readonly string[],
  login: string,
  policy = 'never',
): string | undefined {
  const asked = new Set((approval.askedBy ?? []).map((author) => author.toLowerCase()));
  if (!asked.has(login.toLowerCase())) return undefined;
  if (policy === 'never') return 'You asked for this: your organization never lets the asker approve.';
  const others = approvers.filter((approver) => !asked.has(approver.toLowerCase()));
  return others.length === 0 ? undefined : `You asked for this: ${others.join(' or ')} has to approve it.`;
}

/** The server's refusal of a yes that waits for the approver's GitHub link (`GitHubLinkRequiredException`). */
export const GITHUB_LINK_REQUIRED =
  "This pull request's author has no GitHub account linked in Ostrom: link your own GitHub account in My account to approve it.";

/** A yes on this approval waits for the person's GitHub link: an unlinked author, the `never` policy, no link yet. */
function needsGithubLink(db: MockDb, approval: Approval): boolean {
  return (
    db.selfApproval === 'never' &&
    db.unlinkedAuthors.includes(approval.id) &&
    !db.providers.includes('github')
  );
}

/** What the person may do with an approval, as the server's view says it (`ApprovalCallerView`). */
export function callerViewOf(db: MockDb, approval: Approval): ApprovalCallerView {
  const login = me.dev.login;
  const you = { login, self: isAsker(approval, login) };
  const approvers = db.approvers[approval.id] ?? [];
  if (approval.status !== 'pending' || !approvers.includes(login))
    return { ...you, canApprove: false, reason: 'You cannot answer this approval.' };
  const refused = selfApprovalRefusal(approval, approvers, login, db.selfApproval);
  if (refused !== undefined)
    return { ...you, canApprove: false, reason: refused, reasonType: 'self_approval_refused' };
  if (needsGithubLink(db, approval))
    return { ...you, canApprove: false, reason: GITHUB_LINK_REQUIRED, reasonType: 'github_link_required' };
  return { ...you, canApprove: true };
}

function answered(approval: Approval, answer: ApprovalAnswer, selfApproved: boolean, at: string): Approval {
  return {
    ...approval,
    status: answer === 'approve' ? 'approved' : 'rejected',
    decidedBy: me.dev.login,
    decidedAt: at,
    ...(selfApproved ? { selfApproved } : {}),
  };
}

function receiptOf(approval: Approval, at: string): Receipt {
  return {
    id: `rcpt-${approval.id}`,
    subject: { kind: 'gate', id: approval.id, digest: approval.shownDigest },
    initiator: approval.askedBy?.[0] ?? me.dev.login,
    rules: [],
    decisions: [
      {
        approvalId: approval.id,
        by: me.dev.login,
        at,
        result: approval.status,
        ...(approval.selfApproved === true ? { selfApproved: true } : {}),
      },
    ],
    createdAt: at,
    signature: `ed25519;kid=4f2a9c1b;sha256=${approval.shownDigest};sig=mock`,
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** The approvals slice of the contract, served from memory with the server's rules. */
/** A rule decision is signed like any other: a decision line and its receipt, newest first. */
function recordRuleDecision(db: MockDb, rule: Rule, action: RuleStatus | 'deleted', at: string): void {
  const id = `dec-${String(db.decisions.length + 1)}`;
  db.decisions.unshift({
    id,
    at,
    by: me.dev.login,
    subject: { kind: 'rule', id: rule.id, label: rule.statement },
    action,
    receiptId: `rcpt-${id}`,
  });
  db.receipts.unshift({
    id: `rcpt-${id}`,
    subject: { kind: 'rule-change', id: rule.id, digest: `sha256:${id}` },
    initiator: me.dev.login,
    rules: [],
    decisions: [],
    createdAt: at,
    signature: `ed25519;kid=${MOCK_KEY.kid};sha256=${id};sig=mock`,
  });
}

/** A workflow decision is signed like a rule's: a decision line and its receipt, newest first. */
function recordWorkflowDecision(db: MockDb, workflow: Workflow, action: string, at: string): void {
  const id = `dec-${String(db.decisions.length + 1)}`;
  db.decisions.unshift({
    id,
    at,
    by: me.dev.login,
    subject: { kind: 'workflow', id: workflow.id, label: workflow.name },
    action,
    receiptId: `rcpt-${id}`,
  });
  db.receipts.unshift({
    id: `rcpt-${id}`,
    subject: { kind: 'workflow', id: workflow.id, digest: `sha256:${id}` },
    initiator: me.dev.login,
    rules: [],
    decisions: [],
    createdAt: at,
    signature: `ed25519;kid=${MOCK_KEY.kid};sha256=${id};sig=mock`,
  });
}

/** What the server keeps of a saved workflow: its new version, when and by whom. */
function savedWorkflow(workflow: Workflow, version: number, at: string): Workflow {
  return { ...workflow, version, updatedAt: at, updatedBy: me.dev.login };
}

/** A gate as the zod schema reads it, with the optional fields it left out really absent. */
function ruleGateOf(gate: z.infer<typeof zRuleGate>): RuleGate {
  return {
    // `keywords` and `gate` are the catalogue's, never a rule's: a rule gate keeps its own fields only.
    actions: gate.actions.map(({ class: actionClass, label, patterns, repos, tools }) => ({
      class: actionClass,
      label,
      patterns,
      ...(repos === undefined ? {} : { repos }),
      ...(tools === undefined ? {} : { tools }),
    })),
    approvers: gate.approvers,
    ...(gate.reason === undefined ? {} : { reason: gate.reason }),
    ...(gate.checks === undefined
      ? {}
      : {
          checks: gate.checks.map(({ check, attested }) => ({
            check,
            ...(attested === undefined ? {} : { attested }),
          })),
        }),
  };
}

/** What a rule becomes after a decision: decided by the caller, or back to proposed with no decider. */
function decided(rule: Rule, status: RuleStatus, at: string): Rule {
  if (status !== 'proposed') return { ...rule, status, decidedBy: me.dev.login, decidedAt: at };
  const open: Rule = { ...rule, status };
  delete open.decidedBy;
  delete open.decidedAt;
  return open;
}

/** The token of the demo sign-in e-mail: `/auth/email#token=ml_demo` signs in once in the mock console. */
export const DEMO_EMAIL_TOKEN = 'ml_demo';
/** A sign-in e-mail's token opened in another browser than the one that asked for it: refused with 403. */
export const OTHER_BROWSER_EMAIL_TOKEN = 'ml_other_browser';

export { FRESH_SIGN_IN_MS };

export function createHandlers(db: MockDb, now: () => Date = () => new Date()): HttpHandler[] {
  const find = (id: string): Approval | undefined => db.approvals.find((approval) => approval.id === id);
  const notFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'approval not found');
  const findReceipt = (id: string): Receipt | undefined => db.receipts.find((receipt) => receipt.id === id);
  const receiptNotFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'receipt not found');
  const callsOf = (request: Request): McpCall[] =>
    organizationOf(db, request).id === db.organization.id ? db.mcpCalls : [];
  return [
    // First: a call that acts in the caller's organization is refused before any handler when it cannot be resolved.
    http.all('*/api/v1/*', ({ request }) => {
      const { pathname } = new URL(request.url);
      if (!actsInOrganization(pathname)) return undefined;
      // The workstations are the person's: `/devices` reads an organization only when the call names one.
      if (WITH_ORG_IF_NAMED.test(pathname) && !request.headers.has(ORG_HEADER)) return undefined;
      const organization = resolveOrganization(db, request);
      return organization instanceof HttpResponse ? organization : undefined;
    }),
    // `/me` never needs the header (ostrom-server#92): it says who is signed in; with Ostrom-Org naming one of the
    // person's organizations it adds their member and that organization, any other value is ignored (never 409 nor 404).
    handleGetMe(({ request }) => {
      if (!db.signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      const { member, ...signedIn } = me;
      const named = request.headers.get(ORG_HEADER);
      const organization = membershipsOf(db).find((item) => item.id === named);
      // `instanceAdmin` is on the answer only for a person who administers the instance.
      const who = db.instanceAdmin ? { ...signedIn, instanceAdmin: true } : signedIn;
      if (organization === undefined) return HttpResponse.json(who);
      // The person's member in the organization named, with the role they hold there (the first one's until set).
      const role = demoRoleIn(db, organization, now);
      return HttpResponse.json({
        ...who,
        member: { ...member, ...(role === undefined ? {} : { role }) },
        organization,
      });
    }),
    // Every feature, as a server with everything configured: a test that needs less overrides this handler.
    handleCapabilities(() =>
      db.signedIn
        ? HttpResponse.json(demoCapabilities())
        : refusal(401, 'unauthorized', 'nobody is signed in'),
    ),
    // An approver's link (`opk_…`) is exchanged once for the session cookies; the body carries no secret.
    handleExchangeSignInLink(async ({ request }) => {
      const body = zExchangeSignInLinkBody.safeParse(await readJson(request));
      if (!body.success || !body.data.token.startsWith('opk_') || db.usedLinks.includes(body.data.token))
        return refusal(401, 'invalid_link', 'This link was already used or has expired.');
      db.usedLinks = [...db.usedLinks, body.data.token];
      db.signedIn = true;
      db.signedInAt = now().getTime();
      return HttpResponse.json(
        { redirect: '/yes', csrfToken: 'csrf-demo' },
        { headers: { 'Set-Cookie': 'ostrom_csrf=csrf-demo; Path=/; SameSite=Lax' } },
      );
    }),
    handleLogout(() => {
      db.signedIn = false;
      return new HttpResponse(null, {
        status: 204,
        headers: { 'Set-Cookie': 'ostrom_csrf=; Path=/; Max-Age=0' },
      });
    }),
    // The e-mail sign-in answers the same whether the address has an account or not.
    handleRequestSignInEmail(async ({ request }) => {
      const body = zRequestSignInEmailBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'an e-mail address is needed');
      return new HttpResponse(null, { status: 202 });
    }),
    handleVerifySignInEmail(async ({ request }) => {
      const body = zVerifySignInEmailBody.safeParse(await readJson(request));
      // The server refuses a link opened in a browser other than the one that asked for it (ostrom-server#176).
      if (body.success && body.data.token === OTHER_BROWSER_EMAIL_TOKEN)
        return refusal(
          403,
          'email_link_other_browser',
          'This sign-in link was asked for in another browser. Open it there, or ask for a new link from this one.',
        );
      if (!body.success || body.data.token !== DEMO_EMAIL_TOKEN)
        return refusal(401, 'invalid_link', 'This link was already used or has expired.');
      db.signedInAt = now().getTime();
      db.signedIn = true;
      return HttpResponse.json(
        { redirect: '/yes', csrfToken: 'csrf-demo' },
        { headers: { 'Set-Cookie': 'ostrom_csrf=csrf-demo; Path=/; SameSite=Lax' } },
      );
    }),
    handleListApprovals(({ request }) => {
      const query = new URL(request.url).searchParams;
      // The contract writes several statuses comma-separated (form, explode false); a repeated key reads the same.
      const statuses = query.getAll('status').flatMap((value) => value.split(','));
      const items = db.approvals.filter((approval) => {
        if (query.get('mine') === 'true') {
          return approval.status === 'pending' && (db.approvers[approval.id] ?? []).includes(me.dev.login);
        }
        return statuses.length === 0 || statuses.some((status) => status === approval.status);
      });
      return HttpResponse.json({ items });
    }),
    // Before `/approvals/{id}`, which would read `queue` as an id.
    handleGetApprovalQueue(() => {
      const viewOf = (approval: Approval): ApprovalView => ({ approval, you: callerViewOf(db, approval) });
      const queue: ApprovalQueue = {
        operator: me.dev.login,
        you: { login: me.dev.login, via: 'console' },
        pending: db.approvals
          .filter(
            (approval) =>
              approval.status === 'pending' && (db.approvers[approval.id] ?? []).includes(me.dev.login),
          )
          .map(viewOf),
        recent: db.approvals.filter((approval) => approval.status !== 'pending').map(viewOf),
      };
      return HttpResponse.json(queue);
    }),
    handleGetApprovalView(({ params }) => {
      const approval = find(params.id) ?? db.approvals.find((item) => item.group === params.id);
      if (approval === undefined) return notFound();
      const view: ApprovalView = { approval, you: callerViewOf(db, approval) };
      return HttpResponse.json(view);
    }),
    handleGetApproval(({ params }) => {
      // As server#185 reads it: an approval of the organization, else the first request of one of its gates, so a
      // session's gate opens its request (the server prefers the reader's own request on the gate).
      const approval = find(params.id) ?? db.approvals.find((item) => item.group === params.id);
      return approval === undefined ? notFound() : HttpResponse.json(approval);
    }),
    handleAnswerApproval(async ({ params, request }) => {
      const approval = find(params.id);
      if (approval === undefined) return notFound();
      const body = zAnswerApprovalRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'answer must be approve or reject');
      if (approval.status !== 'pending')
        return refusal(409, 'already_decided', 'this approval is already decided');
      if (body.data.shownDigest !== approval.shownDigest) {
        return refusal(409, 'shown_digest_mismatch', 'the approval changed since it was shown');
      }
      const approvers = db.approvers[approval.id] ?? [];
      if (!approvers.includes(me.dev.login))
        return refusal(403, 'forbidden', 'you cannot answer this approval');
      const refused =
        body.data.answer === 'approve'
          ? selfApprovalRefusal(approval, approvers, me.dev.login, db.selfApproval)
          : undefined;
      if (refused !== undefined) return refusal(403, 'self_approval_refused', refused);
      // A no never needs the link either.
      if (body.data.answer === 'approve' && needsGithubLink(db, approval))
        return refusal(403, 'github_link_required', GITHUB_LINK_REQUIRED);
      // A no never needs it; a yes needs a sign-in of no more than five minutes.
      if (body.data.answer === 'approve' && now().getTime() - db.signedInAt > FRESH_SIGN_IN_MS)
        return refusal(
          403,
          'step_up_required',
          'Sign in again to approve: your sign-in is more than five minutes old.',
        );
      const at = now().toISOString();
      const selfApproved = body.data.answer === 'approve' && isAsker(approval, me.dev.login);
      const next = answered(approval, body.data.answer, selfApproved, at);
      db.approvals = db.approvals.map((item) => (item.id === next.id ? next : item));
      const receipt = receiptOf(next, at);
      db.receipts = [receipt, ...db.receipts];
      const view: ApprovalView = {
        approval: next,
        receipt,
        you: callerViewOf(db, next),
      };
      return HttpResponse.json(view);
    }),
    // The contract's planned `/org`, kept for the organization tests; the screens read `/orgs/{org}`.
    handleGetOrganization(({ request }) => HttpResponse.json(organizationOf(db, request))),
    // The contract's planned `/members`: the server does not serve it (it serves `/orgs/{org}/members`), so the demo
    // answers 404 as it does, and a screen that still reads it fails in the tests instead of on a real server.
    handleListMembers(() =>
      refusal(404, 'not_found', 'GET /api/v1/members is not served: read /orgs/{org}/members'),
    ),
    ...createOrgsHandlers(() => db, now),
    ...createOrgDeletionHandlers(() => db),
    ...createTokensHandlers(() => db, now),
    ...createKeysAndDevicesHandlers(() => db, now, {
      manages: (request) => managesMembers(demoRoleIn(db, organizationOf(db, request), now)),
      stale: () => now().getTime() - db.signedInAt > FRESH_SIGN_IN_MS,
    }),
    ...createTodosHandlers(() => db, {
      manages: (request) => managesMembers(demoRoleIn(db, organizationOf(db, request), now)),
      knows: (request, memberId) =>
        membersIn(db, organizationOf(db, request), now).some((member) => member.id === memberId),
    }),
    ...createAccountHandlers(() => db, now),
    ...createDeviceHandlers(() => db, now, {
      actsIn: (request) => resolveOrganization(db, request),
      // The role `GET /orgs` lists: the page offers only the organizations this check accepts.
      manages: (organization) => managesMembers(demoRoleIn(db, organization, now)),
      freshSignInMs: FRESH_SIGN_IN_MS,
    }),
    ...createApproversGraphHandlers(() => db),
    ...createConfirmationHandlers(
      () => db,
      now,
      (request) => organizationOf(db, request),
    ),
    ...createWaitsHandlers(
      () => db,
      now,
      (request) => organizationOf(db, request),
      () => managesMembers(demoRoleIn(db, db.organization, now)),
    ),
    ...createWebhooksHandlers(
      () => db,
      now,
      (request) => organizationOf(db, request),
    ),
    ...createActivityHandlers(
      () => db,
      (request) => organizationOf(db, request).id === db.organization.id,
    ),
    ...createAuditHandlers(
      () => db,
      (request) => organizationOf(db, request).id === db.organization.id,
      () => canManage(db),
    ),
    handleListRules(({ request }) => {
      const params = new URL(request.url).searchParams;
      const status = params.get('status');
      const group = params.get('group');
      const matching = db.rules.filter(
        (rule) => (status === null || rule.status === status) && (group === null || rule.group === group),
      );
      // As the server pages them (`RulesApi`): `limit` brought into 1 to 1000, `after` the previous page's `next`.
      const after = params.get('after');
      const from = after === null ? 0 : matching.findIndex((rule) => rule.id === after) + 1;
      if (from === 0 && after !== null)
        return refusal(400, 'invalid_request', 'The cursor is not one a previous page gave.');
      const limit = Math.min(Math.max(Number(params.get('limit') ?? RULES_PAGE), 1), RULES_PAGE);
      const items = matching.slice(from, from + limit);
      const last = items.at(-1);
      return HttpResponse.json(
        from + limit < matching.length && last !== undefined ? { items, next: last.id } : { items },
      );
    }),
    handleUpdateRule(async ({ request, params }) => {
      const index = db.rules.findIndex((rule) => rule.id === params.id);
      const rule = db.rules[index];
      if (rule === undefined) return refusal(404, 'not_found', 'rule not found');
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins decide rules');
      const body = zUpdateRuleBody.safeParse(await readJson(request));
      // The server refuses a status or a strength it does not know, though the contract keeps both open for readers.
      if (
        !body.success ||
        (body.data.status !== undefined && !isKnown(knownValues(zRuleStatus), body.data.status)) ||
        (body.data.strength !== undefined && !isKnown(knownValues(zRuleStrength), body.data.strength))
      )
        return refusal(400, 'invalid_request', 'not a rule change');
      const at = now().toISOString();
      // The mock applies what the console sends; a gate sent as null is taken off, as on the server.
      const { statement, strength, group, why, output, scope, gate } = body.data;
      const edits: Rule = {
        ...rule,
        ...(statement === undefined ? {} : { statement }),
        ...(strength === undefined ? {} : { strength }),
        ...(group === undefined ? {} : { group }),
        ...(why === undefined ? {} : { why }),
        ...(output === undefined ? {} : { output }),
        ...(scope === undefined ? {} : { scope }),
        ...(gate === undefined || gate === null ? {} : { gate: ruleGateOf(gate) }),
      };
      if (gate === null) delete edits.gate;
      // New words accept a rule as fixed, unless it was rejected: a rejected rule reworded stays rejected.
      const status =
        body.data.status ?? (statement === undefined || rule.status === 'rejected' ? rule.status : 'edited');
      const next = status === rule.status ? edits : decided(edits, status, at);
      db.rules[index] = next;
      // A new strength alone is no new decision; new words, a new place or a new gate are.
      const reworded = [statement, group, why, output, scope, gate].some((field) => field !== undefined);
      // A decided rule edited without a new decision is signed as an edit.
      if (next.status !== rule.status) recordRuleDecision(db, next, next.status, at);
      else if (reworded)
        recordRuleDecision(
          db,
          next,
          next.status === 'accepted' || next.status === 'edited' ? 'edited' : next.status,
          at,
        );
      return HttpResponse.json(next);
    }),
    handleCreateRule(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins write rules');
      const body = zCreateRuleBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a rule needs a statement and a group');
      const {
        status = 'accepted',
        statement,
        group,
        output,
        strength,
        why,
        scope,
        reviewBy,
        gate,
      } = body.data;
      if (status !== 'accepted' && status !== 'proposed')
        return refusal(400, 'invalid_request', 'a new rule is proposed or accepted');
      const at = now().toISOString();
      // Ids are R- and digits: the next one follows the highest.
      const last = db.rules.reduce((max, rule) => Math.max(max, Number(rule.id.replace(/\D/g, ''))), 0);
      const written: Rule = {
        id: `R-${String(last + 1)}`,
        statement,
        group,
        output: output ?? 'note',
        strength: strength ?? 'required',
        ...(why === undefined ? {} : { why }),
        ...(scope === undefined ? {} : { scope }),
        ...(reviewBy === undefined ? {} : { reviewBy }),
        ...(gate === undefined ? {} : { gate: ruleGateOf(gate) }),
        confidence: 1,
        status: 'proposed',
        foundBy: me.dev.login,
        foundAt: at,
        origin: 'team',
      };
      const rule = decided(written, status, at);
      db.rules.unshift(rule);
      recordRuleDecision(db, rule, status, at);
      return HttpResponse.json(rule, { status: 201 });
    }),
    handleDeleteRule(({ params }) => {
      const rule = db.rules.find((candidate) => candidate.id === params.id);
      if (rule === undefined) return refusal(404, 'not_found', 'rule not found');
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins delete rules');
      db.rules = db.rules.filter((candidate) => candidate.id !== rule.id);
      recordRuleDecision(db, rule, 'deleted', now().toISOString());
      return new HttpResponse(null, { status: 204 });
    }),
    // The catalogue the gates decide on: the actions of the workflows' gates and of the accepted rules' gates.
    handleGetGateCatalog(() => {
      const actions = new Map<string, GateAction>();
      for (const workflow of db.workflows)
        for (const node of workflow.nodes)
          for (const action of node.actions ?? []) actions.set(action.class, action);
      for (const rule of db.rules)
        if (rule.status !== 'proposed' && rule.status !== 'rejected')
          for (const action of rule.gate?.actions ?? []) actions.set(action.class, action);
      return HttpResponse.json({ gates: [], actions: [...actions.values()] });
    }),
    handleBulkUpdateRules(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins decide rules');
      const body = zBulkUpdateRulesBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'ids and a status are needed');
      const at = now().toISOString();
      const ids = new Set(body.data.ids);
      let updated = 0;
      db.rules = db.rules.map((rule) => {
        if (!ids.has(rule.id) || rule.status === body.data.status) return rule;
        updated += 1;
        const next = decided(rule, body.data.status, at);
        recordRuleDecision(db, next, next.status, at);
        return next;
      });
      return HttpResponse.json({ updated });
    }),
    handleListDecisions(({ request }) => {
      const params = new URL(request.url).searchParams;
      const kind = params.get('subjectKind');
      const id = params.get('subjectId');
      return HttpResponse.json({
        items: db.decisions.filter(
          (decision) =>
            (kind === null || decision.subject.kind === kind) && (id === null || decision.subject.id === id),
        ),
      });
    }),
    // The demo's servers and their calls are Acme's: another organization has none.
    handleListMcpServers(({ request }) =>
      HttpResponse.json({
        items: organizationOf(db, request).id === db.organization.id ? db.mcpServers : [],
      }),
    ),
    handleCreateMcpServer(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins manage MCP servers');
      const body = zMcpServerWrite.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a name and an https URL are needed');
      if (db.mcpServers.some((server) => server.name === body.data.name))
        return refusal(409, 'already_exists', `an MCP server named ${body.data.name} exists`);
      const created = serverFrom(body.data);
      db.mcpServers.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    handleSaveMcpServer(async ({ request, params }) => {
      const index = db.mcpServers.findIndex((server) => server.name === params.name);
      if (index === -1) return refusal(404, 'not_found', 'MCP server not found');
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins manage MCP servers');
      const body = zMcpServerWrite.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a name and an https URL are needed');
      const saved = serverFrom(body.data);
      db.mcpServers[index] = saved;
      return HttpResponse.json(saved);
    }),
    handleDeleteMcpServer(({ params }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins manage MCP servers');
      const before = db.mcpServers.length;
      db.mcpServers = db.mcpServers.filter((server) => server.name !== params.name);
      return db.mcpServers.length === before
        ? refusal(404, 'not_found', 'MCP server not found')
        : new HttpResponse(null, { status: 204 });
    }),
    handleListMcpCalls(({ request }) => {
      const server = new URL(request.url).searchParams.get('server');
      return HttpResponse.json({
        items: callsOf(request).filter((call) => server === null || call.server === server),
      });
    }),
    handleGetMcpUsage(({ request }) => {
      const byServer: Record<string, number> = {};
      const byTool: Record<string, number> = {};
      for (const call of callsOf(request)) {
        byServer[call.server] = (byServer[call.server] ?? 0) + 1;
        byTool[call.tool] = (byTool[call.tool] ?? 0) + 1;
      }
      return HttpResponse.json({ byServer, byTool });
    }),
    ...createEnvironmentHandlers(() => db, {
      manages: (request) => managesMembers(demoRoleIn(db, organizationOf(db, request), now)),
      inDemoOrg: (request) => organizationOf(db, request).id === db.organization.id,
      // As the server: the organization's members, the ones `/orgs/{org}/members` lists.
      memberIds: () => membersIn(db, db.organization, now).map((member) => member.id),
      stale: () => now().getTime() - db.signedInAt > FRESH_SIGN_IN_MS,
      now,
      me: () => MEMBER_IDS.maya,
    }),
    ...createPersonalMcpHandlers(() => db, {
      inDemoOrg: (request) => organizationOf(db, request).id === db.organization.id,
      stale: () => now().getTime() - db.signedInAt > FRESH_SIGN_IN_MS,
      me: () => MEMBER_IDS.maya,
    }),
    ...createMcpHostedHandlers(
      () => db,
      (request) => organizationOf(db, request),
      now,
    ),
    ...createMcpAccessHandlers(
      () => db,
      (request) => organizationOf(db, request),
      now,
    ),
    ...createAdminHandlers(() => db, now),
    ...createDeliveryHandlers(
      () => db,
      (request) => organizationOf(db, request),
      now,
    ),
    ...createCloudAdminHandlers(
      () => db,
      {
        manages: (request) => managesMembers(demoRoleIn(db, organizationOf(db, request), now)),
        memberId: (request) =>
          membersIn(db, organizationOf(db, request), now).find((member) => member.login === me.dev.login)?.id,
        instanceAdmin: () => db.instanceAdmin,
      },
      now,
    ),
    ...createPolicyHandlers(
      () => db,
      (request) => organizationOf(db, request),
    ),
    ...createGroupsHandlers(
      () => db,
      (request) => organizationOf(db, request),
      now,
    ),
    ...createTeamCodeImportHandlers(
      () => db,
      (request) => organizationOf(db, request),
      now,
    ),
    handleListSecrets(() => HttpResponse.json({ items: db.secrets })),
    handleCreateSecret(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins manage secrets');
      const body = zSecretWrite.safeParse(await readJson(request));
      if (!body.success || !SECRET_NAME.test(body.data.name) || body.data.value === '')
        return refusal(400, 'invalid_request', 'a name in CAPITALS and a value are needed');
      if (db.secrets.some((secret) => secret.name === body.data.name))
        return refusal(409, 'already_exists', `a secret named ${body.data.name} exists`);
      const at = now().toISOString();
      const secret: Secret = {
        name: body.data.name,
        scope: body.data.scope ?? 'org',
        version: 1,
        createdAt: at,
        updatedAt: at,
        updatedBy: me.dev.login,
      };
      db.secrets.push(secret);
      return HttpResponse.json(secret, { status: 201 });
    }),
    handleRotateSecret(async ({ request, params }) => {
      const index = db.secrets.findIndex((secret) => secret.name === params.name);
      const secret = db.secrets[index];
      if (secret === undefined) return refusal(404, 'not_found', 'secret not found');
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins manage secrets');
      const body = zSecretWrite.safeParse(await readJson(request));
      if (!body.success || body.data.value === '')
        return refusal(400, 'invalid_request', 'a new value is needed');
      const rotated: Secret = {
        ...secret,
        version: secret.version + 1,
        updatedAt: now().toISOString(),
        updatedBy: me.dev.login,
      };
      db.secrets[index] = rotated;
      return HttpResponse.json(rotated);
    }),
    handleDeleteSecret(({ params }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins manage secrets');
      const user = db.mcpServers.find((server) => (server.secretNames ?? []).includes(params.name));
      if (user !== undefined)
        return refusal(
          409,
          'secret_in_use',
          `the MCP server ${user.name} uses this secret: remove it there first`,
        );
      const before = db.secrets.length;
      db.secrets = db.secrets.filter((secret) => secret.name !== params.name);
      return db.secrets.length === before
        ? refusal(404, 'not_found', 'secret not found')
        : new HttpResponse(null, { status: 204 });
    }),
    handleGetSpending(({ request }) => {
      const period = new URL(request.url).searchParams.get('period') ?? 'month';
      return period === 'month' || period === 'week'
        ? HttpResponse.json((db.spending ?? spendingFor)(period))
        : refusal(400, 'invalid_request', 'period is week or month');
    }),
    handleListBudgets(() =>
      HttpResponse.json({
        items: db.budgets,
        orgSpentUsd: (db.spending ?? spendingFor)('month').totalUsd,
        periodStart: '2026-10-01T00:00:00.000Z',
        resetsAt: '2026-11-01T00:00:00.000Z',
      }),
    ),
    handleSetBudget(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins set budgets');
      const body = zBudgetWrite.safeParse(await readJson(request));
      if (!body.success)
        return refusal(400, 'invalid_request', 'a scope, a subject outside the organization, and an amount');
      const budget: Budget = {
        scope: body.data.scope,
        hardStop: body.data.hardStop,
        ...(body.data.subject === undefined ? {} : { subject: body.data.subject }),
        ...(body.data.usdPerMonth === undefined ? {} : { usdPerMonth: body.data.usdPerMonth }),
        ...(body.data.usdPerDay === undefined ? {} : { usdPerDay: body.data.usdPerDay }),
      };
      const same = (item: Budget): boolean => item.scope === budget.scope && item.subject === budget.subject;
      db.budgets = db.budgets.some(same)
        ? db.budgets.map((item) => (same(item) ? budget : item))
        : [...db.budgets, budget];
      return HttpResponse.json(budget);
    }),
    handleListCloudSessions(({ request }) => {
      const status = new URL(request.url).searchParams.get('status');
      return HttpResponse.json({
        items: db.cloudSessions.filter((session) => status === null || session.status === status),
      });
    }),
    handleCreateCloudSession(async ({ request }) => {
      const body = SENT_CLOUD_SESSION.safeParse(await readJson(request));
      // Without a prompt the session is an interactive agent (contract): only the agent is required.
      if (!body.success) return refusal(400, 'invalid_request', 'an agent is needed');
      const agent = knownValues(zCloudAgentKind).find((known) => known === body.data.agent);
      if (agent === undefined)
        return refusal(
          400,
          'invalid_request',
          `Unknown agent ${body.data.agent}: use ${knownValues(zCloudAgentKind).join(', ')}.`,
        );
      const { repo, ref, environment } = body.data;
      // The server clones the recipe's repositories or the older single one, never both (ostrom-server
      // `CreateCloudSessionUseCase`).
      if (repo !== undefined && (environment?.repositories ?? []).length > 0)
        return refusal(
          400,
          'invalid_request',
          'Name the repositories in the environment, or repo, not both.',
        );
      const session: CloudSession = {
        id: `cs-${String(db.cloudSessions.length + 100)}`,
        owner: me.dev.login,
        agent,
        status: 'queued',
        createdAt: now().toISOString(),
        ...(body.data.name === undefined || body.data.name.trim() === ''
          ? {}
          : { name: body.data.name.trim() }),
        ...(body.data.model === undefined ? {} : { model: body.data.model }),
        ...(repo === undefined ? {} : { repo }),
        ...(ref === undefined ? {} : { ref }),
        ...(environment === undefined ? {} : { environment: storedRecipe(environment) }),
      };
      db.cloudSessions.unshift(session);
      return HttpResponse.json(session, { status: 201 });
    }),
    handleStopCloudSession(({ params }) => {
      const index = db.cloudSessions.findIndex((session) => session.id === params.id);
      const session = db.cloudSessions[index];
      if (session === undefined) return refusal(404, 'not_found', 'cloud session not found');
      if (session.owner !== me.dev.login && !canManage(db))
        return refusal(403, 'forbidden', 'only its owner, an owner or an admin stops a session');
      if (!LIVE.has(session.status)) return refusal(409, 'conflict', 'the session has already ended');
      db.cloudSessions[index] = { ...session, status: 'stopped', endedAt: now().toISOString() };
      return new HttpResponse(null, { status: 204 });
    }),
    handleSetCloudSessionGithubAccess(async ({ params, request }) => {
      const index = db.cloudSessions.findIndex((session) => session.id === params.id);
      const session = db.cloudSessions[index];
      // Anyone but the owner (an owner or an admin included) does not see the session as theirs: 404.
      if (session?.owner !== me.dev.login) return refusal(404, 'not_found', 'cloud session not found');
      const body = zSetCloudSessionGithubAccessBody.safeParse(await readJson(request));
      if (
        !body.success ||
        !isKnown(knownValues(zSetCloudSessionGithubAccessBody.shape.access), body.data.access)
      )
        return refusal(400, 'invalid_request', 'access is owner, shared or none');
      // Turning access off waits for a pause: a running agent keeps the token it already received.
      if (body.data.access === 'none' && session.status !== 'paused')
        return refusal(409, 'session_not_paused', 'Pause the session before turning its GitHub access off.');
      const changed: CloudSession = { ...session, githubAccess: body.data.access };
      db.cloudSessions[index] = changed;
      return HttpResponse.json(changed);
    }),
    handleListRunners(() => HttpResponse.json({ items: db.runners })),
    handleListAutomations(() => HttpResponse.json({ items: db.automations })),
    ...createAutomationWriteHandlers(() => db, [me.dev.login, MEMBER_IDS.maya], now),
    handleEnableAutomation(({ params }) => switchAutomation(db, params.id, true, now().toISOString())),
    handleDisableAutomation(({ params }) => switchAutomation(db, params.id, false, now().toISOString())),
    handleListAutomationRuns(({ params }) =>
      HttpResponse.json({ items: db.automationRuns.filter((run) => run.automationId === params.id) }),
    ),
    handleTestAutomation(async ({ request, params }) => {
      const automation = db.automations.find((item) => item.id === params.id);
      if (automation === undefined) return refusal(404, 'not_found', 'automation not found');
      if (!mayChange(db, automation))
        return refusal(403, 'forbidden', 'only its owner, an owner or an admin runs it');
      const body = zTestAutomationBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'payload and dryRun');
      if (body.data.dryRun === true) {
        const dryRun: AutomationDryRun = {
          renderedPrompt: automation.action.prompt ?? '',
          variables: [],
          problems: body.data.payload === undefined ? [] : [{ path: '$', rule: 'not_scalar' }],
          nextRuns: [],
        };
        return HttpResponse.json(dryRun);
      }
      const key = request.headers.get('Idempotency-Key');
      if (key === null) return refusal(400, 'invalid_request', 'a test run needs an Idempotency-Key');
      // A replay of the same key answers the run it already queued, never a second one.
      const replayed = db.runsByKey[`${automation.id}:${key}`];
      if (replayed !== undefined) return HttpResponse.json(replayed, { status: 202 });
      const at = now().toISOString();
      const run: AutomationRun = {
        id: `run-${String(db.automationRuns.length + 100)}`,
        automationId: automation.id,
        source: 'test',
        status: 'queued',
        version: automation.version,
        problems: [],
        createdAt: at,
        updatedAt: at,
      };
      db.automationRuns.unshift(run);
      db.runsByKey[`${automation.id}:${key}`] = run;
      return HttpResponse.json(run, { status: 202 });
    }),
    handleRotateAutomationSecret(({ params }) => {
      const automation = db.automations.find((item) => item.id === params.id);
      if (automation === undefined) return refusal(404, 'not_found', 'automation not found');
      if (!mayChange(db, automation))
        return refusal(403, 'forbidden', 'only its owner, an owner or an admin');
      if (automation.trigger.kind !== 'webhook')
        return refusal(409, 'conflict', 'this automation has no webhook');
      return HttpResponse.json({
        secret: `whsec_mock_${String(automation.version)}${now().getTime().toString(36)}`,
      });
    }),
    // The demo's artifacts are Acme's: another organization never sees them (CONVENTIONS § 16).
    handleListArtifacts(({ request }) =>
      HttpResponse.json({ items: organizationOf(db, request).id === db.organization.id ? db.artifacts : [] }),
    ),
    handleDeleteArtifact(({ params }) => {
      const artifact = db.artifacts.find((item) => item.id === params.id);
      if (artifact === undefined) return refusal(404, 'not_found', 'artifact not found');
      if (artifact.owner !== me.dev.login)
        return refusal(403, 'forbidden', 'only its owner deletes an artifact');
      db.artifacts = db.artifacts.filter((item) => item.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    handleListArtifactVersions(({ params }) =>
      HttpResponse.json({ items: db.artifactVersions[params.id] ?? [] }),
    ),
    handleListArtifactMembers(({ params }) =>
      HttpResponse.json({ members: db.artifactMembers[params.id] ?? [] }),
    ),
    handleShareArtifact(({ params }) => {
      const artifact = db.artifacts.find((item) => item.id === params.id);
      if (artifact === undefined) return refusal(404, 'not_found', 'artifact not found');
      if (artifact.owner !== me.dev.login)
        return refusal(403, 'forbidden', 'only its owner shares an artifact');
      if (!db.members.some((member) => member.id === params.memberId))
        return refusal(404, 'not_found', `${params.memberId} is not a member of the organization`);
      const readers = db.artifactMembers[params.id] ?? [];
      db.artifactMembers[params.id] = readers.includes(params.memberId)
        ? readers
        : [...readers, params.memberId];
      return new HttpResponse(null, { status: 204 });
    }),
    handleUnshareArtifact(({ params }) => {
      const artifact = db.artifacts.find((item) => item.id === params.id);
      if (artifact === undefined) return refusal(404, 'not_found', 'artifact not found');
      if (artifact.owner !== me.dev.login)
        return refusal(403, 'forbidden', 'only its owner shares an artifact');
      db.artifactMembers[params.id] = (db.artifactMembers[params.id] ?? []).filter(
        (id) => id !== params.memberId,
      );
      return new HttpResponse(null, { status: 204 });
    }),
    handleListSharedAccounts(() => HttpResponse.json({ items: db.sharedAccounts })),
    handleEnrollSharedAccount(async ({ request }) => {
      const body = zEnrollSharedAccountBody.safeParse(await readJson(request));
      const provider = body.success ? PROVIDERS.get(body.data.provider) : undefined;
      if (!body.success || body.data.label.trim() === '' || provider === undefined)
        return refusal(400, 'invalid_request', 'a provider, a label and a credential');
      if (!db.secrets.some((secret) => secret.name === body.data.credentialSecret))
        return refusal(400, 'invalid_request', `no secret named ${body.data.credentialSecret}`);
      const account: SharedAccount = {
        id: `acc-${String(db.nextAccountId++)}`,
        provider,
        label: body.data.label.trim(),
        owner: me.dev.login,
        status: 'ready',
        sharedWith: body.data.sharedWith ?? [],
        paused: false,
        ...(body.data.dailyAllocationUsd === undefined
          ? {}
          : { dailyAllocationUsd: body.data.dailyAllocationUsd }),
      };
      db.sharedAccounts.push(account);
      return HttpResponse.json(account, { status: 201 });
    }),
    handleUpdateSharedAccount(async ({ request, params }) => {
      const index = db.sharedAccounts.findIndex((item) => item.id === params.id);
      const account = db.sharedAccounts[index];
      if (account === undefined) return refusal(404, 'not_found', 'shared account not found');
      if (account.owner !== me.dev.login)
        return refusal(403, 'forbidden', 'only its owner changes a subscription');
      const body = zUpdateSharedAccountBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'sharedWith, dailyAllocationUsd or paused');
      const updated: SharedAccount = {
        ...account,
        ...(body.data.sharedWith === undefined ? {} : { sharedWith: body.data.sharedWith }),
        ...(body.data.dailyAllocationUsd === undefined
          ? {}
          : { dailyAllocationUsd: body.data.dailyAllocationUsd }),
        // A pause writes `disabled`, a resume `ready` again (ostrom-server); one waiting for a sign-in stays so.
        ...(body.data.paused === undefined
          ? {}
          : pausedAs(statusAfterPause(account.status, body.data.paused))),
      };
      db.sharedAccounts[index] = updated;
      return HttpResponse.json(updated);
    }),
    // TeamCode's « Refresh ownership »: an administrator hands an imported account over, and Ostrom renews it.
    handleHandOverSharedAccount(({ params }) => {
      const index = db.sharedAccounts.findIndex((item) => item.id === params.id);
      const account = db.sharedAccounts[index];
      if (account === undefined) return refusal(404, 'not_found', 'shared account not found');
      if (!canManage(db))
        return refusal(403, 'account_handover_forbidden', 'only an administrator hands it over');
      const handed: SharedAccount = {
        ...account,
        refreshOwnership: 'ostrom',
        status: account.status === 'pending_handover' ? 'ready' : account.status,
      };
      db.sharedAccounts[index] = handed;
      return HttpResponse.json(handed);
    }),
    handleRemoveSharedAccount(({ params }) => {
      const account = db.sharedAccounts.find((item) => item.id === params.id);
      if (account === undefined) return refusal(404, 'not_found', 'shared account not found');
      if (account.owner !== me.dev.login)
        return refusal(403, 'forbidden', 'only its owner removes a subscription');
      db.sharedAccounts = db.sharedAccounts.filter((item) => item.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    ...createGithubHandlers(
      () => db,
      (request) => organizationOf(db, request),
    ),
    // The demo's role in the organization the request names. The mock `/auth/me` keeps the fixture's admin, which the
    // console reads first: a test of a member overrides it too (as workflows.integration.test.tsx does).
    ...createRunHandlers(
      () => db,
      (request) => managesMembers(demoRoleIn(db, organizationOf(db, request), now)),
      () => DEMO_LOGIN,
      now,
    ),
    handleListWorkflows(({ request }) => {
      const status = new URL(request.url).searchParams.get('status');
      return HttpResponse.json({
        items: db.workflows.filter((workflow) => status === null || workflow.status === status),
      });
    }),
    handleGetWorkflow(({ params }) => {
      const workflow = db.workflows.find((item) => item.id === params.id);
      return workflow === undefined
        ? refusal(404, 'not_found', 'workflow not found')
        : HttpResponse.json(workflow);
    }),
    // Writes, as the server takes them: a person decides; a version saved in between is a conflict; a deletion signs.
    handleCreateWorkflow(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins change workflows');
      // Checked by the contract's schema, then read with its optional fields really absent.
      if (!zCreateWorkflowBody.safeParse(await readJson(request.clone())).success)
        return refusal(400, 'invalid_request', 'not a workflow');
      const sent = await request.json();
      if (db.workflows.some((item) => item.id === sent.id))
        return refusal(409, 'conflict', 'A workflow with this id exists.');
      const at = new Date().toISOString();
      const workflow = savedWorkflow(sent, 1, at);
      db.workflows.push(workflow);
      // As the server's `changeOf`: nothing before, so the decision is an edit.
      recordWorkflowDecision(db, workflow, 'edit', at);
      return HttpResponse.json(workflow, { status: 201 });
    }),
    handleSaveWorkflow(async ({ request, params }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins change workflows');
      if (!zSaveWorkflowBody.safeParse(await readJson(request.clone())).success)
        return refusal(400, 'invalid_request', 'not a workflow');
      const body = { data: await request.json() };
      if (body.data.workflow.id !== params.id)
        return refusal(400, 'invalid_request', 'the workflow id is not the path id');
      const at = new Date().toISOString();
      const current = db.workflows.find((item) => item.id === params.id);
      if (current === undefined) return refusal(404, 'not_found', 'workflow not found');
      if (body.data.expectedVersion !== undefined && body.data.expectedVersion !== current.version)
        return refusal(409, 'conflict', 'workflow_conflict: someone saved this workflow in between.');
      const workflow = savedWorkflow(body.data.workflow, (current.version ?? 0) + 1, at);
      db.workflows = db.workflows.map((item) => (item.id === workflow.id ? workflow : item));
      // As the server: a decision is signed only when something decided changed (steps, paths, status, name, the
      // repositories it is limited to).
      const decidedParts = (item: Workflow): unknown[] => [
        item.nodes,
        item.edges,
        item.status,
        item.name,
        item.repos ?? null,
      ];
      if (!sameValue(decidedParts(current), decidedParts(workflow)))
        recordWorkflowDecision(
          db,
          workflow,
          current.status === 'proposed' && workflow.status === 'accepted' ? 'accept' : 'edit',
          at,
        );
      return HttpResponse.json(workflow);
    }),
    handleDeleteWorkflow(({ params }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins change workflows');
      const workflow = db.workflows.find((item) => item.id === params.id);
      if (workflow === undefined) return refusal(404, 'not_found', 'workflow not found');
      db.workflows = db.workflows.filter((item) => item.id !== params.id);
      recordWorkflowDecision(db, workflow, 'delete', new Date().toISOString());
      return new HttpResponse(null, { status: 204 });
    }),
    handleGetGatePolicy(() => HttpResponse.json({ selfApproval: db.selfApproval })),
    handleSetGatePolicy(async ({ request }) => {
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins set the policy');
      const body = zPolicy.safeParse(await readJson(request));
      if (!body.success)
        return refusal(400, 'invalid_request', 'selfApproval must be sole-approver or never');
      db.selfApproval = body.data.selfApproval;
      return HttpResponse.json({ selfApproval: db.selfApproval });
    }),
    handleListSessions(({ request }) => {
      const query = new URL(request.url).searchParams;
      const open = query.get('open');
      const matching = db.sessions.filter(
        (session) => open === null || (session.endedAt === undefined) === (open === 'true'),
      );
      // As the server pages it: a full page carries `next`, its last id, which the next call reads back as `before`.
      const before = query.get('before');
      const from = before === null ? 0 : matching.findIndex((session) => session.id === before) + 1;
      const items = matching.slice(from, from + SESSIONS_PAGE);
      const last = items.at(-1);
      return HttpResponse.json(
        items.length === SESSIONS_PAGE && last !== undefined ? { items, next: last.id } : { items },
      );
    }),
    handleGetSession(({ params }) => {
      const session = db.sessions.find((item) => item.id === params.id);
      if (session === undefined) return refusal(404, 'not_found', 'session not found');
      const receipt = db.receipts.find((item) => item.id === session.receiptId);
      return HttpResponse.json(receipt === undefined ? { session } : { session, receipt });
    }),
    handleListReceipts(({ request }) => {
      const query = new URL(request.url).searchParams;
      const kind = query.get('subjectKind');
      const id = query.get('subjectId');
      const items = db.receipts.filter(
        (receipt) =>
          (kind === null || receipt.subject.kind === kind) && (id === null || receipt.subject.id === id),
      );
      return HttpResponse.json({ items });
    }),
    handleGetReceipt(({ params }) => {
      const receipt = findReceipt(params.id);
      return receipt === undefined ? receiptNotFound() : HttpResponse.json(receipt);
    }),
    handleVerifyReceipt(({ params }) => {
      const receipt = findReceipt(params.id);
      if (receipt === undefined) return receiptNotFound();
      const ok = receipt.signature.includes(`kid=${MOCK_KEY.kid}`);
      return HttpResponse.json(
        ok
          ? { ok, digest: receipt.subject.digest, kid: MOCK_KEY.kid }
          : { ok, reason: 'the signature does not match any key of this instance' },
      );
    }),
    handleGetReceiptBundle(({ params }) => {
      const receipt = findReceipt(params.id);
      if (receipt === undefined) return receiptNotFound();
      return HttpResponse.json({
        format: 'ostrom-receipt-bundle/1',
        receipt,
        chain: [],
        package: null,
        keys: [MOCK_KEY],
        exportedAt: now().toISOString(),
      });
    }),
    ...createBillingHandlers(
      () => db,
      () => db.organization.id,
      () =>
        managesBilling(
          orgRoleOf(db.orgMembers[db.organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role),
        ),
    ),
  ];
}
