// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an administrator of the instance adds an administrator, then configures a section with a secret', async ({
  page,
}) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.instanceAdmin', 'yes')");
  await page.goto('/');
  await openScreen(page, 'Admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administrators');

  const add = page.getByRole('region', { name: 'Add an administrator' });
  await add.getByRole('textbox', { name: 'Verified e-mail address' }).fill('sam@acme.test');
  await add.getByRole('button', { name: 'Make administrator' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'sam' })).toContainText('Added in the console');

  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Instance settings');
  const mail = page.getByRole('region', { name: 'mail' });
  await mail.getByRole('textbox', { name: /^host/ }).fill('mx.acme.test');
  await mail.getByLabel(/^password/).selectOption('Replace');
  await mail.getByPlaceholder('New value of password').fill('s3cret');
  await mail.getByRole('button', { name: 'Save' }).click();
  await expect(mail.getByText('The mail settings are saved.')).toBeVisible();
  // The secret is never shown again: only that it is set.
  await expect(page.getByText('s3cret')).toHaveCount(0);
  await expect(mail.getByText('Set', { exact: true })).toBeVisible();
});

test('anyone else has no Admin entry, and the address says why there is nothing to see', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Neither the bar nor, on a phone, its menu offers Admin.
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByText('Only a person who administers this instance sees this page.')).toBeVisible();
});
