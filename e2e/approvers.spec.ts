// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin reads who approves what and stops the asker from approving', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Approvers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who approves what');
  await expect(
    page.getByText('No gate covers push-main: an agent does it without asking anyone.'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'By person' })).toContainText(
    'Run a migration (not enforced yet)',
  );

  const policy = page.getByRole('region', { name: 'When the asker is an approver' });
  // Never by default (S2-15): the organization may let a sole approver approve their own request.
  await expect(policy).toContainText('never approves their own request');
  await policy.getByRole('combobox', { name: 'Self-approval' }).selectOption('sole-approver');
  await expect(policy).toContainText('only when nobody else can');
});
