// SPDX-License-Identifier: Apache-2.0
import { expect, type Page, type Response, test } from '@playwright/test';
import {
  accept,
  anotherPerson,
  callFromPage,
  closeOthers,
  invitationTo,
  ownerOfNewOrganization,
} from './real';

interface MeBody {
  readonly dev: { readonly login: string };
  readonly member?: { readonly login: string; readonly role: string };
  readonly organization?: { readonly id: string; readonly name: string };
}

test.afterEach(closeOthers);

/** The console's own `GET /auth/me` with `Ostrom-Org` naming `org`, from the moment this is called. */
async function consoleReadsMeIn(page: Page, org: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/me' &&
      response.request().headers()['ostrom-org'] === org,
  );
}

/** That answer, which must be the server's 200. */
async function bodyOf(answer: Promise<Response>): Promise<MeBody> {
  const response = await answer;
  expect(response.status()).toBe(200);
  return (await response.json()) as MeBody;
}

/**
 * The top bar's organization button, and what it says of the person there: their login and the role's own label. A
 * screen reader hears it as the button's description; the eye reads it on the line under the organization's name, in
 * the switch around the button (since web#67 the button holds the name alone, WCAG 2.5.3), on desktop and on a phone.
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
  const line = page
    .locator('.o-org-switch', { has: button })
    .getByText(new RegExp(`${escaped}.* · ${role}$`));
  await expect(line).toBeVisible();
}

test('the top bar reads /auth/me in the organization the console acts in: its name, and the person’s name and role', async ({
  page,
  browser,
}) => {
  // One organization: taken without asking; the console reads /auth/me with it named, and says who the person is there.
  const first = await ownerOfNewOrganization(page, 'mona');
  const readInFirst = consoleReadsMeIn(page, first.id);
  await page.goto('/yes');
  const inFirst = await bodyOf(readInFirst);
  expect(inFirst.member?.role).toBe('owner');
  expect(inFirst.organization?.id).toBe(first.id);
  const firstName = inFirst.organization?.name ?? '';
  await expectTopBar(page, firstName, inFirst.dev.login, 'Owner');
  await expect(page.getByRole('dialog', { name: 'Which organization?' })).toHaveCount(0);

  // Another person's organization, which she joins as an admin: two now, so the console asks, then reads /auth/me in
  // the one chosen, where her role is not the same.
  const nils = await anotherPerson(browser);
  const second = await ownerOfNewOrganization(nils, 'nils');
  await accept(page, await invitationTo(nils, second.id, 'admin'));
  const read = await callFromPage(page, 'GET', `/api/v1/orgs/${second.id}`);
  expect(read.status).toBe(200);
  const secondName = (read.body as { name: string }).name;
  await page.goto('/yes');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await expect(picker).toBeVisible();
  const readInSecond = consoleReadsMeIn(page, second.id);
  await picker
    .getByRole('list', { name: 'Your organizations' })
    .getByRole('button', { name: secondName })
    .click();
  const inSecond = await bodyOf(readInSecond);
  expect(inSecond.member?.role).toBe('admin');
  expect(inSecond.organization).toMatchObject({ id: second.id, name: secondName });
  await expectTopBar(page, secondName, inSecond.dev.login, 'Admin');

  // The choice is kept: after a reload, the same organization, read again with it named.
  const readAfterReload = consoleReadsMeIn(page, second.id);
  await page.reload();
  await bodyOf(readAfterReload);
  await expectTopBar(page, secondName, inSecond.dev.login, 'Admin');

  // Back to the first from the top bar: owner again there.
  await page.getByRole('button', { name: `Organization: ${secondName}. Switch` }).click();
  const backInFirst = consoleReadsMeIn(page, first.id);
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('list', { name: 'Your organizations' })
    .getByRole('button', { name: firstName })
    .click();
  expect((await bodyOf(backInFirst)).member?.role).toBe('owner');
  await expectTopBar(page, firstName, inFirst.dev.login, 'Owner');

  // An organization she is not in adds nothing to /auth/me, and is no error (ostrom-server#92).
  const foreign = await callFromPage(nils, 'GET', '/api/v1/auth/me', undefined, first.id);
  expect(foreign.status).toBe(200);
  expect(foreign.body).not.toHaveProperty('member');
  expect(foreign.body).not.toHaveProperty('organization');
});
