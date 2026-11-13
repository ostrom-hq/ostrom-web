// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('a member reads what happened, opens the older lines and one repository’s sessions', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Activity');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity');
  const list = page.getByRole('main').getByRole('list');
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button', { name: 'Show older' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Show older' })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Repository' }).fill('acme/web');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText(/requests and workflow changes are left out for acme\/web/)).toBeVisible();

  await page.getByRole('button', { name: 'All repositories' }).click();
  await list.getByRole('link', { name: /asked for a yes: Merge PR #412/ }).click();
  await expect(page).toHaveURL(/\/yes\/apr-merge-412$/);
});
