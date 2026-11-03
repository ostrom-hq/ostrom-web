// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { openScreen } from './navigation';

/** A list that fits the screen: nothing scrolls sideways, on a phone as on a wide screen. */
async function fitsTheScreen(page: Page): Promise<void> {
  const overflow: unknown = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('an owner reads the runs of every workflow, opens one, and runs it', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Runs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Runs');
  const all = page.getByRole('main').getByRole('listitem');
  await expect(all).toHaveCount(4);
  await expect(all.first()).toContainText('Running');
  await expect(all.nth(1)).toContainText('Cancelled');
  await fitsTheScreen(page);

  await all.first().getByRole('link', { name: 'Backend changes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backend changes');
  const runs = page.getByRole('region', { name: 'Runs' });
  await expect(runs.getByRole('listitem')).toHaveCount(3);
  await expect(runs.getByRole('listitem').nth(2)).toContainText('Tests fail on main');
  await fitsTheScreen(page);

  await runs.getByRole('button', { name: 'Run it now' }).click();
  await expect(runs.getByRole('listitem')).toHaveCount(4);
  await expect(runs.getByRole('listitem').first()).toContainText('Queued');
  await expect(runs.getByRole('listitem').first()).toContainText('Started by maya · by hand');

  // The run under way leads to the session it works in.
  await runs.getByRole('listitem').nth(1).getByRole('link', { name: 'Its session' }).click();
  await expect(page).toHaveURL(/\/sessions\/ses-7f3a$/);
});
