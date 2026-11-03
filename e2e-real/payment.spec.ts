// SPDX-License-Identifier: AGPL-3.0-only
// Paying for a plan with Stripe's test card 4242, end to end: the console, the real server, Stripe in TEST mode (its
// hosted Checkout, never a live key) and Stripe's signed webhook back to the server. It runs only when ostrom-server's
// `console-journey.yml` is dispatched with `stripe: test`: the server then holds the repository's test key (refused
// unless it starts with `sk_test_`) and the Stripe CLI forwards the account's events to `/webhooks/stripe`, signed
// with its own secret. Everywhere else Stripe is stripe-mock, which has no Checkout page to pay on: billing.spec.ts
// covers that path.
import { expect, type Page, test } from '@playwright/test';
import { callFromPage, ownerOfNewOrganization } from './real';

const STRIPE_TEST_MODE = process.env['OSTROM_E2E_STRIPE'] === 'test';

/** Stripe's test card that always succeeds, without 3-D Secure. */
const CARD = { number: '4242424242424242', expiry: '12 / 34', cvc: '123' };

/** A field of Stripe's Checkout page, when it shows (its layout differs between a phone and a computer). */
async function shown(page: Page, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
}

/** Fills Stripe's hosted Checkout with the test card and a French billing address, pays, and waits to come back. */
async function payOnStripeCheckout(page: Page): Promise<void> {
  // Checkout may list several payment methods: the card is then one item to open first.
  const card = page.locator('[data-testid="card-accordion-item-button"]');
  const number = page.locator('#cardNumber');
  await expect(card.or(number).first()).toBeVisible({ timeout: 60_000 });
  if (await shown(page, '[data-testid="card-accordion-item-button"]')) await card.click();
  // The server opens Checkout for a customer without an email (ostrom-server's createCustomer): Stripe asks for one.
  const email = page.locator('#email');
  if ((await shown(page, '#email')) && (await email.isEditable()) && (await email.inputValue()) === '') {
    await email.fill('billing-journey@example.com');
  }
  await number.fill(CARD.number);
  await page.locator('#cardExpiry').fill(CARD.expiry);
  await page.locator('#cardCvc').fill(CARD.cvc);
  await page.locator('#billingName').fill('Ostrom Journey');
  await page.locator('#billingCountry').selectOption('FR');
  // The address may start as one search field: Stripe then offers to type it by hand.
  const manual = page.getByRole('button', { name: /enter address manually/i });
  if (!(await shown(page, '#billingAddressLine1')) && (await manual.isVisible().catch(() => false))) {
    await manual.click();
  }
  await page.locator('#billingAddressLine1').fill('60 rue François 1er');
  await page.locator('#billingPostalCode').fill('75008');
  await page.locator('#billingLocality').fill('Paris');
  // Stripe's Link would ask for a phone number to save the card: the journey pays without it.
  const link = page.locator('#enableStripePass');
  if ((await shown(page, '#enableStripePass')) && (await link.isChecked())) await link.uncheck();
  // The French address changes the tax, and Stripe updates the session first: a Subscribe click during that update
  // sends no payment (run 41631712199, no confirm call). Clicked again until Stripe sends the payer back.
  const subscribe = page.locator('[data-testid="hosted-payment-submit-button"]');
  await expect(async () => {
    if (new URL(page.url()).hostname === 'checkout.stripe.com') await subscribe.click({ timeout: 10_000 });
    await expect(page).toHaveURL(/^http:\/\/localhost:4173\/billing/, { timeout: 20_000 });
  }).toPass({ timeout: 120_000, intervals: [1_000] });
}

test('an owner pays for Team with the test card 4242 on Stripe Checkout, and the console shows the paid plan once Stripe’s webhook says so', async ({
  page,
}) => {
  test.skip(
    !STRIPE_TEST_MODE,
    'Stripe test mode not configured (console-journey.yml dispatched with stripe: test); stripe-mock has no Checkout',
  );
  test.setTimeout(240_000);
  const org = await ownerOfNewOrganization(page, 'pia');
  await page.goto('/billing');
  const plan = page.getByRole('region', { name: 'Plan', exact: true });
  await expect(plan.getByText('Free', { exact: true })).toBeVisible();

  // Yearly: a price per person paid upfront, so the card is charged now (the monthly one is metered, billed later).
  const plans = page.getByRole('region', { name: 'Plans' });
  await plans.getByRole('button', { name: /^Yearly/ }).click();
  await expect(plans.getByRole('listitem', { name: 'Team', exact: true })).toContainText('per person a year');
  await plans.getByRole('button', { name: 'Choose Team' }).click();
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });

  // Stripe sends the payer back to the console's billing page.
  await payOnStripeCheckout(page);

  // The plan changes only when the server has Stripe's signed event: the console never trusts the way back.
  const billingPath = `/api/v1/orgs/${org.id}/billing`;
  await expect
    .poll(
      async () => {
        const read = await callFromPage(page, 'GET', billingPath);
        const body = read.body as { plan?: string; status?: string | null; interval?: string | null };
        return `${read.status.toString()} ${body.plan ?? ''} ${body.status ?? ''} ${body.interval ?? ''}`;
      },
      { timeout: 90_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('200 team active year');

  // The card was charged: Stripe's invoice for the year is paid.
  await expect
    .poll(
      async () => {
        const read = await callFromPage(page, 'GET', `${billingPath}/invoices`);
        return ((read.body as { invoices?: { status: string }[] }).invoices ?? []).map(
          (invoice) => invoice.status,
        );
      },
      { timeout: 60_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toContain('paid');

  await page.goto('/billing');
  const paid = page.getByRole('region', { name: 'Plan', exact: true });
  await expect(paid.getByText('Team', { exact: true })).toBeVisible();
  await expect(paid).toContainText('Active');
  await expect(paid).toContainText('Billed yearly');
  await expect(page.getByRole('region', { name: 'Invoices' })).toContainText('Paid');
  await expect(
    page.getByRole('region', { name: 'Subscription' }).getByRole('button', {
      name: 'Payment method and billing details',
    }),
  ).toBeVisible();
});
