// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('a developer starts a cloud agent, then runs an automation now', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Cloud agents' }).click();
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Bump the SDK');
  await form.getByRole('textbox', { name: 'Name' }).fill('SDK bump');
  await form.getByRole('button', { name: 'Start the agent' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'SDK bump' })).toContainText('Queued');

  await page.getByRole('link', { name: 'Automations' }).click();
  const nightly = page.locator('article').filter({ hasText: 'Nightly dependency upgrades' });
  await nightly.getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByText(/is queued \(run-/)).toBeVisible();
});
