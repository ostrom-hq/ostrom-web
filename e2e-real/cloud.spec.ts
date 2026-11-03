// SPDX-License-Identifier: AGPL-3.0-only
// Line 6.2 of the journey (demo/PARCOURS.md), console side, against the real server. First, an owner starts an agent from
// the Cloud screen; the server runs it on the job's Docker (console-journey.yml, ostrom-server#200), the screen shows it
// running, the owner stops it and it ends. Then an owner registers a runner (the
// CLI's `POST /runners`, played here through the owner's session, as the console's screen has no form for it), the
// Cloud screen lists it offline and never seen, the runner reports with its key (`POST /runners/{id}/heartbeat`), the
// screen lists it online; once removed, it is gone. Another organization never sees it.
// When the server hands its sessions to registered runners (`OSTROM_E2E_MACHINE_IMAGE`, machines.ts), the owner's
// agent runs on a machine of the organization; and when that machine is lost, the session comes back running on the
// other one.
import { expect, request, test, type Page } from '@playwright/test';
import { z } from 'zod';
import { zCloudSession, zRunner } from '../gen/api/zod.gen';
import { holder, lose, machineImage, online, removeMachines, startMachine, type Machine } from './machines';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

// The key is in ostrom-core's `Runner` (shown once, at registration); this repository's contract is older.
const zRegistered = zRunner.extend({ token: z.string() });

test.afterEach(async () => {
  await closeOthers();
  await removeMachines();
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

test('6.2 an owner starts an agent from the Cloud screen, sees it running, stops it, and it ends', async ({
  page,
}) => {
  test.setTimeout(START_TIMEOUT + 2 * 60_000);
  const { id: org } = await ownerOfNewOrganization(page, 'cyd');
  const name = `agent-${Date.now().toString(36)}`;
  if (machineImage !== undefined) await online(page, org, [await startMachine(page, org, 'machine-1')]);

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
        const read = await callFromPage(
          page,
          'GET',
          `/api/v1/cloud/sessions/${session?.id ?? ''}`,
          undefined,
          org,
        );
        return read.status === 404 ? 'gone' : z.object({ status: z.string() }).parse(read.body).status;
      },
      { timeout: 2 * 60_000, intervals: [2_000] },
    )
    .toMatch(/^(terminated|gone)$/);
  // The screen reads the list every 10 s (useCloud's POLL_MS): its next read shows the session over, or without it.
  const ended = { timeout: 30_000 };
  await expect(row.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0, ended);
  await expect(row.filter({ hasText: 'Running' })).toHaveCount(0, ended);
});

/** A session lives in the console: its status, its execution and its id. */
async function sessionNamed(page: Page, org: string, name: string): Promise<CloudSession | undefined> {
  const listed = await callFromPage(page, 'GET', '/api/v1/cloud/sessions', undefined, org);
  expect(listed.status).toBe(200);
  return z
    .object({ items: z.array(zCloudSession) })
    .parse(listed.body)
    .items.find((item) => item.name === name);
}

type CloudSession = z.infer<typeof zCloudSession>;

/** The server sees a machine silent after 90 s, then hands its sessions to another runner of the organization. */
const TAKEOVER_TIMEOUT = 5 * 60_000;

test('6.2 when the machine running an agent is lost, the agent comes back running on another machine', async ({
  page,
}) => {
  test.skip(
    machineImage === undefined,
    "Sessions run on the server's own Docker driver, not on registered runners",
  );
  // One device is enough: the takeover is the server's and the machines', the screen is the one tested above.
  test.skip(test.info().project.name === 'mobile', 'The takeover is proved once, on desktop');
  test.setTimeout(START_TIMEOUT + TAKEOVER_TIMEOUT + 2 * 60_000);
  const { id: org } = await ownerOfNewOrganization(page, 'dee');
  const machines: Machine[] = [
    await startMachine(page, org, 'machine-a'),
    await startMachine(page, org, 'machine-b'),
  ];
  await online(page, org, machines);

  const name = `agent-${Date.now().toString(36)}`;
  await page.goto('/cloud');
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Say hello, then wait.');
  await form.getByRole('textbox', { name: 'Name' }).fill(name);
  await form.getByRole('button', { name: 'Start the agent' }).click();
  const row = page.getByRole('region', { name: 'Sessions' }).getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('Running', { timeout: START_TIMEOUT });

  const first = await sessionNamed(page, org, name);
  expect(first?.status).toBe('running');
  const id = first?.id ?? '';
  const holding = holder(id);
  const lost = machines.find((machine) => machine.id === holding);
  const other = machines.find((machine) => machine.id !== holding);
  if (lost === undefined) throw new Error(`Neither machine runs the session (held by ${String(holding)})`);
  lose(lost);

  // The same session, a new execution, on the machine that is left.
  await expect
    .poll(
      async () => {
        const now = await sessionNamed(page, org, name);
        return now?.status === 'running' && now.epoch !== first?.epoch && holder(id) === other?.id;
      },
      { timeout: TAKEOVER_TIMEOUT, intervals: [5_000] },
    )
    .toBe(true);
  await page.reload();
  await expect(row).toContainText('Running', { timeout: 30_000 });

  await row.getByRole('button', { name: 'Stop', exact: true }).click();
  await row.getByRole('button', { name: `Stop ${name}` }).click();
  await expect
    .poll(
      async () => {
        const read = await callFromPage(page, 'GET', `/api/v1/cloud/sessions/${id}`, undefined, org);
        return read.status === 404 ? 'gone' : z.object({ status: z.string() }).parse(read.body).status;
      },
      { timeout: 2 * 60_000, intervals: [2_000] },
    )
    .toMatch(/^(terminated|gone)$/);
  // The machine that is left removes the session's containers once the server no longer lists it.
  await expect.poll(() => holder(id), { timeout: 60_000, intervals: [2_000] }).toBeUndefined();
});
