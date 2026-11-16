// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin adds a shared overflow reserve and lets a member borrow it', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Capacity');
  await expect(page.getByRole('heading', { level: 1, name: 'Capacity' })).toBeVisible();
  const add = page.getByRole('form', { name: 'Add or update a pool' });
  await add.getByRole('textbox', { name: 'Pool' }).fill('night');
  await add.getByRole('textbox', { name: 'Total daily budget (USD)' }).fill('25');
  await add.getByRole('checkbox', { name: /Shared overflow reserve/ }).check();
  await add.getByRole('button', { name: 'Save pool budget' }).click();
  const night = page.getByRole('form', { name: 'Pool night' });
  await expect(night.getByText('$25.00 a day · No primary members')).toBeVisible();

  const lena = page.getByRole('article', { name: 'Lena Ortiz' });
  await lena.getByRole('checkbox', { name: 'Allow shared overflow accounts' }).check();
  await lena.getByRole('button', { name: 'Save limits' }).click();
  await expect(lena.getByText('Shared pool · shared overflow allowed')).toBeVisible();
});

test('a member reads their own pool, without the budgets', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.role', 'member')");
  await page.goto('/capacity');
  await expect(page.getByText('Pool billing · shared overflow allowed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pool budgets' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save limits' })).toHaveCount(0);
});
