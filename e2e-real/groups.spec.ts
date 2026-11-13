// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from '../e2e/navigation';
import { ownerAndMember } from './gate';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

test('an owner makes a group that lends a subscription, pauses a member and removes them; the member only reads it; another organization finds nothing', async ({
  page,
  browser,
}) => {
  const other = await anotherPerson(browser);
  const { org, member } = await ownerAndMember(page, other, 'member');
  // A subscription to lend, as `ostrom accounts share` sends it from a machine (e2e-real/guide.spec.ts).
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

  // Beside the subscriptions: none yet, then one made with the member and the subscription.
  await page.goto('/');
  await openScreen(page, 'Shared subscriptions');
  const tabs = page.getByRole('navigation', { name: 'Shared accounts' });
  await tabs.getByRole('link', { name: 'Groups' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groups' })).toBeVisible();
  await expect(page.getByText('No group. A group lends subscriptions to a team.')).toBeVisible();
  const form = page.getByRole('region', { name: 'New group' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Platform');
  await form.getByRole('checkbox', { name: member }).check();
  await form.getByRole('checkbox', { name: label }).check();
  await form.getByRole('button', { name: 'Create the group' }).click();
  const card = page.getByRole('article', { name: 'Platform' });
  await expect(card).toContainText('1 member');
  await expect(card).toContainText(`Lends ${label}`);
  await card.getByRole('link', { name: 'Platform' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Platform' })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop() ?? '';
  const lending = page.getByRole('region', { name: 'Subscriptions it lends' });
  await expect(lending.getByRole('checkbox', { name: label })).toBeChecked();

  // Paused for a day: on screen, and on the server.
  const members = page.getByRole('region', { name: 'Members' });
  const row = members.getByRole('listitem').filter({ hasText: member });
  await row.getByRole('button', { name: `Pause ${member}` }).click();
  await row.getByRole('button', { name: 'For a day' }).click();
  await expect(row).toContainText('Paused until');
  const paused = await callFromPage(page, 'GET', `/api/v1/groups/${id}`);
  const pauses = (paused.body as { paused: { login: string }[] }).paused;
  expect(pauses.map((pause) => pause.login)).toEqual([member]);

  // The member reads the group, with no button to change it, and the server refuses them every change.
  await other.goto(`/accounts/groups/${id}`);
  await expect(other.getByRole('heading', { level: 1, name: 'Platform' })).toBeVisible();
  await expect(other.getByText('Only an owner or an admin changes a group.')).toBeVisible();
  await expect(other.getByRole('region', { name: 'Members' }).getByRole('button')).toHaveCount(0);
  await expect(other.getByRole('region', { name: 'Members' })).toContainText('Paused until');
  expect((await callFromPage(other, 'PATCH', `/api/v1/groups/${id}`, { name: 'Mine' })).status).toBe(403);
  expect((await callFromPage(other, 'DELETE', `/api/v1/groups/${id}/members/${member}`)).status).toBe(403);
  expect((await callFromPage(other, 'POST', '/api/v1/groups', { name: 'Mine' })).status).toBe(403);

  // Removed after a second click.
  await row.getByRole('button', { name: 'Remove', exact: true }).click();
  await row.getByRole('button', { name: `Remove ${member} from the group` }).click();
  await expect(page.getByText('Nobody is in this group yet.')).toBeVisible();

  // Another organization: its own list is empty, the group is a 404, and its page sends back to the list.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'cleo');
  expect((await callFromPage(stranger, 'GET', `/api/v1/groups/${id}`)).status).toBe(404);
  expect((await callFromPage(stranger, 'GET', `/api/v1/groups/${id}`, undefined, org)).status).toBe(404);
  const theirs = await callFromPage(stranger, 'GET', '/api/v1/groups');
  expect((theirs.body as { items: unknown[] }).items).toEqual([]);
  await stranger.goto(`/accounts/groups/${id}`);
  await expect(stranger.getByText('This group no longer exists.')).toBeVisible();
  await expect(stranger.getByRole('heading', { name: 'Platform' })).toHaveCount(0);
});
