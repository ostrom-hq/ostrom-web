// SPDX-License-Identifier: AGPL-3.0-only
// Lines 6.1 (sessions) and 6.2 (cloud agents) of the journey (demo/PARCOURS.md), console side, against the real
// server. A session is reported as the CLI does, with a personal token holding `sessions:write`; no agent runs.
import { expect, request, test } from '@playwright/test';
import { zCreateTokenResponse } from '../gen/api/zod.gen';
import { anotherPerson, bodyOf, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

/** Calls the API with a bearer token alone, without the browser's session cookie, through the console's origin. */
async function withToken(
  token: string,
  org: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const { baseURL } = test.info().project.use;
  const context = await request.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    const response = await context.fetch(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'Ostrom-Org': org, accept: 'application/json' },
      data: body,
      failOnStatusCode: false,
    });
    return {
      status: response.status(),
      body: bodyOf(`POST ${path}`, response.status(), await response.text()),
    };
  } finally {
    await context.dispose();
  }
}

test('an owner follows a session from live to ended, and another organization sees none', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'wren');
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
  await expect(page.getByText('No agent is working right now')).toBeVisible();

  const created = await callFromPage(
    page,
    'POST',
    '/api/v1/tokens',
    { name: 'journey CLI', scopes: ['sessions:write'], expiresInDays: 1 },
    org.id,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const token = zCreateTokenResponse.pick({ secret: true }).parse(created.body).secret;
  const id = crypto.randomUUID();
  const repo = `${org.slug}/api`;
  const started = await withToken(token, org.id, '/api/v1/sessions', {
    id,
    agent: 'claude',
    repo,
    model: 'claude-sonnet',
  });
  expect(started.status, JSON.stringify(started.body)).toBeLessThan(300);

  // Live: under the open ones, with its agent and repository, and its page.
  const line = page.locator(`a[href="/sessions/${id}"]`);
  await expect(line).toContainText(`claude · ${repo}`, { timeout: 15_000 });
  await expect(page.getByText(/^\d+ open$/)).toBeVisible();
  await line.click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
  await expect(page.getByRole('main')).toContainText(repo);

  // Ended by the CLI: the list moves it under the ended ones.
  const ended = await withToken(token, org.id, `/api/v1/sessions/${id}/end`, { tools: 3, exitCode: 0 });
  expect(ended.status, JSON.stringify(ended.body)).toBeLessThan(300);
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { name: 'Ended' })).toBeVisible();
  await expect(page.locator(`a[href="/sessions/${id}"]`)).toBeVisible();

  // Another organization: nothing of it on screen, and the session does not exist for them.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'yara');
  await stranger.goto('/sessions');
  await expect(stranger.getByText('No agent is working right now')).toBeVisible();
  await expect(stranger.getByText(repo)).toHaveCount(0);
  expect((await callFromPage(stranger, 'GET', `/api/v1/sessions/${id}`, undefined, org.id)).status).toBe(404);
});

test('an owner registers a runner, starts a cloud agent that waits for it, and another organization sees neither', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'zeno');
  await page.goto('/cloud');
  await expect(page.getByRole('heading', { level: 1, name: 'Cloud agents' })).toBeVisible();
  await expect(page.getByText('No cloud session yet.')).toBeVisible();
  await expect(
    page.getByText('No runner yet: register one with the CLI to run agents in the cloud.'),
  ).toBeVisible();

  const runnerName = `journey-runner-${Date.now().toString(36)}`;
  const runner = await callFromPage(page, 'POST', '/api/v1/runners', { name: runnerName, labels: ['linux'] });
  expect(runner.status, JSON.stringify(runner.body)).toBe(201);
  await page.reload();
  const runners = page.getByRole('region', { name: 'Runners' });
  await expect(runners.getByRole('listitem').filter({ hasText: runnerName })).toBeVisible();

  const form = page.getByRole('region', { name: 'Start an agent' });
  const name = `Bump the SDK ${Date.now().toString(36)}`;
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Bump the SDK and open a PR.');
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await form.getByRole('button', { name: 'Start the agent' }).click();
  const session = page.getByRole('listitem').filter({ hasText: name });
  await expect(session).toBeVisible();
  const listed = await callFromPage(page, 'GET', '/api/v1/cloud/sessions');
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body)).toContain(name);

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'ilse');
  await stranger.goto('/cloud');
  await expect(stranger.getByText('No cloud session yet.')).toBeVisible();
  await expect(stranger.getByText(runnerName)).toHaveCount(0);
  for (const path of ['/api/v1/runners', '/api/v1/cloud/sessions']) {
    expect((await callFromPage(stranger, 'GET', path, undefined, org.id)).status, path).toBe(404);
  }
});

test('a cloud session reads in the contract’s words', async ({ page }) => {
  test.fixme(
    true,
    'ostrom-web: the cloud screen knows queued, starting, ended and stopped; the contract and the server say creating, ' +
      'running, pausing, paused, resuming, terminated and failed (a new session reads "creating" raw). Console fix ' +
      'to come, in the JOURNAL (03/11)',
  );
  await ownerOfNewOrganization(page, 'odette');
  await page.goto('/cloud');
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Bump the SDK and open a PR.');
  await form.getByRole('button', { name: 'Start the agent' }).click();
  await expect(page.getByRole('region', { name: 'Sessions' }).getByRole('listitem').first()).toContainText(
    'Creating',
  );
});
