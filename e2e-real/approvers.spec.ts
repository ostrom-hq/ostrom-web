// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import {
  anotherPerson,
  callFromPage,
  closeOthers,
  freshEmail,
  joinAs,
  ownerOfNewOrganization,
  served,
  signIn,
} from './real';

test.afterEach(closeOthers);

/**
 * A new person's new organization, with a workflow of two gates over `repos` (every repository when empty): deploying,
 * which `nora` approves, then dropping a table, which nobody does.
 */
async function workflowOfGates(page: Page, repos: (slug: string) => string[]): Promise<void> {
  await signIn(page, freshEmail('nora'));
  const run = Date.now().toString(36);
  const org = await callFromPage(page, 'POST', '/api/v1/orgs', { name: `Umbrella ${run}` });
  expect(org.status).toBe(201);
  const { slug } = org.body as { slug: string };
  const workflow = await callFromPage(page, 'POST', '/api/v1/workflows', {
    id: `wf-${run}`,
    name: `Ship ${run}`,
    domain: `${slug}/api`,
    status: 'accepted',
    foundAt: new Date().toISOString(),
    nodes: [
      {
        id: 'g-deploy',
        kind: 'gate',
        label: 'Deploy to production',
        approvers: ['nora'],
        actions: [{ class: 'deploy', label: 'Deploy', patterns: ['helm upgrade'], repos: repos(slug) }],
      },
      {
        id: 'g-drop',
        kind: 'gate',
        label: 'Drop a table',
        actions: [
          { class: 'drop-table', label: 'Drop a table', patterns: ['DROP TABLE'], repos: repos(slug) },
        ],
      },
    ],
    edges: [{ from: 'g-deploy', to: 'g-drop' }],
  });
  expect(workflow.status, JSON.stringify(workflow.body)).toBeLessThan(300);
}

test('an owner reads who approves the gate of a new workflow, as the server decides it', async ({ page }) => {
  test.skip(
    !(await served(page, 'GET', '/api/v1/gates/approvers')),
    'GET /api/v1/gates/approvers not served yet',
  );
  // Gates over every repository: the organization's graph, which the screen reads, has them.
  await workflowOfGates(page, () => []);

  // The screen says what the server's graph says, person by person.
  const graph = await callFromPage(page, 'GET', '/api/v1/gates/approvers');
  expect(graph.status).toBe(200);
  const { approvers, ungated } = graph.body as {
    approvers: { approver: string; gates: { label: string }[] }[];
    ungated: string[];
  };
  expect(approvers.map((line) => line.approver)).toContain('nora');
  await page.goto('/approvers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who approves what');
  const steps = page.getByRole('region', { name: 'By step' });
  await expect(steps.getByRole('listitem').filter({ hasText: 'Deploy to production' })).toContainText('nora');
  await expect(steps.getByRole('listitem').filter({ hasText: 'Drop a table' })).toContainText('Nobody');
  // An enforced gate naming nobody blocks for good; what no gate covers runs without asking anyone.
  await expect(page.getByText(/Nobody may approve Drop a table/)).toBeVisible();
  for (const action of ungated) await expect(page.getByText(/No gate covers/)).toContainText(action);
  const people = page.getByRole('region', { name: 'By person' });
  for (const line of approvers) for (const gate of line.gates) await expect(people).toContainText(gate.label);
});

test('the organization’s graph names the approver of a gate scoped to one of its repositories', async ({
  page,
}) => {
  // ostrom-server#184: without `repo`, the organization's graph keeps a gate scoped to one of its repositories.
  await workflowOfGates(page, (slug) => [`${slug}/api`]);
  const graph = await callFromPage(page, 'GET', '/api/v1/gates/approvers');
  expect(graph.status).toBe(200);
  const { approvers } = graph.body as { approvers: { approver: string }[] };
  expect(approvers.map((line) => line.approver)).toContain('nora');

  // The screen reads the same graph: nora approves the scoped gate, the other one stops an agent for good.
  await page.goto('/approvers');
  const steps = page.getByRole('region', { name: 'By step' });
  await expect(steps.getByRole('listitem').filter({ hasText: 'Deploy to production' })).toContainText('nora');
  await expect(page.getByRole('region', { name: 'By person' })).toContainText('Deploy to production');
});

/** The self-approval policy the server holds for the organization the page acts in. */
async function policyOf(page: Page): Promise<string> {
  const read = await callFromPage(page, 'GET', '/api/v1/gates/policy');
  expect(read.status).toBe(200);
  return (read.body as { selfApproval: string }).selfApproval;
}

test('an owner sets self-approval on the console, a member reads it without changing it, and another organization keeps its own', async ({
  page,
  browser,
}) => {
  test.skip(!(await served(page, 'PUT', '/api/v1/gates/policy')), 'PUT /api/v1/gates/policy not served yet');
  const org = await ownerOfNewOrganization(page, 'opal');
  // An organization that never chose: a yes always comes from another person.
  expect(await policyOf(page)).toBe('never');

  await page.goto('/approvers');
  const policy = page.getByRole('region', { name: 'When the asker is an approver' });
  await expect(policy).toContainText('Someone who asked never approves their own request');
  const setting = policy.getByRole('combobox', { name: 'Self-approval' });
  await expect(setting).toHaveValue('never');

  // The owner lets a gate's only approver approve their own request: the server holds it, the page says it.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/gates/policy',
  );
  await setting.selectOption({ label: 'Only as the sole approver' });
  expect((await saved).status()).toBe(200);
  await expect(policy).toContainText('Someone who asked may approve only when nobody else can');
  await expect(policy.getByText('Not saved')).toHaveCount(0);
  expect(await policyOf(page)).toBe('sole-approver');
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'When the asker is an approver' })
      .getByRole('combobox', { name: 'Self-approval' }),
  ).toHaveValue('sole-approver');

  // A member reads the organization's policy, with no setting to change it, and the server refuses their write.
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'pim', 'member');
  await member.goto('/approvers');
  const read = member.getByRole('region', { name: 'When the asker is an approver' });
  await expect(read).toContainText('Someone who asked may approve only when nobody else can');
  await expect(read.getByRole('combobox')).toHaveCount(0);
  const refused = await callFromPage(
    member,
    'PUT',
    '/api/v1/gates/policy',
    { selfApproval: 'never' },
    org.id,
  );
  expect(refused.status).toBe(403);
  expect(await policyOf(page)).toBe('sole-approver');

  // Another organization's owner keeps their own policy, the default.
  const outsider = await anotherPerson(browser);
  await ownerOfNewOrganization(outsider, 'quin');
  expect(await policyOf(outsider)).toBe('never');
  await outsider.goto('/approvers');
  await expect(
    outsider
      .getByRole('region', { name: 'When the asker is an approver' })
      .getByRole('combobox', { name: 'Self-approval' }),
  ).toHaveValue('never');

  // Back to the default: the owner's change is undone the same way.
  await page
    .getByRole('region', { name: 'When the asker is an approver' })
    .getByRole('combobox', { name: 'Self-approval' })
    .selectOption({ label: 'Never' });
  await expect.poll(async () => policyOf(page)).toBe('never');
});
