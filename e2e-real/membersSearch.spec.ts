// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { zOrgMemberList } from '../gen/api/zod.gen';
import { callFromPage, signIn } from './real';

/**
 * The team console-journey.yml seeds once migrated (ostrom-server `ci/seed-large-org.sql`): 121 people, so the
 * console's search shows (past a page of 100). Two of them joined last, past the first page: `zoe-late`, found by
 * login, and `crowd-119`, named "Zoey Byname", found by name. Another seeded team has its own `zoe-elsewhere`.
 */
const CROWD = 'a5ea7c00-0000-4000-8000-000000000001';
const OWNER = 'search-owner@search-crowd.e2e.ostrom.test';
const FOUND = ['zoe-late', 'crowd-119'];
const ELSEWHERE = 'zoe-elsewhere';

/** The logins of the members screen's list. */
async function listed(page: Page): Promise<string[]> {
  return await page
    .getByRole('region', { name: 'People' })
    .getByRole('listitem')
    .locator('.o-row__meta')
    .allTextContents();
}

test('the members search finds people past the first page, of this team only, or says nobody', async ({
  page,
}) => {
  await signIn(page, OWNER, '/members');

  // The first page: a hundred people, and neither of the two who joined last.
  const people = page.getByRole('region', { name: 'People' });
  await expect(people.getByRole('listitem')).toHaveCount(100);
  for (const login of FOUND) expect(await listed(page)).not.toContain(`@${login}`);

  // A search goes to the server (`q`), which answers with the two people past the first page, and only them.
  const box = people.getByRole('searchbox', { name: 'Find someone' });
  const asked = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1/orgs/${CROWD}/members` && url.searchParams.get('q') === 'zoe';
  });
  await box.fill('zoe');
  const answer = await asked;
  expect(answer.status()).toBe(200);
  const served = zOrgMemberList.parse(await answer.json());
  expect(served.items.map((member) => member.login)).toEqual(FOUND);
  await expect(people.getByRole('listitem')).toHaveCount(2);
  // The screen sorts by role, then name: compare who is listed, not in which order.
  expect((await listed(page)).toSorted()).toEqual(FOUND.map((login) => `@${login}`).toSorted());
  await expect(people.getByText('Zoey Byname', { exact: true })).toBeVisible();

  // Never someone of another team, whatever their login.
  expect(await listed(page)).not.toContain(`@${ELSEWHERE}`);
  const direct = await callFromPage(page, 'GET', `/api/v1/orgs/${CROWD}/members?q=${ELSEWHERE}`);
  expect(direct.status).toBe(200);
  expect(zOrgMemberList.parse(direct.body).items).toEqual([]);

  // Nobody: the screen says so, with what was typed.
  await box.fill('nobody-here');
  await expect(people.getByRole('status')).toHaveText('Nobody’s login or name starts with “nobody-here”.');
  await expect(people.getByRole('listitem')).toHaveCount(0);
});
