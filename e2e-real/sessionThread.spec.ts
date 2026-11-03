// SPDX-License-Identifier: AGPL-3.0-only
// Line 6.1 of the journey (demo/PARCOURS.md), console side, against the real server: the sessions of an organization,
// a page at a time, and the thread of one, with the answers to the gates it asked (ostrom-server#163). Sessions are
// opened as a workstation opens them (a launch, then its agent's session); the gates are asked in the session with
// its agent token, as the hook asks them, and answered in the console by the approver.
import { expect, type Page, test } from '@playwright/test';
import { zCreateLaunchResponse, zGetSessionResponse } from '../gen/api/zod.gen';
import { askPushToMain, gatedRepository, openFromQueue, ownerAndMember, requestOf, withToken } from './gate';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

/** The server's page of sessions (ostrom-server `SessionsRoutes`). */
const PAGE = 50;

/** A session of `repo`, opened as a workstation does: a launch by the person on `page`, then its agent's session. */
async function openSession(
  page: Page,
  org: string,
  repo: string,
): Promise<{ id: string; agentToken: string }> {
  const launch = await callFromPage(page, 'POST', '/api/v1/launches', { agent: 'claude', repo }, org);
  expect(launch.status, JSON.stringify(launch.body)).toBe(201);
  const { launchId, agentToken } = zCreateLaunchResponse.parse(launch.body);
  const id = crypto.randomUUID();
  const opened = await withToken(agentToken, org, 'POST', '/api/v1/sessions', {
    id,
    launchId,
    repo,
    agent: 'claude',
  });
  expect(opened.status, JSON.stringify(opened.body)).toBeLessThan(300);
  return { id, agentToken };
}

/** Ends a session as its launcher's hook does. */
async function endSession(org: string, session: { id: string; agentToken: string }): Promise<void> {
  const ended = await withToken(session.agentToken, org, 'POST', `/api/v1/sessions/${session.id}/end`, {
    exitCode: 0,
  });
  expect(ended.status, JSON.stringify(ended.body)).toBeLessThan(300);
}

test('6.1 the thread of a session shows who said yes or no to each gate it asked, and the receipt of the yes', async ({
  page,
  browser,
}) => {
  const ben = await anotherPerson(browser);
  const { org, member } = await ownerAndMember(page, ben, 'member');
  const repo = await gatedRepository(page, org, [member]);
  const session = await openSession(page, org, repo);
  const yes = await askPushToMain(session.agentToken, org, repo, session.id);
  const no = await askPushToMain(session.agentToken, org, repo, session.id);
  const waiting = await askPushToMain(session.agentToken, org, repo, session.id);

  // The approver answers in the console: a yes, then a no with what the agent should do instead.
  await openFromQueue(ben, await requestOf(ben, org, yes));
  await ben.getByRole('button', { name: /^Approve/ }).click();
  await expect(ben.getByRole('region', { name: 'Decision' })).toContainText(' approved: ');
  await openFromQueue(ben, await requestOf(ben, org, no));
  await ben.getByRole('button', { name: 'Decline & tell the agent…' }).click();
  await ben.getByLabel('What should the agent do instead?').fill('Wait for the release branch.');
  await ben.getByRole('button', { name: 'Decline and send' }).click();
  await expect(ben.getByRole('region', { name: 'Decision' })).toBeVisible();

  // What the server says of the thread, read as the console reads it.
  let answers: readonly { gateId: string; outcome: string; by: string; receiptId?: string | undefined }[] =
    [];
  await expect
    .poll(async () => {
      const read = await callFromPage(page, 'GET', `/api/v1/sessions/${session.id}`, undefined, org);
      answers = read.status === 200 ? (zGetSessionResponse.parse(read.body).session.gateAnswers ?? []) : [];
      return answers.map((answer) => `${answer.gateId}:${answer.outcome}:${answer.by}`).toSorted();
    })
    .toEqual([`${no}:refused:${member}`, `${yes}:approved:${member}`].toSorted());
  const receiptOf = (gate: string): string | undefined =>
    answers.find((answer) => answer.gateId === gate)?.receiptId;

  // The owner finds the session in the list, opens it, and reads the thread.
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sessions');
  await page
    .getByRole('link')
    .filter({ hasText: `claude · ${repo}` })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}$`));
  const what = page.getByRole('region', { name: 'What it did' });
  await expect(what).toContainText('3 requests for a person');
  const approved = what.getByRole('listitem').filter({ hasText: /^Approved/ });
  await expect(approved).toContainText(`by ${member}, `);
  const refused = what.getByRole('listitem').filter({ hasText: /^Refused/ });
  await expect(refused).toContainText(`by ${member}, `);
  await expect(what.getByRole('listitem').filter({ hasText: /^Waiting/ })).toContainText(waiting);
  // A yes and a no are both signed: each line leads to its own receipt.
  for (const [line, gate] of [
    [approved, yes],
    [refused, no],
  ] as const) {
    const receipt = receiptOf(gate);
    expect(receipt, `${gate} carries its receipt`).toBeDefined();
    await expect(line.getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      `/receipts/${receipt ?? ''}`,
    );
  }
  // Whether a gate's id opens its request: the session's lines link to /yes/<gate> (recorded, not asserted).
  const asApprover = await callFromPage(ben, 'GET', `/api/v1/approvals/${waiting}`, undefined, org);
  test.info().annotations.push({ type: 'GET /approvals/<gate id>', description: String(asApprover.status) });
});

test('6.1 the ended sessions come a page at a time, and the older ones when asked', async ({ page }) => {
  test.setTimeout(180_000);
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const run = Date.now().toString(36);
  // One more than a page: the oldest is on the second.
  const repos = Array.from({ length: PAGE + 1 }, (_, index) => `acme/old-${run}-${String(index)}`);
  for (const repo of repos) await endSession(org, await openSession(page, org, repo));
  const [oldest] = repos;

  await page.goto('/sessions');
  const ended = page.getByRole('region', { name: 'Ended' });
  await expect(ended.getByRole('link')).toHaveCount(PAGE);
  await expect(ended.getByRole('link').filter({ hasText: oldest ?? '' })).toHaveCount(0);
  await ended.getByRole('button', { name: 'Show older sessions' }).click();
  await expect(ended.getByRole('link')).toHaveCount(PAGE + 1);
  await expect(ended.getByRole('link').filter({ hasText: `claude · ${oldest ?? ''}` })).toHaveCount(1);
  await expect(ended.getByRole('button', { name: 'Show older sessions' })).toHaveCount(0);
});
