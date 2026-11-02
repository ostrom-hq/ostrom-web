// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

test('an owner reads who approves the gate of a new workflow, as the server decides it', async ({ page }) => {
  test.skip(
    !(await served(page, 'GET', '/api/v1/gates/approvers')),
    'GET /api/v1/gates/approvers not served yet',
  );
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
        actions: [{ class: 'deploy', label: 'Deploy', patterns: ['helm upgrade'], repos: [`${slug}/api`] }],
      },
      { id: 'g-drop', kind: 'gate', label: 'Drop a table' },
    ],
    edges: [{ from: 'g-deploy', to: 'g-drop' }],
  });
  expect(workflow.status, JSON.stringify(workflow.body)).toBeLessThan(300);

  // The screen says what the server's graph says, person by person.
  const graph = await callFromPage(page, 'GET', '/api/v1/gates/approvers');
  expect(graph.status).toBe(200);
  const { approvers } = graph.body as { approvers: { approver: string; gates: { label: string }[] }[] };
  await page.goto('/approvers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who approves what');
  const steps = page.getByRole('region', { name: 'By step' });
  await expect(steps.getByRole('listitem').filter({ hasText: 'Deploy to production' })).toContainText('nora');
  await expect(steps.getByRole('listitem').filter({ hasText: 'Drop a table' })).toContainText('Nobody');
  const people = page.getByRole('region', { name: 'By person' });
  for (const line of approvers) for (const gate of line.gates) await expect(people).toContainText(gate.label);
});
