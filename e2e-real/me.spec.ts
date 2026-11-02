// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, type Response, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

interface MeBody {
  readonly dev: { readonly login: string };
  readonly member?: { readonly login: string; readonly name?: string; readonly role: string };
  readonly organization?: { readonly id: string; readonly name: string };
}

test.afterEach(closeOthers);

/** The console's own `GET /auth/me` with `Ostrom-Org` naming `org`, from the moment this is called. */
function consoleReadsMeIn(page: Page, org: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/me' &&
      response.request().headers()['ostrom-org'] === org,
  );
}

/**
 * The top bar's organization button, and what it says of the person there: their login and the role's own label, the
 * line visible beside the organization's name on desktop and on a phone.
 */
async function expectTopBar(
  page: Page,
  organization: string,
  login: string,
  role: 'Owner' | 'Admin',
): Promise<void> {
  const button = page.getByRole('button', { name: `Organization: ${organization}. Switch` });
  await expect(button).toBeVisible();
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(button).toHaveAccessibleDescription(new RegExp(`${escaped}.* · ${role}$`));
  await expect(button.getByText(new RegExp(` · ${role}$`))).toBeVisible();
}

test('the top bar reads /auth/me in the organization the console acts in: its name, and the person’s name and role', async ({
  page,
  browser,
}) => {
  // One organization: taken without asking; the console reads /auth/me with it named, and says who the person is there.
  const first = await ownerOfNewOrganization(page, 'mona');
  const readInFirst = consoleReadsMeIn(page, first.id);
  await page.goto('/yes');
  const inFirst = await readInFirst;
  expect(inFirst.status()).toBe(200);
  const meInFirst = (await inFirst.json()) as MeBody;
  expect(meInFirst.member?.role).toBe('owner');
  expect(meInFirst.organization?.id).toBe(first.id);
  const firstName = meInFirst.organization?.name ?? '';
  await expectTopBar(page, firstName, meInFirst.dev.login, 'Owner');
  await expect(page.getByRole('dialog', { name: 'Which organization?' })).toHaveCount(0);

  // A second organization of the same person: the console asks, then reads /auth/me again in the one chosen.
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `mona two ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
  const second = created.body as { id: string; name: string };
  await page.goto('/yes');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await expect(picker).toBeVisible();
  const readInSecond = consoleReadsMeIn(page, second.id);
  await picker
    .getByRole('list', { name: 'Your organizations' })
    .getByRole('button', { name: second.name })
    .click();
  const inSecond = await readInSecond;
  expect(inSecond.status()).toBe(200);
  const meInSecond = (await inSecond.json()) as MeBody;
  expect(meInSecond.member?.role).toBe('owner');
  expect(meInSecond.organization).toMatchObject({ id: second.id, name: second.name });
  await expectTopBar(page, second.name, meInSecond.dev.login, 'Owner');
  // The choice is kept: after a reload, the same organization, read again with it named.
  const readAfterReload = consoleReadsMeIn(page, second.id);
  await page.reload();
  await readAfterReload;
  await expectTopBar(page, second.name, meInSecond.dev.login, 'Owner');

  // Someone invited as an admin of the second: their own name and role there, from their own /auth/me.
  const admin = await anotherPerson(browser);
  await joinAs(page, second.id, admin, 'nils', 'admin');
  const readByAdmin = consoleReadsMeIn(admin, second.id);
  await admin.goto('/yes');
  const adminMe = (await (await readByAdmin).json()) as MeBody;
  expect(adminMe.member?.role).toBe('admin');
  await expectTopBar(admin, second.name, adminMe.dev.login, 'Admin');
  // An organization they are not in adds nothing to /auth/me, and is no error (ostrom-server#92).
  const foreign = await callFromPage(admin, 'GET', '/api/v1/auth/me', undefined, first.id);
  expect(foreign.status).toBe(200);
  expect(foreign.body).not.toHaveProperty('member');
  expect(foreign.body).not.toHaveProperty('organization');
});
