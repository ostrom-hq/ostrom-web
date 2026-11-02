// SPDX-License-Identifier: AGPL-3.0-only
// Lines 5.4, 5.6 and 5.7 of the journey (demo/PARCOURS.md), console side, against the real server. The gate is opened
// through the API in the setup, as the QA bench does it (ostrom-e2e `scripts/load-setup.ts`): an accepted workflow
// whose gate node names the approvers of pushes to main of a repository, and a personal token with `gates:ask` that
// asks for such a push. The yes, the refusal and the receipt are then read and given in the console.
import { expect, type Page, test } from '@playwright/test';
import {
  zAskGateResponse,
  zCreateLaunchResponse,
  zCreateTokenResponse,
  zGetCurrentPackageResponse,
  zGetGatePolicyResponse,
  zListApprovalsResponse,
  zMe,
  zSignWorkflowReceiptResponse,
  zVerifyReceiptResponse,
} from '../gen/api/zod.gen';
import {
  accept,
  anotherPerson,
  callFromPage,
  closeOthers,
  freshEmail,
  invitationTo,
  ownerOfNewOrganization,
  signIn,
} from './real';

test.afterEach(closeOthers);

/** The GitHub login the server knows the person signed in on `page` by: what a gate node names. */
async function loginOf(page: Page): Promise<string> {
  const me = await callFromPage(page, 'GET', '/api/v1/auth/me');
  expect(me.status).toBe(200);
  return zMe.parse(me.body).dev.login;
}

/** A new repository of `org` whose pushes to main need a yes from `approvers` (workflow made by its owner). */
async function gatedRepository(owner: Page, org: string, approvers: readonly string[]): Promise<string> {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const repo = `acme/api-${run}`;
  const workflow = await callFromPage(
    owner,
    'POST',
    '/api/v1/workflows',
    {
      id: `push-main-${run}`,
      name: `Push to main ${run}`,
      domain: 'delivery',
      status: 'accepted',
      foundAt: new Date().toISOString(),
      nodes: [
        {
          id: 'push-main',
          kind: 'gate',
          label: 'Push to main',
          approvers,
          actions: [{ class: 'push-main', label: 'Push to the main branch', patterns: [], repos: [repo] }],
        },
      ],
      edges: [],
    },
    org,
  );
  expect(workflow.status, JSON.stringify(workflow.body)).toBeLessThan(300);
  return repo;
}

/** A personal token of the person on `page` that asks gates and reads them, never answers: a CI job's. */
async function askingToken(page: Page, org: string): Promise<string> {
  const token = await callFromPage(
    page,
    'POST',
    '/api/v1/tokens',
    { name: 'journey asker', scopes: ['gates:ask', 'gates:read'], expiresInDays: 1 },
    org,
  );
  expect(token.status, JSON.stringify(token.body)).toBe(201);
  return zCreateTokenResponse.pick({ secret: true }).parse(token.body).secret;
}

/** Calls the API with a bearer token, through the console's own origin (the preview proxies /api to the server). */
async function withToken(
  page: Page,
  token: string,
  org: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await page.request.fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'Ostrom-Org': org, accept: 'application/json' },
    ...(body === undefined ? {} : { data: body }),
    failOnStatusCode: false,
  });
  const text = await response.text();
  const answer: unknown = text === '' ? undefined : JSON.parse(text);
  return { status: response.status(), body: answer };
}

/** Asks for a push of a new commit to main of `repo`, as the hook would: the gate, still waiting for a yes. */
async function askPushToMain(page: Page, token: string, org: string, repo: string): Promise<string> {
  const sha = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const asked = await withToken(page, token, org, 'POST', '/api/v1/gates', {
    repo,
    class: 'git.push',
    tool: 'Bash',
    command: 'git push origin main',
    push: { remote: 'origin', refs: [{ ref: 'refs/heads/main', sha }] },
  });
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  const { gate } = zAskGateResponse.parse(asked.body);
  expect(gate.status).toBe('pending');
  return gate.id;
}

/** The request of this gate sent to the person on `page`, as their queue lists it. */
async function requestOf(page: Page, org: string, gate: string): Promise<{ id: string; title: string }> {
  let found: { readonly id: string; readonly title: string } | undefined;
  await expect
    .poll(async () => {
      const mine = await callFromPage(
        page,
        'GET',
        '/api/v1/approvals?mine=true&status=pending',
        undefined,
        org,
      );
      found =
        mine.status === 200
          ? zListApprovalsResponse.parse(mine.body).items.find((item) => item.group === gate)
          : undefined;
      return found?.id;
    })
    .toBeDefined();
  return found ?? { id: '', title: '' };
}

/** Opens the request from the queue, as a person does: the queue, then its line. */
async function openFromQueue(page: Page, request: { id: string; title: string }): Promise<void> {
  await page.goto('/yes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await page.locator(`a[href$="/yes/${request.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/yes/${request.id}$`));
}

/** The organization's self-approval setting, as the server reads it. */
async function selfApprovalOf(page: Page, org: string): Promise<string> {
  const policy = await callFromPage(page, 'GET', '/api/v1/gates/policy', undefined, org);
  expect(policy.status, JSON.stringify(policy.body)).toBe(200);
  return zGetGatePolicyResponse.parse(policy.body).selfApproval;
}

/** The owner of a new organization on `page`, and a second person who joined it with `role` on their own browser. */
async function ownerAndMember(
  page: Page,
  other: Page,
  role: string,
): Promise<{ org: string; owner: string; member: string }> {
  const { id } = await ownerOfNewOrganization(page, 'ada');
  const token = await invitationTo(page, id, role);
  await signIn(other, freshEmail('ben'));
  await accept(other, token);
  return { org: id, owner: await loginOf(page), member: await loginOf(other) };
}

test('5.4 a member opens another person’s request in the console queue and says yes; the gate is open', async ({
  page,
  browser,
}) => {
  const ben = await anotherPerson(browser);
  const { org, member } = await ownerAndMember(page, ben, 'member');
  const repo = await gatedRepository(page, org, [member]);
  const token = await askingToken(page, org);
  const gate = await askPushToMain(page, token, org, repo);

  // Ben signed in a moment ago: his yes carries a sign-in of less than five minutes (step-up, S2-54).
  const request = await requestOf(ben, org, gate);
  await openFromQueue(ben, request);
  await expect(ben.getByText('You asked for this yourself.')).toHaveCount(0);
  await ben.getByRole('button', { name: /^Approve/ }).click();
  const decision = ben.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText(` approved: ${request.title}`);
  // The answer carries its signed receipt (ostrom-server#127).
  await decision.getByText('Verify the receipt').click();
  await expect(decision).toContainText('ostrom verify ');

  // What the hook reads: the gate itself has passed.
  const read = await withToken(page, token, org, 'GET', `/api/v1/gates/${gate}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect(zAskGateResponse.parse(read.body).gate.status).toBe('approved');
});

test('5.6 the asker sees their own request and is refused the yes with a clear message, per the organization’s setting', async ({
  page,
  browser,
}) => {
  const ben = await anotherPerson(browser);
  const { org, owner, member } = await ownerAndMember(page, ben, 'member');
  const token = await askingToken(page, org);

  // Two approvers, and Ada asked: whatever the setting, Ben has to say yes.
  const shared = await askPushToMain(page, token, org, await gatedRepository(page, org, [owner, member]));
  const own = await requestOf(page, org, shared);
  await openFromQueue(page, own);
  await expect(page.getByText('You asked for this yourself.')).toBeVisible();
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'cannot approve it' })).toContainText(
    `You asked for this action and cannot approve it: ${member} must say yes.`,
  );

  // The organization's setting, in the console: what the server says first, then never, then only as the sole
  // approver.
  await page.goto('/approvers');
  const setting = page.getByRole('combobox', { name: 'Self-approval' });
  await expect(setting).toHaveValue(await selfApprovalOf(page, org));
  await setting.selectOption('never');
  await expect(page.getByText('Someone who asked never approves their own request')).toBeVisible();
  await expect.poll(() => selfApprovalOf(page, org)).toBe('never');
  const alone = await askPushToMain(page, token, org, await gatedRepository(page, org, [owner]));
  const refused = await requestOf(page, org, alone);
  await openFromQueue(page, refused);
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'cannot approve it' })).toContainText(
    'nobody else on this gate can: add another approver to the gate.',
  );

  await page.goto('/approvers');
  await page.getByRole('combobox', { name: 'Self-approval' }).selectOption('sole-approver');
  await expect(page.getByText('Someone who asked may approve only when nobody else can')).toBeVisible();
  await expect.poll(() => selfApprovalOf(page, org)).toBe('sole-approver');
  const sole = await askPushToMain(page, token, org, await gatedRepository(page, org, [owner]));
  const self = await requestOf(page, org, sole);
  await openFromQueue(page, self);
  await page.getByRole('button', { name: /^Approve/ }).click();
  const decision = page.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText(` approved: ${self.title}`);
  await expect(decision).toContainText('asked for this and was the only approver: the receipt says so.');
});

test('5.7 the signed receipt of a session shows the attestation of each check, and its signature verifies', async ({
  page,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const run = Date.now().toString(36);
  const workflow = await callFromPage(
    page,
    'POST',
    '/api/v1/workflows',
    {
      id: `checks-${run}`,
      name: `Checks before push ${run}`,
      domain: 'delivery',
      status: 'accepted',
      foundAt: new Date().toISOString(),
      nodes: [
        { id: 'start', kind: 'trigger', label: 'Session start' },
        { id: 'tests', kind: 'check', label: 'Tests', run: { command: 'npm test' } },
        { id: 'lint', kind: 'check', label: 'Lint', run: { command: 'npm run lint' } },
      ],
      edges: [
        { from: 'start', to: 'tests' },
        { from: 'tests', to: 'lint' },
      ],
    },
    org,
  );
  expect(workflow.status, JSON.stringify(workflow.body)).toBeLessThan(300);
  const current = await callFromPage(page, 'GET', '/api/v1/packages/current', undefined, org);
  expect(current.status, JSON.stringify(current.body)).toBe(200);
  const { digest } = zGetCurrentPackageResponse.pick({ digest: true }).parse(current.body);

  // What a workstation does: a launch, its session, the checks it ran, the end, the receipt.
  const launch = await callFromPage(
    page,
    'POST',
    '/api/v1/launches',
    { agent: 'claude', repo: 'acme/att' },
    org,
  );
  expect(launch.status, JSON.stringify(launch.body)).toBe(201);
  const { launchId, agentToken } = zCreateLaunchResponse.parse(launch.body);
  const session = crypto.randomUUID();
  const opened = await withToken(page, agentToken, org, 'POST', '/api/v1/sessions', {
    id: session,
    launchId,
    repo: 'acme/att',
    agent: 'claude',
    packageDigest: digest,
  });
  expect(opened.status, JSON.stringify(opened.body)).toBeLessThan(300);
  for (const node of ['tests', 'lint']) {
    const reported = await withToken(page, agentToken, org, 'POST', '/api/v1/checks', {
      sessionId: session,
      digest,
      nodeId: node,
      scriptId: `s-${node}`,
      exit: 0,
      outcome: 'passed',
      durationMs: 1200,
    });
    expect(reported.status, JSON.stringify(reported.body)).toBe(201);
  }
  const ended = await withToken(page, agentToken, org, 'POST', `/api/v1/sessions/${session}/end`, {
    exitCode: 0,
  });
  expect(ended.status, JSON.stringify(ended.body)).toBeLessThan(300);
  const signed = await withToken(
    page,
    agentToken,
    org,
    'POST',
    `/api/v1/sessions/${session}/workflow-receipt`,
    {
      digest,
      agent: 'claude',
    },
  );
  expect(signed.status, JSON.stringify(signed.body)).toBe(200);
  const { receipt, verification } = zSignWorkflowReceiptResponse.parse(signed.body);
  expect(verification.ok).toBe(true);
  const checks = (receipt.nodes ?? []).filter((node) => node.kind === 'check');
  expect(checks.map((node) => node.id).toSorted((a, b) => a.localeCompare(b))).toEqual(['lint', 'tests']);

  // The console: the list, the receipt, the badge on every check, the signature the server verifies.
  await page.goto('/receipts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Receipts');
  await page.getByText(receipt.subject.id, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/receipts/${receipt.id}$`));
  await expect(page.getByText('Signature verified')).toBeVisible();
  const steps = page.getByRole('region', { name: 'Workflow steps' });
  for (const label of ['Tests', 'Lint'])
    await expect(steps.getByRole('listitem').filter({ hasText: label })).toContainText(
      'Declared by the workstation',
    );
  const verify = await callFromPage(page, 'GET', `/api/v1/receipts/${receipt.id}/verify`, undefined, org);
  expect(verify.status, JSON.stringify(verify.body)).toBe(200);
  expect(zVerifyReceiptResponse.parse(verify.body).ok).toBe(true);
});
