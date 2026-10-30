import { expect, test } from '@playwright/test';

test('the mock build says its data is a demo and answers the API from the contract', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('Demo data');
  const queue = await page.evaluate(async () => {
    const response = await fetch('/api/yes/queue');
    return (await response.json()) as { pending: unknown[] };
  });
  expect(queue.pending.length).toBeGreaterThan(0);
});
