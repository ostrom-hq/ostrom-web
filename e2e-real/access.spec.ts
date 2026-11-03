// SPDX-License-Identifier: AGPL-3.0-only
// Line 2.11 of the journey (demo/PARCOURS.md), console side, against the real server: a personal token created,
// replaced and revoked; the person's browser sessions, one signed out from another; the organization's service key
// for its CI, created with a fresh sign-in and deleted; the CLI's workstations, listed and signed out. Each secret is
// tried against the server as a CI or the CLI would send it, alone, without the browser's cookie.
import { expect, type Page, request, test } from '@playwright/test';
import {
  anotherPerson,
  bodyOf,
  callFromPage,
  closeOthers,
  freshEmail,
  joinAs,
  ownerOfNewOrganization,
  signIn,
} from './real';

test.afterEach(closeOthers);

/**
 * Calls the API as a CI or the CLI does: through the console's own origin, without any cookie, with a bearer secret
 * when one is given.
 */
async function asProgram(
  method: string,
  path: string,
  options: { secret?: string; org?: string; data?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const { baseURL } = test.info().project.use;
  const context = await request.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    const response = await context.fetch(path, {
      method,
      headers: {
        accept: 'application/json',
        ...(options.secret === undefined ? {} : { authorization: `Bearer ${options.secret}` }),
        ...(options.org === undefined ? {} : { 'Ostrom-Org': options.org }),
      },
      ...(options.data === undefined ? {} : { data: options.data }),
      failOnStatusCode: false,
    });
    const status = response.status();
    return { status, body: bodyOf(`${method} ${path}`, status, await response.text()) };
  } finally {
    await context.dispose();
  }
}

/** A GET with a secret alone. */
async function withSecret(
  secret: string,
  path: string,
  org?: string,
): Promise<{ status: number; body: unknown }> {
  return asProgram('GET', path, org === undefined ? { secret } : { secret, org });
}

/** Creates an organization the signed-in person owns. */
async function ownOrganization(page: Page, who: string): Promise<void> {
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `${who} ${Date.now().toString(36)}`,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
}

/** The value of a secret shown once, read from its copy field. */
async function shownSecret(page: Page, name: string): Promise<string> {
  const field = page.getByRole('textbox', { name: `Secret of ${name}` });
  await expect(field).toHaveValue(/\S{16,}/);
  return field.inputValue();
}

test('a person creates a token, replaces its secret, then revokes it; each secret works until it should not', async ({
  page,
}) => {
  await signIn(page, freshEmail('tess'));
  await page.goto('/tokens');
  const form = page.getByRole('region', { name: 'New token' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Nightly CI');
  await form.getByRole('checkbox', { name: 'Your profile: Read' }).check();
  await form.getByRole('button', { name: 'Create the token' }).click();
  const first = await shownSecret(page, 'Nightly CI');
  expect((await withSecret(first, '/api/v1/auth/me')).status).toBe(200);
  await form.getByRole('button', { name: 'I copied it' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Nightly CI' });
  await row.getByRole('button', { name: 'Replace the secret' }).click();
  await row.getByRole('button', { name: 'Replace the secret of Nightly CI' }).click();
  const second = await shownSecret(page, 'Nightly CI');
  expect(second).not.toBe(first);
  expect((await withSecret(first, '/api/v1/auth/me')).status).toBe(401);
  expect((await withSecret(second, '/api/v1/auth/me')).status).toBe(200);
  await page.getByRole('button', { name: 'I copied it' }).click();

  await row.getByRole('button', { name: 'Revoke' }).click();
  await row.getByRole('button', { name: 'Revoke Nightly CI' }).click();
  await expect(row).toHaveCount(0);
  expect((await withSecret(second, '/api/v1/auth/me')).status).toBe(401);
});

test('a person signed in on two browsers sees both sessions and signs the other one out', async ({
  page,
  browser,
}) => {
  const email = freshEmail('uma');
  await signIn(page, email);
  // The sessions are read in an organization's settings: the person has one.
  await ownOrganization(page, 'Uma');
  const other = await anotherPerson(browser);
  await signIn(other, email);
  expect((await callFromPage(other, 'GET', '/api/v1/auth/me')).status).toBe(200);

  await page.goto('/settings');
  const security = page.getByRole('region', { name: 'Security' });
  const rows = security.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('This browser');
  const elsewhere = rows.filter({ hasNotText: 'This browser' });
  await elsewhere.getByRole('button', { name: 'Sign out' }).click();
  await elsewhere.getByRole('button', { name: /^Sign out .+/ }).click();
  await expect(rows).toHaveCount(1);
  expect((await callFromPage(other, 'GET', '/api/v1/auth/me')).status).toBe(401);
  expect((await callFromPage(page, 'GET', '/api/v1/auth/me')).status).toBe(200);
});

test('an owner creates a service key for the CI, a member and another organization cannot, and deleting it ends it', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'vera');
  await page.goto('/settings');
  const keys = page.getByRole('region', { name: 'Service keys' });
  await expect(keys.getByText('No service key yet.')).toBeVisible();
  await keys.getByRole('textbox', { name: 'Name' }).fill('GitHub Actions');
  await keys.getByRole('checkbox', { name: 'Report checks and sign workflow receipts' }).check();
  await keys.getByRole('checkbox', { name: 'Read the rules' }).check();
  await keys.getByRole('button', { name: 'Create the key' }).click();
  const secret = await shownSecret(page, 'GitHub Actions');
  // A key reads the rules (`rules:read`), for its own organization only, and nothing else a person could.
  expect((await withSecret(secret, '/api/v1/rules', org.id)).status).toBe(200);
  expect((await withSecret(secret, '/api/v1/auth/me')).status).not.toBe(200);
  await keys.getByRole('button', { name: 'I copied it' }).click();
  const row = keys.getByRole('listitem').filter({ hasText: 'GitHub Actions' });
  await expect(row).toContainText('Report checks and sign workflow receipts');
  await expect(row).toContainText('Read the rules');
  await expect(row).toContainText('expires');
  const listed = await callFromPage(page, 'GET', '/api/v1/service-keys');
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body)).not.toContain(secret);

  // A member reads who manages the keys, and the server refuses them the list.
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'wes', 'member');
  await member.goto('/settings');
  const theirs = member.getByRole('region', { name: 'Service keys' });
  await expect(theirs.getByText('Owners and admins manage the organization’s service keys.')).toBeVisible();
  await expect(theirs.getByText('GitHub Actions')).toHaveCount(0);
  expect((await callFromPage(member, 'GET', '/api/v1/service-keys', undefined, org.id)).status).toBe(403);

  // Another organization's owner: their own keys only, and the first one's do not exist for them.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'xena');
  await stranger.goto('/settings');
  await expect(
    stranger.getByRole('region', { name: 'Service keys' }).getByText('No service key yet.'),
  ).toBeVisible();
  expect((await callFromPage(stranger, 'GET', '/api/v1/service-keys', undefined, org.id)).status).toBe(404);

  await row.getByRole('button', { name: 'Delete' }).click();
  await row.getByRole('button', { name: 'Delete GitHub Actions' }).click();
  await expect(keys.getByText('No service key yet.')).toBeVisible();
  expect((await withSecret(secret, '/api/v1/rules', org.id)).status).toBe(401);
});

test('a person signs the CLI in, finds the workstation in the settings, and signs it out', async ({
  page,
}) => {
  await signIn(page, freshEmail('yusuf'));
  // The workstations are read in an organization's settings: the person has one.
  await ownOrganization(page, 'Yusuf');
  // `ostrom login`: the CLI, without the browser's cookie, asks for a code; the person says yes in the browser; the
  // CLI collects its token.
  const started = await asProgram('POST', '/api/v1/auth/device', { data: {} });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const { deviceCode, userCode } = started.body as { deviceCode: string; userCode: string };
  const answered = await callFromPage(page, 'POST', '/api/v1/auth/device/answer', {
    userCode,
    approve: true,
  });
  expect(answered.status, JSON.stringify(answered.body)).toBeLessThan(300);
  let cli = '';
  await expect
    .poll(async () => {
      const polled = await asProgram('POST', '/api/v1/auth/device/token', { data: { deviceCode } });
      if (polled.status === 200) cli = (polled.body as { token: string }).token;
      return polled.status;
    })
    .toBe(200);
  expect((await withSecret(cli, '/api/v1/auth/me')).status).toBe(200);

  const devices = await callFromPage(page, 'GET', '/api/v1/devices');
  expect(devices.status).toBe(200);
  const items = (devices.body as { items: { id: string; name: string }[] }).items;
  expect(items).toHaveLength(1);
  const [device] = items;
  if (device === undefined) throw new Error('The workstation is listed above.');

  await page.goto('/settings');
  const workstations = page.getByRole('region', { name: 'Workstations' });
  const row = workstations.getByRole('listitem').filter({ hasText: device.name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Sign out' }).click();
  await row.getByRole('button', { name: `Sign out ${device.name}` }).click();
  await expect(workstations.getByText('The CLI is signed in nowhere.')).toBeVisible();
  expect((await withSecret(cli, '/api/v1/auth/me')).status).toBe(401);
});
