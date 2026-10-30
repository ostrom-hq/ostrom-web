// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('the mock build says its data is a demo and answers the API from the contract', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('Demo data');
  const queue = await page.evaluate(async () => {
    const response = await fetch('/api/v1/approvals?mine=true');
    return (await response.json()) as { items: unknown[] };
  });
  expect(queue.items.length).toBeGreaterThan(0);
});
