// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

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
  test.fixme(
    true,
    'ostrom-server: GET /gates/approvers without `repo` leaves out a gate scoped to one repository ' +
      '(GatesCatalog.covers with no repository); asked of the compiler module’s owner in the JOURNAL (02/11)',
  );
  await workflowOfGates(page, (slug) => [`${slug}/api`]);
  const graph = await callFromPage(page, 'GET', '/api/v1/gates/approvers');
  expect(graph.status).toBe(200);
  const { approvers } = graph.body as { approvers: { approver: string }[] };
  expect(approvers.map((line) => line.approver)).toContain('nora');
});
