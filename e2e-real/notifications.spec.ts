// SPDX-License-Identifier: Apache-2.0
// The person's own notifications against the real server: the phone preferences (`/me/notifications`) and the
// switches per kind and channel (`/notifications/settings`) are kept for them, and another person never reads them.
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

test('a person keeps their phone preferences, and another person never reads them', async ({
  page,
  browser,
}) => {
  await ownerOfNewOrganization(page, 'nadia');
  await page.goto('/me/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My notifications');
  const phone = page.getByRole('region', { name: 'Approvals on your phone' });
  const spending = phone.getByRole('checkbox', { name: 'A budget about to be reached' });
  await expect(spending).not.toBeChecked();
  await spending.check();
  await phone.getByRole('button', { name: 'Save' }).click();
  await expect(phone.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(phone.getByRole('checkbox', { name: 'A budget about to be reached' })).toBeChecked();

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'olaf');
  await stranger.goto('/me/notifications');
  await expect(
    stranger
      .getByRole('region', { name: 'Approvals on your phone' })
      .getByRole('checkbox', { name: 'A budget about to be reached' }),
  ).not.toBeChecked();
});

test('§16 a switch turned off in one organization stays on for another organization’s owner', async ({
  page,
  browser,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'petra');
  const read = await callFromPage(page, 'GET', '/api/v1/notifications/settings', undefined, org);
  expect(read.status).toBe(200);
  const box = page.getByRole('region', { name: 'What you are told about' });
  await page.goto('/me/notifications');
  if (JSON.stringify(read.body).includes('"channels":[]')) {
    await expect(
      box.getByText('This server offers no notification channel yet. Ask whoever runs it.'),
    ).toBeVisible();
    return;
  }
  const waiting = box.getByRole('group', { name: 'An agent waits for you' }).getByRole('checkbox').first();
  await expect(waiting).toBeChecked();
  await waiting.uncheck();
  await expect(waiting).not.toBeChecked();
  await page.reload();
  await expect(waiting).not.toBeChecked();

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'quentin');
  await stranger.goto('/me/notifications');
  await expect(
    stranger
      .getByRole('region', { name: 'What you are told about' })
      .getByRole('group', { name: 'An agent waits for you' })
      .getByRole('checkbox')
      .first(),
  ).toBeChecked();
});
