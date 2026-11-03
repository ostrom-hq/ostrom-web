// SPDX-License-Identifier: AGPL-3.0-only
// Line 6.1 (sessions) of the journey (demo/PARCOURS.md), console side, against the real
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

  // Live: under the open ones, with its agent and repository, and its page. The list is read again every 15 s
  // (`SESSIONS_POLL_MS`), so the session shows by the next read: a whole period and a margin.
  const line = page.locator(`a[href="/sessions/${id}"]`);
  await expect(line).toContainText(`claude · ${repo}`, { timeout: 30_000 });
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
