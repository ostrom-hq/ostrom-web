// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('a developer starts a cloud agent, then runs an automation now', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Cloud agents');
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Bump the SDK');
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('SDK bump');
  await form.getByRole('button', { name: 'Start the agent' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'SDK bump' })).toContainText('Queued');

  await openScreen(page, 'Automations');
  const nightly = page.locator('article').filter({ hasText: 'Nightly dependency upgrades' });
  await nightly.getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByText(/is queued \(run-/)).toBeVisible();
});
