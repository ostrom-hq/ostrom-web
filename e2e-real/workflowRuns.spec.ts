// SPDX-License-Identifier: Apache-2.0
// Line 4.1 (workflow runs) of the journey (demo/PARCOURS.md), console side, against the real server: an owner starts a
// run from the console and reads it on the workflow and among the organization's runs, a member reads it without the
// button, and another organization sees none of it (CONVENTIONS §16).
import { expect, type Page, test } from '@playwright/test';
import { zWorkflowRun } from '../gen/api/zod.gen';
import { loginOf } from './gate';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization, served } from './real';

test.afterEach(closeOthers);

/** An accepted one-step workflow, written through the API. */
async function acceptedWorkflow(page: Page, name: string): Promise<string> {
  const id = `wf-runs-${Date.now().toString(36)}`;
  const created = await callFromPage(page, 'POST', '/api/v1/workflows', {
    id,
    name,
    domain: 'acme/web',
    nodes: [{ id: 'n-1', kind: 'trigger', label: 'A tag is pushed' }],
    edges: [{ from: 'n-1', to: null }],
    start: 'n-1',
    status: 'accepted',
    foundAt: new Date().toISOString(),
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return id;
}

test('an owner runs a workflow from the console, and a member reads the run without the button', async ({
  page,
  browser,
}) => {
  // Served on the server's main (WORKFLOW-RUNS, 4.1): a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'GET', '/api/v1/runs')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'rhea');
  const owner = await loginOf(page);
  const name = `Release train ${Date.now().toString(36)}`;
  const id = await acceptedWorkflow(page, name);

  await page.goto(`/workflows/${id}`);
  const runs = page.getByRole('region', { name: 'Runs' });
  await expect(runs.getByText('No run yet.')).toBeVisible();
  await runs.getByRole('button', { name: 'Run it now' }).click();
  const row = runs.getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`Started by ${owner} · by hand`);
  // Without an engine that walks it, the server keeps a started run queued: the console says what the server says.
  await expect(
    row.getByText(/^(Queued|Running|Waiting for a person|Succeeded|Failed|Cancelled)$/),
  ).toBeVisible();

  await page.goto('/runs');
  const all = page.getByRole('main').getByRole('listitem');
  await expect(all).toHaveCount(1);
  await all.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

  const member = await anotherPerson(browser);
  await joinAs(page, org, member, 'sami', 'member');
  await member.goto(`/workflows/${id}`);
  const theirs = member.getByRole('region', { name: 'Runs' });
  await expect(theirs.getByRole('listitem')).toHaveCount(1);
  await expect(theirs.getByRole('button', { name: 'Run it now' })).toHaveCount(0);
  // The server, not the hidden button, is what refuses: a member's start is a 403.
  const start = await callFromPage(member, 'POST', `/api/v1/workflows/${id}/runs`, { inputs: {} }, org);
  expect(start.status).toBe(403);
});

test('§16 another organization’s owner sees none of the first one’s runs', async ({ page, browser }) => {
  expect(await served(page, 'GET', '/api/v1/runs')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'sven');
  const id = await acceptedWorkflow(page, 'Kept apart runs');
  const started = await callFromPage(page, 'POST', `/api/v1/workflows/${id}/runs`, { inputs: {} }, org);
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const run = zWorkflowRun.parse(started.body);

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'tove');
  await stranger.goto('/runs');
  await expect(stranger.getByText('No run yet.')).toBeVisible();
  await expect(stranger.getByText('Kept apart runs')).toHaveCount(0);
  // In its own organization, the workflow is nobody's.
  expect((await callFromPage(stranger, 'GET', `/api/v1/workflows/${id}/runs`)).status).toBe(404);
  // Naming the first organization opens nothing either, and nothing of it comes back.
  for (const [method, path, body] of [
    ['GET', '/api/v1/runs', undefined],
    ['GET', `/api/v1/workflows/${id}/runs`, undefined],
    ['POST', `/api/v1/workflows/${id}/runs`, { inputs: {} }],
  ] as const) {
    const answer = await callFromPage(stranger, method, path, body, org);
    expect([403, 404], `${method} ${path}`).toContain(answer.status);
    expect(JSON.stringify(answer.body ?? null)).not.toContain(run.id);
  }
});
