// SPDX-License-Identifier: AGPL-3.0-only
// Lines 5.4, 5.6 and 5.7 of the journey (demo/PARCOURS.md), console side, against the real server. The gate is opened
// through the API in the setup, as the QA bench does it (ostrom-e2e `scripts/load-setup.ts`): an accepted workflow
// whose gate node names the approvers of pushes to main of a repository, and a personal token with `gates:ask` that
// asks for such a push. The yes, the refusal and the receipt are then read and given in the console.
import { expect, type Page, test } from '@playwright/test';
import {
  zAnswerApprovalResponse,
  zAskGateResponse,
  zCreateLaunchResponse,
  zGetCurrentPackageResponse,
  zGetGatePolicyResponse,
  zSignWorkflowReceiptResponse,
  zVerifyReceiptResponse,
} from '../gen/api/zod.gen';
import {
  acceptedWorkflow,
  askingToken,
  askPushToMain,
  gatedRepository,
  loginOf,
  requestOf,
  uniqueRun,
  withToken,
} from './gate';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

/** The answer to a yes: the contract's `ApprovalView`, which then always carries its signed receipt. */
const zSignedAnswer = zAnswerApprovalResponse.required({ receipt: true });

/** Opens the request from the queue, as a person does: the queue, then its line. */
async function openFromQueue(page: Page, approval: { id: string; title: string }): Promise<void> {
  await page.goto('/yes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await page.locator(`a[href$="/yes/${approval.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/yes/${approval.id}$`));
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
  await joinAs(page, id, other, 'ben', role);
  return { org: id, owner: await loginOf(page), member: await loginOf(other) };
}

test('5.4 a member opens another person’s request in the console queue and says yes; the gate is open', async ({
  page,
  browser,
}) => {
  const ben = await anotherPerson(browser);
  const { org, member } = await ownerAndMember(page, ben, 'member');
  const token = await askingToken(page, org);
  const gate = await askPushToMain(token, org, await gatedRepository(page, org, [member]));

  // Ben signed in a moment ago: his yes carries a sign-in of less than five minutes (step-up, S2-54).
  const asked = await requestOf(ben, org, gate);
  await openFromQueue(ben, asked);
  const approve = ben.getByRole('button', { name: /^Approve/ });
  await expect(approve).toBeVisible();
  await expect(ben.getByText('You asked for this yourself.')).toHaveCount(0);
  const answered = ben.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith(`/${asked.id}/answer`),
  );
  await approve.click();
  const response = await answered;
  expect(response.status()).toBe(200);
  const decision = ben.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText(` approved: ${asked.title}`);

  // The yes is signed: the answer carries its receipt (ostrom-server#127), which the server verifies.
  const { receipt } = zSignedAnswer.parse(await response.json());
  const verified = await callFromPage(page, 'GET', `/api/v1/receipts/${receipt.id}/verify`, undefined, org);
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  expect(zVerifyReceiptResponse.parse(verified.body).ok).toBe(true);
  // The decision shows it too, one click from the command that checks it offline (ostrom-server#148).
  await decision.getByText('Verify the receipt').click();
  await expect(decision.getByText(`ostrom verify ${receipt.id}`, { exact: true })).toBeVisible();

  // What the hook reads: the gate itself has passed.
  const read = await withToken(token, org, 'GET', `/api/v1/gates/${gate}`);
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
  const shared = await askPushToMain(token, org, await gatedRepository(page, org, [owner, member]));
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
  await expect.poll(async () => selfApprovalOf(page, org)).toBe('never');
  const alone = await askPushToMain(token, org, await gatedRepository(page, org, [owner]));
  const refused = await requestOf(page, org, alone);
  await openFromQueue(page, refused);
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'cannot approve it' })).toContainText(
    'nobody else on this gate can: add another approver to the gate.',
  );

  await page.goto('/approvers');
  await page.getByRole('combobox', { name: 'Self-approval' }).selectOption('sole-approver');
  await expect(page.getByText('Someone who asked may approve only when nobody else can')).toBeVisible();
  await expect.poll(async () => selfApprovalOf(page, org)).toBe('sole-approver');
  const sole = await askPushToMain(token, org, await gatedRepository(page, org, [owner]));
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
  const run = uniqueRun();
  await acceptedWorkflow(page, org, {
    id: `checks-${run}`,
    // A repository's package holds the workflows that name it (PackageCompiler.workflowsFor in ostrom-server): the
    // repository the session is launched in is in the name.
    name: `Checks before push to acme/att ${run}`,
    nodes: [
      { id: 'start', kind: 'trigger', label: 'Session start' },
      { id: 'tests', kind: 'check', label: 'Tests', run: { command: 'npm test' } },
      { id: 'lint', kind: 'check', label: 'Lint', run: { command: 'npm run lint' } },
    ],
    edges: [
      { from: 'start', to: 'tests' },
      { from: 'tests', to: 'lint' },
    ],
  });
  // The package of the launch's repository: since ostrom-server#174 a session reports its checks only under it (409
  // "This session runs another package" otherwise).
  const current = await callFromPage(page, 'GET', '/api/v1/packages/current?repo=acme%2Fatt', undefined, org);
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
  const opened = await withToken(agentToken, org, 'POST', '/api/v1/sessions', {
    id: session,
    launchId,
    repo: 'acme/att',
    agent: 'claude',
    packageDigest: digest,
  });
  expect(opened.status, JSON.stringify(opened.body)).toBeLessThan(300);
  for (const node of ['tests', 'lint']) {
    const reported = await withToken(agentToken, org, 'POST', '/api/v1/checks', {
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
  const ended = await withToken(agentToken, org, 'POST', `/api/v1/sessions/${session}/end`, {
    exitCode: 0,
  });
  expect(ended.status, JSON.stringify(ended.body)).toBeLessThan(300);
  const signed = await withToken(agentToken, org, 'POST', `/api/v1/sessions/${session}/workflow-receipt`, {
    digest,
    agent: 'claude',
  });
  expect(signed.status, JSON.stringify(signed.body)).toBe(200);
  const { receipt, verification } = zSignWorkflowReceiptResponse.parse(signed.body);
  expect(verification.ok).toBe(true);
  const checks = receipt.nodes?.filter((node) => node.kind === 'check').map((node) => node.id);
  expect(
    checks?.toSorted((a, b) => a.localeCompare(b)),
    JSON.stringify(receipt),
  ).toEqual(['lint', 'tests']);

  // The console: the list, the receipt, the badge on every check, the signature the server verifies.
  await page.goto('/receipts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Receipts');
  await page.getByRole('link').filter({ hasText: receipt.subject.id }).first().click();
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
