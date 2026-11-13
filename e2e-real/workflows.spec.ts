// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization, served } from './real';

test.afterEach(closeOthers);

/** A one-step workflow, as the console writes a new one. */
function workflowNamed(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    domain: 'acme/web',
    nodes: [{ id: 'n-1', kind: 'trigger', label: 'A tag is pushed' }],
    edges: [{ from: 'n-1', to: null }],
    start: 'n-1',
    status: 'accepted',
    foundAt: new Date().toISOString(),
  };
}

test('an owner writes a workflow in the console, changes it, and deletes it', async ({ page }) => {
  // Served on the server's main (ostrom-server#43): a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'POST', '/api/v1/workflows')).toBe(true);
  await ownerOfNewOrganization(page, 'wren');
  const name = `Release train ${Date.now().toString(36)}`;

  await page.goto('/workflows');
  await page.getByRole('link', { name: 'New workflow' }).click();
  const form = page.getByRole('form', { name: 'A new workflow' });
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Domain').fill('Release');
  await form.getByLabel('Step 1: What it is').fill('A tag is pushed');
  await form.getByRole('button', { name: 'Add a step' }).click();
  await form.getByLabel('What step 2 does').selectOption('Check');
  await form.getByLabel('Step 2: What it is').fill('Tests pass');
  await form.getByLabel('Step 2: The command').fill('pnpm test');
  await form.getByRole('button', { name: 'Create the workflow' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  const steps = page.getByRole('region', { name: 'Steps' });
  await expect(steps.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Version', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Step 2: What it is').fill('Unit tests pass');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(steps).toContainText('Unit tests pass');
  await expect(page.getByRole('form')).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete this workflow' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workflows');
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
});

test('another organization never sees nor changes the first one’s workflow', async ({ page, browser }) => {
  expect(await served(page, 'POST', '/api/v1/workflows')).toBe(true);
  const first = await ownerOfNewOrganization(page, 'xavi');
  const id = `wf-isolated-${Date.now().toString(36)}`;
  const workflow = workflowNamed(id, 'Kept apart');
  expect((await callFromPage(page, 'POST', '/api/v1/workflows', workflow)).status).toBe(201);
  const firstVersion = (
    (await callFromPage(page, 'GET', `/api/v1/workflows/${id}`)).body as { version?: number }
  ).version;

  const other = await anotherPerson(browser);
  await ownerOfNewOrganization(other, 'yara');
  await other.goto('/workflows');
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Workflows');
  await expect(other.getByRole('link', { name: /Kept apart/ })).toHaveCount(0);
  await other.goto(`/workflows/${id}`);
  await expect(other.getByText('Kept apart')).toHaveCount(0);
  // In its own organization, the id is nobody's.
  expect((await callFromPage(other, 'GET', `/api/v1/workflows/${id}`)).status).toBe(404);
  // Naming the first organization does not open it: refused, and nothing of it comes back. The contract says 404, as
  // for one that does not exist; the workflow routes answer 403 today (asked in .coord/QUESTIONS.md, 02/11 20:15).
  for (const [method, path, body] of [
    ['GET', '/api/v1/workflows', undefined],
    ['GET', `/api/v1/workflows/${id}`, undefined],
    ['PUT', `/api/v1/workflows/${id}`, { workflow: { ...workflow, name: 'Taken over' } }],
    ['DELETE', `/api/v1/workflows/${id}`, undefined],
  ] as const) {
    const answer = await callFromPage(other, method, path, body, first.id);
    expect([403, 404], `${method} ${path}`).toContain(answer.status);
    expect(JSON.stringify(answer.body ?? null)).not.toContain('Kept apart');
  }
  // Written and deleted under the same id in its own organization, it never touches the first one's.
  const own = await callFromPage(other, 'PUT', `/api/v1/workflows/${id}`, {
    workflow: { ...workflow, name: 'Taken over' },
  });
  expect([200, 404]).toContain(own.status);
  if (own.status === 200)
    expect((await callFromPage(other, 'DELETE', `/api/v1/workflows/${id}`)).status).toBe(204);
  const kept = await callFromPage(page, 'GET', `/api/v1/workflows/${id}`);
  expect(kept.status).toBe(200);
  expect(kept.body).toMatchObject({
    name: 'Kept apart',
    ...(firstVersion === undefined ? {} : { version: firstVersion }),
  });
});

test('a member reads the workflows but is offered no change, and the server refuses one', async ({
  page,
  browser,
}) => {
  expect(await served(page, 'POST', '/api/v1/workflows')).toBe(true);
  const org = await ownerOfNewOrganization(page, 'zeno');
  const id = `wf-read-${Date.now().toString(36)}`;
  const workflow = workflowNamed(id, 'Read only');
  expect((await callFromPage(page, 'POST', '/api/v1/workflows', workflow)).status).toBe(201);
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'ines', 'member');

  await member.goto('/workflows');
  await member.getByRole('link', { name: /Read only/ }).click();
  await expect(member.getByRole('heading', { level: 1 })).toHaveText('Read only');
  await expect(member.getByText('Owners and admins change workflows.')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  const refused = await callFromPage(member, 'DELETE', `/api/v1/workflows/${id}`);
  expect(refused.status).toBe(403);
  expect((await callFromPage(page, 'GET', `/api/v1/workflows/${id}`)).status).toBe(200);
});
