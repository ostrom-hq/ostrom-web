// SPDX-License-Identifier: AGPL-3.0-only
// Line 6.2 of the journey (demo/PARCOURS.md), console side, against the real server. First, an owner starts an agent from
// the Cloud screen; the server runs it on the job's Docker (console-journey.yml, ostrom-server#200), the screen shows it
// running, the owner stops it and it ends. Then an owner registers a runner (the
// CLI's `POST /runners`, played here through the owner's session, as the console's screen has no form for it), the
// Cloud screen lists it offline and never seen, the runner reports with its key (`POST /runners/{id}/heartbeat`), the
// screen lists it online; once removed, it is gone. Another organization never sees it.
import { expect, request, test } from '@playwright/test';
import { z } from 'zod';
import { zCloudSession, zRunner } from '../gen/api/zod.gen';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

// The key is in ostrom-core's `Runner` (shown once, at registration); this repository's contract is older.
const zRegistered = zRunner.extend({ token: z.string() });

test.afterEach(async () => {
  await closeOthers();
});

test('6.2 the Cloud screen lists a registered runner, online once it reported, and no longer once removed', async ({
  page,
  browser,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const name = `runner-${Date.now().toString(36)}`;
  const registered = await callFromPage(
    page,
    'POST',
    '/api/v1/runners',
    { name, labels: ['linux', 'docker'], version: '0.9.0' },
    org,
  );
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  const runner = zRegistered.parse(registered.body);
  expect(runner.status).toBe('offline');

  await page.goto('/cloud');
  const runners = page.getByRole('region', { name: 'Runners' });
  const line = runners.getByRole('listitem').filter({ hasText: name });
  await expect(line).toContainText('linux, docker');
  await expect(line).toContainText('v0.9.0');
  await expect(line).toContainText('never seen');
  await expect(line).toContainText('Offline');

  // The runner's sign of life, with its own key and nothing else.
  const { baseURL } = test.info().project.use;
  const machine = await request.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    const beat = await machine.post(`/api/v1/runners/${runner.id}/heartbeat`, {
      headers: { authorization: `Bearer ${runner.token}`, accept: 'application/json' },
      failOnStatusCode: false,
    });
    expect(beat.status()).toBe(200);
    const wrong = await machine.post(`/api/v1/runners/${runner.id}/heartbeat`, {
      headers: { authorization: 'Bearer ostrom_runner_wrong', accept: 'application/json' },
      failOnStatusCode: false,
    });
    expect(wrong.status()).toBe(401);
  } finally {
    await machine.dispose();
  }
  await page.reload();
  await expect(line).toContainText('Online');
  await expect(line).toContainText('seen');
  await expect(line).not.toContainText('never seen');

  // Another organization's owner: its Cloud screen and its API never show this runner.
  const other = await anotherPerson(browser);
  const { id: otherOrg } = await ownerOfNewOrganization(other, 'bea');
  const theirs = await callFromPage(other, 'GET', '/api/v1/runners', undefined, otherOrg);
  expect(theirs.status).toBe(200);
  expect(JSON.stringify(theirs.body)).not.toContain(runner.id);
  await other.goto('/cloud');
  await expect(other.getByRole('region', { name: 'Runners' })).toBeVisible();
  await expect(other.getByText(name)).toHaveCount(0);
  const removedByThem = await callFromPage(
    other,
    'DELETE',
    `/api/v1/runners/${runner.id}`,
    undefined,
    otherOrg,
  );
  expect(removedByThem.status).toBe(404);

  const removed = await callFromPage(page, 'DELETE', `/api/v1/runners/${runner.id}`, undefined, org);
  expect(removed.status).toBe(204);
  await page.reload();
  await expect(runners).toBeVisible();
  await expect(line).toHaveCount(0);
});

/** Where the server takes the session: the runner image pulled and started on the job's Docker, then its heartbeat. */
const START_TIMEOUT = 4 * 60_000;

test('6.2 an owner starts an agent from the Cloud screen, sees it running, stops it, and it ends', async ({ page }) => {
  test.setTimeout(START_TIMEOUT + 2 * 60_000);
  const { id: org } = await ownerOfNewOrganization(page, 'cyd');
  const name = `agent-${Date.now().toString(36)}`;

  await page.goto('/cloud');
  // The console starts prompt agents only (a plain shell needs a terminal it has not): Claude Code, the default. No
  // provider account is needed for the session to run: the agent waits in its terminal.
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Say hello, then wait.');
  await form.getByRole('textbox', { name: 'Name' }).fill(name);
  await form.getByRole('button', { name: 'Start the agent' }).click();

  const row = page.getByRole('region', { name: 'Sessions' }).getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  // The screen polls the list by itself: no reload.
  await expect(row).toContainText('Running', { timeout: START_TIMEOUT });

  const listed = await callFromPage(page, 'GET', '/api/v1/cloud/sessions', undefined, org);
  expect(listed.status).toBe(200);
  const session = z
    .object({ items: z.array(zCloudSession) })
    .parse(listed.body)
    .items.find((item) => item.name === name);
  expect(session?.status).toBe('running');

  await row.getByRole('button', { name: 'Stop', exact: true }).click();
  await row.getByRole('button', { name: `Stop ${name}` }).click();
  // The contract's final state is `terminated`; once the server removed it, the session is gone (404) and so is its row.
  await expect
    .poll(
      async () => {
        const read = await callFromPage(page, 'GET', `/api/v1/cloud/sessions/${session?.id ?? ''}`, undefined, org);
        return read.status === 404 ? 'gone' : z.object({ status: z.string() }).parse(read.body).status;
      },
      { timeout: 2 * 60_000, intervals: [2_000] },
    )
    .toMatch(/^(terminated|gone)$/);
  await expect(row.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
});
