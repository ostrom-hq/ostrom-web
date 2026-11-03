// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner reads the plan, switches to Business yearly, then opens Stripe’s portal', async ({ page }) => {
  // Stripe's test pages are never called: the browser lands on a stand-in.
  await page.route('https://billing.stripe.com/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Stripe portal (test)</title>' });
  });
  await page.goto('/');
  await openScreen(page, 'Billing');
  await expect(page.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Agent hours used' })).toHaveAttribute(
    'aria-valuetext',
    '165 of 200 agent hours',
  );

  const plans = page.getByRole('region', { name: 'Plans' });
  await plans.getByRole('button', { name: 'Yearly, 20 % off' }).click();
  await plans.getByRole('button', { name: 'Switch to Business' }).click();
  await expect(page.getByRole('region', { name: 'Plan' }).getByText(/^Billed yearly/)).toBeVisible();

  await expect(page.getByRole('region', { name: 'Invoices' }).getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Payment method and billing details' }).click();
  await expect(page).toHaveURL('https://billing.stripe.com/p/session/test_ostrom');
});
