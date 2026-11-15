// SPDX-License-Identifier: Apache-2.0
// TeamCode's Forecasts page against the real server: an owner reads the forecasts of a shared subscription, a member
// is refused, and another organization never sees the first one's account, by its list or by its id (CONVENTIONS §16).
import { expect, test } from '@playwright/test';
import { openScreen } from '../e2e/navigation';
import { ownerAndMember } from './gate';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization, served } from './real';

test.afterEach(closeOthers);

test('an owner reads a shared subscription’s forecasts; a member is refused; another organization never sees it', async ({
  page,
  browser,
}) => {
  test.skip(
    !(await served(page, 'GET', '/api/v1/forecasts')),
    'GET /api/v1/forecasts not served by this server image yet (server#561)',
  );
  const other = await anotherPerson(browser);
  const { org } = await ownerAndMember(page, other, 'member');
  // A subscription to lend, as `ostrom accounts share` sends it from a machine (e2e-real/groups.spec.ts).
  const run = Date.now().toString(36);
  const label = `Ada’s Claude Max ${run}`;
  const shared = await callFromPage(page, 'POST', '/api/v1/accounts', {
    provider: 'claude',
    label,
    providerAccountId: `ada-${run}@acme.test`,
    accessToken: `sk-ant-oat01-e2e-${run}`,
    refreshToken: `sk-ant-ort01-e2e-${run}`,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  expect(shared.status, JSON.stringify(shared.body)).toBe(201);
  const account = (shared.body as { id: string }).id;

  // The owner opens it from the navigation: the account is picked, and nothing read yet is said, never drawn as 0 %.
  await page.goto('/');
  await openScreen(page, 'Forecasts');
  await expect(page.getByRole('heading', { level: 1, name: 'Forecasts' })).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Subscription account' });
  await expect(picker).toHaveValue(account);
  await expect(picker.getByRole('option', { name: `${label} · claude` })).toHaveCount(1);
  await expect(page.getByText('No window read yet')).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause live updates' })).toBeVisible();
  // The address names it, as the server answers it.
  await page.goto(`/forecasts?account=${account}`);
  await expect(picker).toHaveValue(account);
  const read = await callFromPage(page, 'GET', `/api/v1/forecasts?account=${account}`, undefined, org);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect((read.body as { account?: { id: string } }).account?.id).toBe(account);

  // A member has no entry and is told the page is for owners and admins; the server refuses them too.
  await other.goto(`/forecasts?account=${account}`);
  await expect(other.getByText('Owners and admins only')).toBeVisible();
  await expect(other.getByText(label)).toHaveCount(0);
  await expect(
    other.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Forecasts', exact: true }),
  ).toHaveCount(0);
  expect((await callFromPage(other, 'GET', '/api/v1/forecasts')).status).toBe(403);

  // Another organization's owner: its own list is empty, and the first one's account, by its id, opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'cleo');
  await stranger.goto('/forecasts');
  await expect(stranger.getByText('No shared subscription yet')).toBeVisible();
  await expect(stranger.getByText(label)).toHaveCount(0);
  await stranger.goto(`/forecasts?account=${account}`);
  await expect(stranger.getByText('No such account')).toBeVisible();
  await expect(stranger.getByText(label)).toHaveCount(0);
  await expect(stranger.getByRole('option', { name: new RegExp(run) })).toHaveCount(0);
  expect((await callFromPage(stranger, 'GET', `/api/v1/forecasts?account=${account}`)).status).toBe(404);
  // Naming the first organization opens nothing either.
  expect((await callFromPage(stranger, 'GET', '/api/v1/forecasts', undefined, org)).status).toBe(404);
});
