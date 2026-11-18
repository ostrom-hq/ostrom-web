// SPDX-License-Identifier: Apache-2.0
// TeamCode's capacity page, its pools, against the real server: an owner adds a shared overflow reserve and lets a
// member borrow it, the member reads their own pool only, and another organization never sees the first one's pools,
// by its page or by naming it (CONVENTIONS §16).
import { expect, test } from '@playwright/test';
import { openScreen } from '../e2e/navigation';
import { ownerAndMember } from './gate';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization, served } from './real';

test.afterEach(closeOthers);

test('an owner adds a reserve and lets a member borrow it; the member reads their pool; another organization sees neither', async ({
  page,
  browser,
}) => {
  test.skip(
    !(await served(page, 'GET', '/api/v1/pools/budgets')),
    'GET /api/v1/pools/budgets not served by this server image yet (server#684)',
  );
  const other = await anotherPerson(browser);
  const { org, member } = await ownerAndMember(page, other, 'member');
  const pool = `night-${Date.now().toString(36)}`;

  await page.goto('/');
  await openScreen(page, 'Capacity');
  await expect(page.getByRole('heading', { level: 1, name: 'Capacity' })).toBeVisible();
  const add = page.getByRole('form', { name: 'Add or update a pool' });
  await add.getByRole('textbox', { name: 'Pool' }).fill(pool);
  await add.getByRole('textbox', { name: 'Total daily budget (USD)' }).fill('25');
  await add.getByRole('checkbox', { name: /Shared overflow reserve/ }).check();
  await add.getByRole('button', { name: 'Save pool budget' }).click();
  await expect(
    page.getByRole('form', { name: `Pool ${pool}` }).getByText('$25.00 a day · No primary members'),
  ).toBeVisible();
  const read = await callFromPage(page, 'GET', '/api/v1/pools/budgets', undefined, org);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect(read.body).toContainEqual({ poolId: pool, dailyMicros: 25_000_000, sharedOverflow: true });

  // The member, the card that is not the owner's own.
  const card = page.getByRole('article').filter({ hasNotText: '(you)' });
  await card.getByRole('checkbox', { name: 'Allow shared overflow accounts' }).check();
  await card.getByRole('button', { name: 'Save limits' }).click();
  await expect(card.getByText(/^Shared pool · weight 1( \/ \d+)? · shared overflow allowed$/)).toBeVisible();
  // A reserve is never a member's home pool.
  await card.getByRole('textbox', { name: 'Pool (empty = shared)' }).fill(pool);
  await card.getByRole('button', { name: 'Save limits' }).click();
  await expect(card.getByText(/A shared overflow reserve has no primary members/)).toBeVisible();

  // The member reads their own pool, without the budgets; the server refuses them the budgets.
  await other.goto('/capacity');
  await expect(other.getByText(/^Shared pool · weight 1( \/ \d+)? · shared overflow allowed$/)).toBeVisible();
  await expect(other.getByText(pool)).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'Save limits' })).toHaveCount(0);
  expect((await callFromPage(other, 'GET', '/api/v1/pools/budgets', undefined, org)).status).toBe(403);

  // Another organization's owner: none of the first one's pools, and naming it opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'cleo');
  await stranger.goto('/capacity');
  await expect(stranger.getByRole('form', { name: 'Add or update a pool' })).toBeVisible();
  await expect(stranger.getByText(pool)).toHaveCount(0);
  const theirs = await callFromPage(stranger, 'GET', '/api/v1/pools/budgets');
  expect(theirs.status).toBe(200);
  expect(JSON.stringify(theirs.body)).not.toContain(pool);
  expect((await callFromPage(stranger, 'GET', '/api/v1/pools/budgets', undefined, org)).status).toBe(404);
  expect((await callFromPage(stranger, 'GET', `/api/v1/members/${member}/policy`)).status).toBe(404);
});
