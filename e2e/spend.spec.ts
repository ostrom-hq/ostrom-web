// SPDX-License-Identifier: Apache-2.0
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

test('an admin grants a member a temporary daily budget, then revokes it', async ({ page }) => {
  await page.goto('/spend');
  const box = page.getByRole('region', { name: 'Temporary daily budgets' });
  await box.getByRole('combobox', { name: 'Member' }).selectOption({ label: 'theo' });
  const grant = box.getByRole('form', { name: 'Grant the temporary budget' });
  await grant.getByRole('textbox', { name: 'Total today ($)' }).fill('25');
  await grant.getByRole('textbox', { name: 'Reason (no secrets)' }).fill('release day');
  await grant.getByRole('button', { name: 'Grant the temporary budget' }).click();
  const line = box.getByRole('list', { name: 'Grants and revocations' }).getByRole('listitem');
  await expect(line).toContainText('$25.00 today');
  await expect(line).toContainText('In force');
  const revoke = box.getByRole('form', { name: 'Revoke' });
  await revoke.getByRole('textbox', { name: 'Revocation reason' }).fill('done');
  await revoke.getByRole('button', { name: 'Revoke' }).click();
  await expect(line).toContainText('Revoked');
});
