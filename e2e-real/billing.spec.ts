// SPDX-License-Identifier: AGPL-3.0-only
// Billing against the real server in Stripe test mode: in ostrom-server's `console-journey.yml`, Stripe is
// stripe-mock (`OSTROM_STRIPE_API_BASE`), so no card is charged and nothing live is called. Paying with the test card
// 4242 happens on Stripe's own page, in payment.spec.ts, which runs only against Stripe's test mode: here the browser
// that leaves for Checkout lands on a stand-in, then comes back the way Stripe sends it back.
import { expect, type Page, test } from '@playwright/test';
import {
  anotherPerson,
  callFromPage,
  closeOthers,
  freshEmail,
  joinAs,
  ownerOfNewOrganization,
  signIn,
} from './real';

test.afterEach(closeOthers);

/** Stripe's Checkout is never reached: the browser that leaves for it lands on a page of the journey's own. */
async function standInForCheckout(page: Page): Promise<void> {
  await page.route('https://checkout.stripe.com/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Stripe Checkout (test)</title>' });
  });
}

/** The billing screen of a new organization: the free plan, no subscription, and both plans on sale. */
async function aFreeOrganization(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  const plan = page.getByRole('region', { name: 'Plan', exact: true });
  await expect(plan.getByText('Free', { exact: true })).toBeVisible();
  await expect(plan.getByText('No subscription')).toBeVisible();
  const plans = page.getByRole('region', { name: 'Plans' });
  for (const name of ['Team', 'Business']) {
    const offer = plans.getByRole('listitem', { name, exact: true });
    await expect(offer).toContainText('per person a month');
    await expect(offer.getByRole('button', { name: `Choose ${name}` })).toBeEnabled();
  }
}

test('an owner chooses Team on the billing page, leaves for Stripe Checkout, and comes back to it', async ({
  page,
}) => {
  await standInForCheckout(page);
  const org = await ownerOfNewOrganization(page, 'bea');
  await page.goto('/billing');
  await aFreeOrganization(page);

  // The interval switches the prices shown; the journey buys monthly.
  const plans = page.getByRole('region', { name: 'Plans' });
  const yearly = plans.getByRole('button', { name: /^Yearly/ });
  await yearly.click();
  await expect(yearly).toHaveAttribute('aria-pressed', 'true');
  await expect(plans.getByRole('listitem', { name: 'Team', exact: true })).toContainText('per person a year');
  await plans.getByRole('button', { name: 'Monthly' }).click();

  // The server opens a Checkout session at Stripe (stripe-mock) and the console follows its https address.
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/v1/orgs/${org.id}/billing/checkout`,
  );
  await plans.getByRole('button', { name: 'Choose Team' }).click();
  const checkout = await started;
  expect(checkout.status()).toBe(200);
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);

  // Stripe sends the payer back to the console's billing page (the server's `billingPageUrl`, `/billing`). Until
  // Stripe's webhook says the subscription started, the organization is still on its free plan, and the page offers
  // the plans again, not a button left busy by the way out.
  await page.goto('/billing?checkout=success');
  await aFreeOrganization(page);

  // A payer who gives up at Checkout comes back to the same page.
  await page.goto('/billing?checkout=canceled');
  await aFreeOrganization(page);
});

test('a member reads the plan of their organization but neither buys nor reads its invoices, and an outsider reads nothing', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'cyd');
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'dov', 'member');

  await member.goto('/billing');
  await expect(member.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  await expect(
    member.getByRole('region', { name: 'Plan', exact: true }).getByText('Free', { exact: true }),
  ).toBeVisible();
  await expect(
    member.getByText('Owners, admins and the billing role change the plan and read the invoices.'),
  ).toBeVisible();
  await expect(member.getByRole('region', { name: 'Plans' })).toHaveCount(0);
  await expect(member.getByRole('region', { name: 'Invoices' })).toHaveCount(0);

  // Someone outside the organization reads neither its plan nor its invoices.
  const outsider = await anotherPerson(browser);
  await signIn(outsider, freshEmail('eli'));
  for (const path of [`/api/v1/orgs/${org.id}/billing`, `/api/v1/orgs/${org.id}/billing/invoices`]) {
    const read = await callFromPage(outsider, 'GET', path);
    expect([403, 404]).toContain(read.status);
  }
});
