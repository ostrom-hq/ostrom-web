// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an admin reads who approves what and stops the asker from approving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Approvers' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who approves what');
  await expect(
    page.getByText('No gate covers push-main: an agent does it without asking anyone.'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'By person' })).toContainText(
    'Run a migration (not enforced yet)',
  );

  const policy = page.getByRole('region', { name: 'When the asker is an approver' });
  await policy.getByRole('combobox', { name: 'Self-approval' }).selectOption('never');
  await expect(policy).toContainText('never approves their own request');
});
