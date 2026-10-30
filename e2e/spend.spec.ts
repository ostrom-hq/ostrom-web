// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an owner reads the month against the budget and sets a member budget', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Spend' }).click();
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuetext', '$1,119.30 of $1,200.00');
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(page.getByText('$265.65')).toBeVisible();

  const form = page.getByRole('region', { name: 'Set a budget' });
  await form.getByRole('combobox', { name: 'For' }).selectOption('member');
  await form.getByRole('textbox', { name: 'Login' }).fill('ana');
  await form.getByRole('textbox', { name: 'Per day ($)' }).fill('20');
  await form.getByRole('button', { name: 'Save the budget' }).click();
  await expect(page.getByText('A member · ana')).toBeVisible();
});
