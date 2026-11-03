// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner shares an artifact with a member, then lends a subscription', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Artifacts');
  const study = page.locator('article').filter({ hasText: 'Billing API: latency study' });
  await study.getByRole('button', { name: 'Versions and readers' }).click();
  await study.getByRole('combobox', { name: 'Add a reader' }).selectOption({ label: 'Samir Haddad (samir)' });
  await study.getByRole('button', { name: 'Share' }).click();
  await expect(study.getByRole('button', { name: 'Stop sharing with samir' })).toBeVisible();

  await openScreen(page, 'Shared subscriptions');
  const form = page.getByRole('region', { name: 'Share a subscription' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Team Pro');
  await form.getByRole('combobox', { name: 'Credential' }).selectOption('LINEAR_TOKEN');
  await form.getByRole('textbox', { name: 'Daily share in USD (optional)' }).fill('25');
  await form.getByRole('checkbox', { name: 'theo' }).check();
  await form.getByRole('button', { name: 'Share' }).click();
  const lent = page.locator('article').filter({ hasText: 'Team Pro' });
  await expect(lent).toContainText('$25.00 a day');
  await expect(lent).toContainText('Lent to theo');
});
