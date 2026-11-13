// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import {
  accept,
  anotherPerson,
  callFromPage,
  closeOthers,
  invitationTo,
  ownerOfNewOrganization,
  served,
} from './real';

test.afterEach(closeOthers);

test('a person in two organizations chooses one, and every call then names it', async ({ page, browser }) => {
  // `GET /me/organizations` and the 409 org_required come with ostrom-server#64; once it is on main, the repository
  // variable OSTROM_WEB_REQUIRE_ORGS makes a missing route a failure, not a skip.
  const required = process.env['OSTROM_E2E_REQUIRE_ORGS'] === 'true';
  test.skip(
    !required && !(await served(page, 'GET', '/api/v1/me/organizations')),
    'GET /api/v1/me/organizations not served yet',
  );
  // Her own organization, and another person's that she joins: the server gives a person one free team
  // (`FreeTeamTakenException`, 402), so a second organization is someone else's.
  const acme = await ownerOfNewOrganization(page, 'lena');
  const omar = await anotherPerson(browser);
  const globex = await ownerOfNewOrganization(omar, 'omar');
  await accept(page, await invitationTo(omar, globex.id, 'member'));
  const ids = [acme.id, globex.id];
  const globexName = ((await callFromPage(page, 'GET', `/api/v1/orgs/${globex.id}`)).body as { name: string })
    .name;
  await page.goto('/artifacts');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await expect(picker).toBeVisible();
  const named = page.waitForRequest(
    (request) => request.url().includes('/api/v1/artifacts') && request.headers()['ostrom-org'] === ids[1],
  );
  await picker.getByRole('button', { name: globexName }).click();
  await named;
  await expect(page.getByRole('button', { name: `Organization: ${globexName}. Switch` })).toBeVisible();
});
