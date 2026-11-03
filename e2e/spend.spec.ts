// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner reads the month against the budget and sets a member budget', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Spend');
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuetext', '$1,119.30 of $1,200.00');
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(page.getByText('$265.65')).toBeVisible();

  const form = page.getByRole('region', { name: 'Set a budget' });
  await form.getByRole('combobox', { name: 'For' }).selectOption('member');
  await form.getByRole('combobox', { name: 'Person' }).selectOption({ label: 'samir' });
  await form.getByRole('textbox', { name: 'Per day ($)' }).fill('20');
  await form.getByRole('button', { name: 'Save the budget' }).click();
  const line = page
    .getByRole('region', { name: 'Budgets' })
    .getByRole('listitem')
    .filter({ hasText: 'samir' });
  await expect(line).toContainText('$20.00 a day');
  await expect(line).toContainText('Warns');
});
