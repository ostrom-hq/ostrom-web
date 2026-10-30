// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an owner reviews the rules and finds the signed decision', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rules');

  const review = page.locator('article').filter({ hasText: 'one review from an owner' });
  await review.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('button', { name: 'To review 1' })).toBeVisible();

  await page.getByRole('link', { name: 'Decisions' }).click();
  const latest = page.getByRole('link', { name: /maya accepted the rule/ });
  await expect(latest).toBeVisible();
  await latest.click();
  await expect(page).toHaveURL(/\/receipts\/rcpt-dec-/);
});
