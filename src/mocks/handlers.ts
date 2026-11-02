// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleAnswerApproval,
  handleBulkUpdateRules,
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
  handleGetGatePolicy,
  handleExchangeSignInLink,
  handleGetMe,
  handleGetOrganization,
  handleGetReceipt,
  handleGetReceiptBundle,
  handleGetSession,
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
  handleListMyOrganizations,
  handleListReceipts,
  handleListRules,
  handleListRunners,
  handleListSecrets,
  handleListSharedAccounts,
  handleRemoveSharedAccount,
  handleLogout,
  handleRequestSignInEmail,
  handleListSessions,
  handleListWorkflows,
  handleSetGatePolicy,
  handleUpdateRule,
  handleRotateAutomationSecret,
  handleRotateSecret,
  handleSaveMcpServer,
  handleSetBudget,
  handleShareArtifact,
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
  Artifact,
  ArtifactVersion,
  Automation,
  AutomationDryRun,
  AutomationRun,
  Budget,
  CloudSession,
  Decision,
  McpCall,
  McpServer,
  Member,
  Organization,
  PublicKey,
  Receipt,
  Rule,
  RuleStatus,
  Runner,
  Secret,
  SharedAccount,
  Session,
  Team,
  Workflow,
} from '@gen/api/types.gen';
import {
  zAnswerApprovalRequest,
  zBudget,
  zCreateCloudSessionBody,
  zEnrollSharedAccountBody,
  zBulkUpdateRulesBody,
  zMcpServer,
  zRequestSignInEmailBody,
  zSecretWrite,
  zTestAutomationBody,
  zUpdateSharedAccountBody,
  zUpdateRuleBody,
  zVerifySignInEmailBody,
  zExchangeSignInLinkBody,
} from '@gen/api/zod.gen';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { type AccountState, createAccountHandlers } from '@/mocks/account';
import { type ActivityState, createActivityHandlers } from '@/mocks/activity';
import { createApproversGraphHandlers } from '@/mocks/approversGraph';
import { type BillingState, createBillingHandlers } from '@/mocks/billing';
import { createGithubHandlers, type GithubState } from '@/mocks/github';
import { initialRepos } from '@/mocks/fixtures/github';
import { initialAuthSessions, initialTokens } from '@/mocks/fixtures/account';
import { initialActivity } from '@/mocks/fixtures/activity';
import { createOrgDeletionHandlers } from '@/mocks/orgDeletion';
import { createTokensHandlers, type TokensState } from '@/mocks/tokens';
import { createOrgsHandlers, DEMO_LOGIN, membershipsOf, type OrgsState } from '@/mocks/orgs';
import { z } from 'zod';
import { initialApprovals, initialApprovers, me } from '@/mocks/fixtures/approvals';
import {
  initialInvitations,
  initialMembers,
  initialOrganization,
  initialOrgMembers,
  initialTeams,
  invitedOrganization,
} from '@/mocks/fixtures/organization';
import { actsInOrganization, ORG_HEADER, ORG_REQUIRED } from '@/shared/api/orgHeader';
import { managesBilling, orgRoleOf } from '@/shared/org/roles';
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
  initialSharedAccounts,
} from '@/mocks/fixtures/sharing';
import { initialBilling, initialInvoices } from '@/mocks/fixtures/billing';
import { initialBudgets, spendingFor } from '@/mocks/fixtures/spend';
import { initialMcpCalls, initialMcpServers, initialSecrets } from '@/mocks/fixtures/tools';
import { initialReceipts, initialSessions } from '@/mocks/fixtures/sessions';
import { initialWorkflows } from '@/mocks/fixtures/workflows';

export interface MockDb
  extends AccountState, ActivityState, BillingState, GithubState, OrgsState, TokensState {
  approvals: Approval[];
  /** Who may answer each approval, by id. */
  approvers: Record<string, readonly string[]>;
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
  /** `sole-approver`: the asker who is the only approver may approve, and the receipt says so; `never`. */
  selfApproval: string;
  rules: Rule[];
  /** Signed decisions on rules, workflows, owners and policies; newest first. */
  decisions: Decision[];
  mcpServers: McpServer[];
  /** Secrets as the server lists them: names and metadata, never a value. */
  secrets: Secret[];
  mcpCalls: McpCall[];
  budgets: Budget[];
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
  return {
    activity: initialActivity(),
    approvals: initialApprovals(),
    approvers: initialApprovers(),
    sessions: initialSessions(),
    receipts: initialReceipts(),
    organization: initialOrganization(),
    otherOrganizations: [],
    noOrganization: false,
    orgMembers: { [initialOrganization().id]: initialOrgMembers() },
    slugs: { [initialOrganization().id]: 'acme' },
    invitations: initialInvitations(),
    elsewhere: [invitedOrganization()],
    nextInvitation: 1,
    githubInstalled: { [initialOrganization().id]: true },
    repos: { [initialOrganization().id]: initialRepos() },
    analyses: {},
    members: initialMembers(),
    teams: initialTeams(),
    workflows: initialWorkflows(),
    selfApproval: 'sole-approver',
    rules: initialRules(),
    decisions: initialDecisions(),
    mcpServers: initialMcpServers(),
    secrets: initialSecrets(),
    mcpCalls: initialMcpCalls(),
    budgets: initialBudgets(),
    cloudSessions: initialCloudSessions(),
    runners: initialRunners(),
    automations: initialAutomations(),
    automationRuns: initialAutomationRuns(),
    artifacts: initialArtifacts(),
    artifactVersions: initialArtifactVersions(),
    artifactMembers: initialArtifactMembers(),
    sharedAccounts: initialSharedAccounts(),
    runsByKey: {},
    nextAccountId: 100,
    signedInAt: Date.now(),
    signedIn: true,
    usedLinks: [],
    authSessions: initialAuthSessions(),
    tokens: initialTokens(),
    nextToken: 3,
    billing: initialBilling(),
    invoices: initialInvoices(),
  };
}

/** The server's own checks on top of the contract's shape: a name it can route to, an https URL. */
const zMcpServerWrite = zMcpServer.extend({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  url: z.url({ protocol: /^https$/ }),
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
/** A budget names who it limits (no subject for the organization) and at least one positive amount. */
const zBudgetWrite = zBudget
  .extend({
    scope: z.enum(['org', 'member', 'workflow']),
    usdPerMonth: z.number().positive().optional(),
    usdPerDay: z.number().positive().optional(),
  })
  .refine((budget) => (budget.scope === 'org') === (budget.subject === undefined))
  .refine((budget) => budget.usdPerMonth !== undefined || budget.usdPerDay !== undefined);
const CLOUD_AGENTS = new Set(['claude-code', 'codex']);
/** A session that still holds a runner: it can be stopped. */
const LIVE = new Set(['queued', 'starting', 'running']);
const PROVIDERS = new Set(['anthropic', 'openai']);
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
 * The server's rule (prototype `selfCheck`): the person who asked cannot approve while another approver exists;
 * as the only approver, the approval passes and is marked self-approved. A refusal always passes.
 */
export function selfApprovalRefusal(
  approval: Approval,
  approvers: readonly string[],
  login: string,
  policy = 'sole-approver',
): string | undefined {
  const asked = new Set((approval.askedBy ?? []).map((author) => author.toLowerCase()));
  if (!asked.has(login.toLowerCase())) return undefined;
  if (policy === 'never') return 'You asked for this: your organization never lets the asker approve.';
  const others = approvers.filter((approver) => !asked.has(approver.toLowerCase()));
  return others.length === 0 ? undefined : `You asked for this: ${others.join(' or ')} has to approve it.`;
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
function recordRuleDecision(db: MockDb, rule: Rule, action: RuleStatus, at: string): void {
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

/** How long a sign-in may say yes, as on the server (S2-54). */
export const FRESH_SIGN_IN_MS = 5 * 60_000;

export function createHandlers(db: MockDb, now: () => Date = () => new Date()): HttpHandler[] {
  const find = (id: string): Approval | undefined => db.approvals.find((approval) => approval.id === id);
  const notFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'approval not found');
  const findReceipt = (id: string): Receipt | undefined => db.receipts.find((receipt) => receipt.id === id);
  const receiptNotFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'receipt not found');
  return [
    // First: a call that acts in the caller's organization is refused before any handler when it cannot be resolved.
    http.all('*/api/v1/*', ({ request }) => {
      if (!actsInOrganization(new URL(request.url).pathname)) return undefined;
      const organization = resolveOrganization(db, request);
      return organization instanceof HttpResponse ? organization : undefined;
    }),
    // `/me` never needs the header: it names the organization when the call resolves to one.
    handleGetMe(() => {
      if (!db.signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      // `/me` takes no Ostrom-Org (contract): it names the organization only for a person in exactly one.
      const memberships = membershipsOf(db);
      return HttpResponse.json(memberships.length === 1 ? { ...me, organization: db.organization } : me);
    }),
    handleListMyOrganizations(() => HttpResponse.json({ items: membershipsOf(db) })),
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
    handleGetApproval(({ params }) => {
      const approval = find(params.id);
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
        return refusal(403, 'not_an_approver', 'you cannot answer this approval');
      const refused =
        body.data.answer === 'approve'
          ? selfApprovalRefusal(approval, approvers, me.dev.login, db.selfApproval)
          : undefined;
      if (refused !== undefined) return refusal(403, 'self_approval_refused', refused);
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
        you: { login: me.dev.login, self: isAsker(approval, me.dev.login), canApprove: false },
      };
      return HttpResponse.json(view);
    }),
    // The contract's planned `/org`, kept for the organization tests; the screens read `/orgs/{org}`.
    handleGetOrganization(({ request }) => HttpResponse.json(organizationOf(db, request))),
    handleListMembers(() => HttpResponse.json({ items: db.members })),
    ...createOrgsHandlers(() => db, now),
    ...createOrgDeletionHandlers(() => db),
    ...createTokensHandlers(() => db, now),
    ...createAccountHandlers(() => db, now),
    ...createApproversGraphHandlers(() => db),
    ...createActivityHandlers(() => db),
    handleListRules(({ request }) => {
      const params = new URL(request.url).searchParams;
      const status = params.get('status');
      const group = params.get('group');
      return HttpResponse.json({
        items: db.rules.filter(
          (rule) => (status === null || rule.status === status) && (group === null || rule.group === group),
        ),
      });
    }),
    handleUpdateRule(async ({ request, params }) => {
      const index = db.rules.findIndex((rule) => rule.id === params.id);
      const rule = db.rules[index];
      if (rule === undefined) return refusal(404, 'not_found', 'rule not found');
      if (!canManage(db)) return refusal(403, 'forbidden', 'only owners and admins decide rules');
      const body = zUpdateRuleBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'not a rule change');
      const at = now().toISOString();
      // The mock applies what the console sends (statement, strength, status); scope and review date are kept.
      const { statement, strength } = body.data;
      const edits: Rule = {
        ...rule,
        ...(statement === undefined ? {} : { statement }),
        ...(strength === undefined ? {} : { strength }),
      };
      const status = body.data.status ?? (statement === undefined ? rule.status : 'edited');
      const next = status === rule.status ? edits : decided(edits, status, at);
      db.rules[index] = next;
      if (next.status !== rule.status || statement !== undefined)
        recordRuleDecision(db, next, next.status, at);
      return HttpResponse.json(next);
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
    handleListMcpServers(() => HttpResponse.json({ items: db.mcpServers })),
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
        items: db.mcpCalls.filter((call) => server === null || call.server === server),
      });
    }),
    handleGetMcpUsage(() => {
      const byServer: Record<string, number> = {};
      const byTool: Record<string, number> = {};
      for (const call of db.mcpCalls) {
        byServer[call.server] = (byServer[call.server] ?? 0) + 1;
        byTool[call.tool] = (byTool[call.tool] ?? 0) + 1;
      }
      return HttpResponse.json({ byServer, byTool });
    }),
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
        ? HttpResponse.json(spendingFor(period))
        : refusal(400, 'invalid_request', 'period is week or month');
    }),
    handleListBudgets(() =>
      HttpResponse.json({
        items: db.budgets,
        orgSpentUsd: spendingFor('month').totalUsd,
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
      const body = zCreateCloudSessionBody.safeParse(await readJson(request));
      // Without a prompt the session is an interactive agent (contract): only the agent is required.
      if (!body.success) return refusal(400, 'invalid_request', 'an agent is needed');
      if (!CLOUD_AGENTS.has(body.data.agent))
        return refusal(400, 'invalid_request', `no cloud agent ${body.data.agent}`);
      const session: CloudSession = {
        id: `cs-${String(db.cloudSessions.length + 100)}`,
        owner: me.dev.login,
        agent: body.data.agent,
        status: 'queued',
        createdAt: now().toISOString(),
        ...(body.data.name === undefined || body.data.name.trim() === ''
          ? {}
          : { name: body.data.name.trim() }),
        ...(body.data.model === undefined ? {} : { model: body.data.model }),
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
    handleListRunners(() => HttpResponse.json({ items: db.runners })),
    handleListAutomations(() => HttpResponse.json({ items: db.automations })),
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
      if (!body.success || body.data.label.trim() === '' || !PROVIDERS.has(body.data.provider))
        return refusal(400, 'invalid_request', 'a provider, a label and a credential');
      if (!db.secrets.some((secret) => secret.name === body.data.credentialSecret))
        return refusal(400, 'invalid_request', `no secret named ${body.data.credentialSecret}`);
      const account: SharedAccount = {
        id: `acc-${String(db.nextAccountId++)}`,
        provider: body.data.provider,
        label: body.data.label.trim(),
        owner: me.dev.login,
        status: 'active',
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
        ...(body.data.paused === undefined ? {} : { paused: body.data.paused }),
      };
      db.sharedAccounts[index] = updated;
      return HttpResponse.json(updated);
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
      const open = new URL(request.url).searchParams.get('open');
      const items = db.sessions.filter(
        (session) => open === null || (session.endedAt === undefined) === (open === 'true'),
      );
      return HttpResponse.json({ items });
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
