// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

test('an owner reviews a new organization’s usage: nothing pending, no correction, and no other organization reads it', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'ugo');
  const capabilities = await callFromPage(page, 'GET', '/api/v1/capabilities');
  test.skip(
    !(capabilities.body as { features: string[] }).features.includes('capacity.usagereconciliation.v1'),
    'the server does not serve the usage review yet',
  );

  await page.goto('/usage');
  await expect(page.getByRole('heading', { level: 1, name: 'Usage review' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Pending requests' }).getByText('No request needs review.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Reconciliation history' }).click();
  await expect(page).toHaveURL(/\/usage\?view=history$/);
  await expect(
    page.getByRole('region', { name: 'Reconciliation history' }).getByText('No correction yet.'),
  ).toBeVisible();

  // The server's answers behind the screen: empty pages, and a request id it does not hold is no review.
  expect(await callFromPage(page, 'GET', '/api/v1/usage/pending')).toEqual({
    status: 200,
    body: { items: [] },
  });
  expect(await callFromPage(page, 'GET', '/api/v1/usage/reconciliations')).toEqual({
    status: 200,
    body: { items: [] },
  });
  await page.goto('/usage/call_unknown');
  await expect(page.getByText('Nothing to review here')).toBeVisible();
  const reconcile = await callFromPage(page, 'POST', '/api/v1/usage/reservations/call_unknown/reconcile', {
    expectedMicros: 1,
    micros: 0,
    source: 'PROVIDER_RECORD',
    reference: 'export',
    reason: 'cut',
  });
  expect(reconcile.status).toBe(404);

  // A member is told it is for owners and admins, and the server refuses them.
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'uma', 'member');
  expect((await callFromPage(member, 'GET', '/api/v1/usage/pending', undefined, org.id)).status).toBe(403);

  // Another organization's owner cannot name this one.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'vic');
  for (const path of [
    '/api/v1/usage/pending',
    '/api/v1/usage/reconciliations',
    '/api/v1/usage/reservations/call_unknown',
  ]) {
    expect((await callFromPage(stranger, 'GET', path, undefined, org.id)).status, path).toBe(404);
  }
});
