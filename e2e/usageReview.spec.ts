// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin reconciles a pending request from the provider’s record', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Usage review');
  const pending = page.getByRole('region', { name: 'Pending requests' });
  await pending.getByRole('link', { name: 'call_51b2e0' }).click();
  const form = page.getByRole('region', { name: 'Reconcile usage' });
  await form.getByRole('textbox', { name: 'Verified total ($)' }).fill('0.2');
  await form.getByRole('combobox', { name: 'Evidence source' }).selectOption('PROVIDER_RECORD');
  await form.getByRole('textbox', { name: 'Evidence reference' }).fill('usage export');
  await form.getByRole('textbox', { name: 'Reason' }).fill('stream cut');
  await form.getByRole('button', { name: 'Reconcile usage' }).click();
  await expect(page.getByRole('region', { name: 'Correction' })).toContainText('$0.4805 → $0.20');
  await page.getByRole('link', { name: 'Reconciliation history' }).click();
  await expect(page.getByRole('region', { name: 'Reconciliation history' })).toContainText('call_51b2e0');
});
