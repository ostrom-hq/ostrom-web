// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

// Stripe here is stripe-mock with a test key (console-journey.yml): never live. Stripe's own pages are never opened
// either: the browser lands on a stand-in.
const STRIPE_PAGES = /^https:\/\/([a-z]+\.)?stripe\.com\//;

test('an owner reads a new organization’s free plan and is sent to Stripe’s test checkout; a member reads only', async ({
  page,
  browser,
}) => {
  await page.route(STRIPE_PAGES, async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Stripe (test)</title>' });
  });
  const org = await ownerOfNewOrganization(page, 'tove');
  const billing = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/billing`);
  expect(billing.status, JSON.stringify(billing.body)).toBe(200);
  expect(billing.body).toMatchObject({ plan: 'free' });

  await page.goto('/billing');
  await expect(page.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Plan' })).toContainText('Free');
  await expect(page.getByRole('meter', { name: 'Agent hours used' })).toBeVisible();
  const plans = page.getByRole('region', { name: 'Plans' });
  await expect(plans.getByRole('button', { name: 'Choose Team' })).toBeEnabled();
  await expect(page.getByText('Plans are not sold on this instance: it runs without Stripe.')).toHaveCount(0);

  // The checkout is Stripe's (test) page: the console leaves for it only on an https address.
  const leaving = page.waitForURL(STRIPE_PAGES);
  await plans.getByRole('button', { name: 'Choose Team' }).click();
  await leaving;
  expect(new URL(page.url()).protocol).toBe('https:');

  // A member reads the plan, changes nothing and sees no invoice.
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'ulla', 'member');
  await member.goto('/billing');
  await expect(member.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  await expect(
    member.getByText('Owners, admins and the billing role change the plan and read the invoices.'),
  ).toBeVisible();
  await expect(member.getByRole('button', { name: /^(Choose|Switch to) / })).toHaveCount(0);
  expect((await callFromPage(member, 'POST', `/api/v1/orgs/${org.id}/billing/checkout`, {
    plan: 'team',
    interval: 'month',
  })).status).toBe(403);

  // Another organization's owner: the first one's billing does not exist for them.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'vide');
  for (const path of ['', '/invoices']) {
    expect((await callFromPage(stranger, 'GET', `/api/v1/orgs/${org.id}/billing${path}`)).status, path).toBe(404);
  }
});
