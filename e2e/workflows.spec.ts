// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('a developer reads how a change goes to production and who approves it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Workflows' }).click();
  await page.getByRole('link', { name: /Backend changes/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backend changes');
  const steps = page.getByRole('region', { name: 'Steps' });
  await expect(steps.getByRole('listitem').first()).toContainText('A branch is pushed');
  await expect(steps).toContainText('Approved by maya, samir');
  await page.getByRole('link', { name: 'All workflows' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workflows');
});
