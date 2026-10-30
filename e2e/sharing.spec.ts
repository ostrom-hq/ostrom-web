// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an owner shares an artifact with a member, then lends a subscription', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Artifacts' }).click();
  const study = page.locator('article').filter({ hasText: 'Billing API: latency study' });
  await study.getByRole('button', { name: 'Versions and readers' }).click();
  await study.getByRole('combobox', { name: 'Add a reader' }).selectOption('samir');
  await study.getByRole('button', { name: 'Share' }).click();
  await expect(study.getByRole('button', { name: 'Stop sharing with samir' })).toBeVisible();

  await page.getByRole('link', { name: 'Shared subscriptions' }).click();
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
