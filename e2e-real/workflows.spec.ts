// SPDX-License-Identifier: AGPL-3.0-only
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
  await form.getByLabel('Repository').fill('acme/web');
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

test('another organization never sees nor changes the first one’s workflow', async ({ page }) => {
  expect(await served(page, 'POST', '/api/v1/workflows')).toBe(true);
  const first = await ownerOfNewOrganization(page, 'xavi');
  const id = `wf-isolated-${Date.now().toString(36)}`;
  const workflow = workflowNamed(id, 'Kept apart');
  expect((await callFromPage(page, 'POST', '/api/v1/workflows', workflow)).status).toBe(201);

  await ownerOfNewOrganization(page, 'yara');
  await page.goto('/workflows');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workflows');
  await expect(page.getByRole('link', { name: /Kept apart/ })).toHaveCount(0);
  await page.goto(`/workflows/${id}`);
  await expect(page.getByText('Kept apart')).toHaveCount(0);
  // In its own organization, the id is nobody's: 404, read, saved or deleted.
  for (const [method, path, body] of [
    ['GET', `/api/v1/workflows/${id}`, undefined],
    ['PUT', `/api/v1/workflows/${id}`, { workflow }],
    ['DELETE', `/api/v1/workflows/${id}`, undefined],
  ] as const) {
    expect((await callFromPage(page, method, path, body)).status, `${method} ${path}`).toBe(404);
  }
  // Naming the first organization does not open it: 404, as for one that does not exist.
  for (const [method, path, body] of [
    ['GET', '/api/v1/workflows', undefined],
    ['GET', `/api/v1/workflows/${id}`, undefined],
    ['PUT', `/api/v1/workflows/${id}`, { workflow }],
    ['DELETE', `/api/v1/workflows/${id}`, undefined],
  ] as const) {
    expect((await callFromPage(page, method, path, body, first.id)).status, `${method} ${path}`).toBe(404);
  }
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
