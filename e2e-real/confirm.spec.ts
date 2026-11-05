// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { pick } from 'zod/mini';
import { zCreateTokenResponse } from '../gen/api/zod.gen';
import {
  anotherPerson,
  callAsCli,
  callFromPage,
  cliToken,
  closeOthers,
  freshEmail,
  ownerOfNewOrganization,
} from './real';

test.afterEach(closeOthers);

/** What the journeys read of the server's answers (core `GovernanceConfirmationPending`, `GatePolicy`, …). */
const PENDING = z.object({ confirmationId: z.string(), confirmUrl: z.string(), expiresAt: z.string() });
const POLICY = z.object({ selfApproval: z.string() });
const CONFIRMATION = z.object({ status: z.string() });
type Pending = z.infer<typeof PENDING>;

/**
 * The self-approval policy flipped with a CLI token of `kind`: the confirmation it opens, or a skip while the server
 * applies a CLI token's governance write at once (governance confirmations not served yet, ostrom-server GOV-CONFIRM).
 */
async function askWithCli(
  page: Page,
  org: string,
  kind: 'admin' | 'device',
): Promise<{ pending: Pending; to: string }> {
  const token = await cliToken(page, org, kind);
  test.skip(token === undefined, `POST /api/v1/auth/device refuses the ${kind} login: not served yet`);
  const now = await callFromPage(page, 'GET', '/api/v1/gates/policy', undefined, org);
  expect(now.status).toBe(200);
  const to = POLICY.parse(now.body).selfApproval === 'never' ? 'sole-approver' : 'never';
  const asked = await callAsCli(token ?? '', 'PUT', '/api/v1/gates/policy', { selfApproval: to }, org);
  test.skip(
    asked.status !== 202,
    `PUT /api/v1/gates/policy with a CLI token answers ${asked.status.toString()}: confirmations not served yet`,
  );
  const pending = PENDING.parse(asked.body);
  expect(new URL(pending.confirmUrl).pathname).toBe(`/confirm/${pending.confirmationId}`);
  // Nothing is written until a person confirms it.
  const still = await callFromPage(page, 'GET', '/api/v1/gates/policy', undefined, org);
  expect(POLICY.parse(still.body).selfApproval).not.toBe(to);
  return { pending, to };
}

test('an owner confirms on the console the governance change their admin CLI token asked for', async ({
  page,
}) => {
  const org = await ownerOfNewOrganization(page, 'gina');
  const { pending, to } = await askWithCli(page, org.id, 'admin');

  await page.goto(new URL(pending.confirmUrl).pathname);
  await expect(page.getByText('Waiting for you')).toBeVisible();
  await expect(page.getByText(/^expires in \d+:\d\d$/)).toBeVisible();
  await expect(
    page.getByText('If you did not run this command yourself, refuse: an agent may have asked for it.'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'What it changes' })).toContainText(
    'PUT /api/v1/gates/policy',
  );
  await expect(page.getByRole('region', { name: 'Who asks' })).toContainText('ostrom login --admin');
  await expect(page.getByRole('figure', { name: 'After' }).locator('ins')).toContainText(`"${to}"`);

  // The sign-in is seconds old: confirming needs no fresh one.
  await page.getByRole('button', { name: 'Confirm the change' }).click();
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText('Confirmed and written');
  const written = await callFromPage(page, 'GET', '/api/v1/gates/policy', undefined, org.id);
  expect(POLICY.parse(written.body).selfApproval).toBe(to);
});

test('refusing a change asked with an ordinary CLI token writes nothing', async ({ page }) => {
  const org = await ownerOfNewOrganization(page, 'rafa');
  const { pending, to } = await askWithCli(page, org.id, 'device');

  await page.goto(`/confirm/${pending.confirmationId}`);
  await expect(page.getByRole('region', { name: 'Who asks' })).toContainText('ostrom login');
  await page.getByRole('button', { name: 'Refuse' }).click();
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText('Refused');
  const after = await callFromPage(page, 'GET', '/api/v1/gates/policy', undefined, org.id);
  expect(POLICY.parse(after.body).selfApproval).not.toBe(to);
  const read = await callFromPage(
    page,
    'GET',
    `/api/v1/confirmations/${pending.confirmationId}`,
    undefined,
    org.id,
  );
  expect(CONFIRMATION.parse(read.body).status).toBe('refused');
});

test('another organization never sees nor answers the confirmation', async ({ page, browser }) => {
  const org = await ownerOfNewOrganization(page, 'otto');
  const { pending } = await askWithCli(page, org.id, 'admin');

  const other = await anotherPerson(browser);
  const elsewhere = await ownerOfNewOrganization(other, 'olga');
  await other.goto(`/confirm/${pending.confirmationId}`);
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Confirmation not found');
  for (const [method, path, body] of [
    ['GET', `/api/v1/confirmations/${pending.confirmationId}`, undefined],
    ['POST', `/api/v1/confirmations/${pending.confirmationId}/answer`, { answer: 'confirm' }],
  ] as const) {
    expect((await callFromPage(other, method, path, body, elsewhere.id)).status, `${method} ${path}`).toBe(
      404,
    );
  }
  // Still waiting for its own organization.
  const read = await callFromPage(
    page,
    'GET',
    `/api/v1/confirmations/${pending.confirmationId}`,
    undefined,
    org.id,
  );
  expect(CONFIRMATION.parse(read.body).status).toBe('pending');
});

test('2.6: a person’s API token invites, and an owner confirms on the console who is invited', async ({
  page,
}) => {
  const org = await ownerOfNewOrganization(page, 'ivy');
  // The person's own API token, as a script or the CLI uses it: `orgs:write` invites. An `ostrom login` token has no
  // `orgs:write` (CLI_SCOPES), so it is refused (403) rather than held.
  const created = await callFromPage(
    page,
    'POST',
    '/api/v1/tokens',
    { name: 'journey inviter', scopes: ['orgs:write'], expiresInDays: 1 },
    org.id,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const token = pick(zCreateTokenResponse, { secret: true }).parse(created.body).secret;
  // No skip: 2.6 is proved only by a write held and confirmed. A server that applies the invitation at once fails it.
  const invited = freshEmail('newcomer');
  const path = `/api/v1/orgs/${org.id}/members/invites`;
  const asked = await callAsCli(
    token,
    'POST',
    path,
    { invites: [{ email: invited, role: 'approver' }] },
    org.id,
  );
  expect(asked.status, `POST ${path} with a person's API token is held for a confirmation`).toBe(202);
  const pending = PENDING.parse(asked.body);
  // Nobody is invited until a person confirms it.
  const before = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/invitations`);
  expect(before.status).toBe(200);
  expect(JSON.stringify(before.body)).not.toContain(invited);

  await page.goto(new URL(pending.confirmUrl).pathname);
  await expect(page.getByText('Waiting for you')).toBeVisible();
  const who = page.getByRole('region', { name: 'Who is invited' });
  await expect(who).toContainText(invited);
  await expect(who).toContainText('Approver');
  // In words, not the JSON before and after.
  await expect(page.getByRole('region', { name: 'Before and after' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'What it changes' })).toContainText('Invite people');
  // Asked with a personal API token (`credential` `api_token`, server#332): its kind first, then its name, quoted.
  const asker = page.getByRole('region', { name: 'Who asks' });
  await expect(asker).toContainText('with a personal API token');
  await expect(asker.locator('q')).toHaveText('journey inviter');

  await page.getByRole('button', { name: 'Confirm the change' }).click();
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText('Confirmed and written');
  const after = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/invitations`);
  expect(after.status).toBe(200);
  expect(JSON.stringify(after.body)).toContain(invited);
  await page.goto('/members');
  await expect(page.getByRole('region', { name: 'Waiting invitations' })).toContainText(invited);
});
