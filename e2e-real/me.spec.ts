// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

interface MeBody {
  readonly dev: { readonly login: string };
  readonly member?: { readonly login: string; readonly role: string };
  readonly organization?: { readonly id: string; readonly name: string };
}

test.afterEach(closeOthers);

/** The name an organization was created with, read back from the server. */
async function nameOf(page: Page, id: string): Promise<string> {
  const read = await callFromPage(page, 'GET', `/api/v1/orgs/${id}`);
  expect(read.status).toBe(200);
  return (read.body as { name: string }).name;
}

/** `/auth/me` as the server answers it, in the organization `org` names (none when absent). */
async function me(page: Page, org?: string): Promise<MeBody> {
  const answer = await callFromPage(page, 'GET', '/api/v1/auth/me', undefined, org);
  expect(answer.status).toBe(200);
  return answer.body as MeBody;
}

test('the top bar names the organization the console acts in, as /auth/me answers for it, with the person’s role', async ({
  page,
  browser,
}) => {
  // One organization: taken without asking, named in the top bar.
  const first = await ownerOfNewOrganization(page, 'mona');
  const firstName = await nameOf(page, first.id);
  await page.goto('/yes');
  await expect(page.getByRole('button', { name: `Organization: ${firstName}. Switch` })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Which organization?' })).toHaveCount(0);
  // Without Ostrom-Org, /auth/me says who is signed in and nothing of an organization; with it, the member and their role.
  const bare = await me(page);
  expect(bare.dev.login).not.toBe('');
  expect(bare.member).toBeUndefined();
  expect(bare.organization).toBeUndefined();
  const inFirst = await me(page, first.id);
  expect(inFirst.member?.role).toBe('owner');
  expect(inFirst.member?.login).toBe(bare.dev.login);
  expect(inFirst.organization).toMatchObject({ id: first.id, name: firstName });

  // Two organizations: the console asks, then reads /auth/me again in the one chosen, and the top bar keeps it.
  const second = await ownerOfNewOrganization(page, 'mona-two');
  const secondName = await nameOf(page, second.id);
  await page.goto('/yes');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await expect(picker).toBeVisible();
  const readAgain = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/me' &&
      response.request().headers()['ostrom-org'] === second.id,
  );
  await picker
    .getByRole('list', { name: 'Your organizations' })
    .getByRole('button', { name: secondName })
    .click();
  const answer = await readAgain;
  expect(answer.status()).toBe(200);
  const inSecond = (await answer.json()) as MeBody;
  expect(inSecond.member?.role).toBe('owner');
  expect(inSecond.organization).toMatchObject({ id: second.id, name: secondName });
  // The console took that answer: the top bar still names the organization, after it was read with the header.
  await expect(page.getByRole('button', { name: `Organization: ${secondName}. Switch` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: `Organization: ${secondName}. Switch` })).toBeVisible();

  // Someone invited as an admin: the top bar names that organization, and /auth/me gives their own role in it.
  const admin = await anotherPerson(browser);
  await joinAs(page, second.id, admin, 'nils', 'admin');
  await admin.goto('/yes');
  await expect(admin.getByRole('button', { name: `Organization: ${secondName}. Switch` })).toBeVisible();
  const adminInSecond = await me(admin, second.id);
  expect(adminInSecond.member?.role).toBe('admin');
  expect(adminInSecond.organization?.id).toBe(second.id);
  // An organization they are not in adds nothing, and is no error (server#92).
  const adminInFirst = await me(admin, first.id);
  expect(adminInFirst.member).toBeUndefined();
  expect(adminInFirst.organization).toBeUndefined();
});
