// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin renames the organization and signs another session out', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');

  const general = page.getByRole('region', { name: 'Organization' });
  await general.getByRole('textbox', { name: 'Name' }).fill('Acme Labs');
  await general.getByRole('button', { name: 'Save the name' }).click();
  await expect(general.getByRole('alert')).toContainText('The organization is now called Acme Labs.');
  await expect(page.getByRole('button', { name: 'Organization: Acme Labs. Switch' })).toBeVisible();

  const security = page.getByRole('region', { name: 'Security' });
  const phone = security.getByRole('listitem').filter({ hasText: 'Ostrom on iPhone' });
  await phone.getByRole('button', { name: 'Sign out' }).click();
  await phone.getByRole('button', { name: 'Sign out Ostrom on iPhone' }).click();
  await expect(phone).toHaveCount(0);
  await expect(security.getByRole('listitem').filter({ hasText: 'This browser' })).toBeVisible();

  // Only the owner deletes: an admin is told so, with nothing to press.
  const danger = page.getByRole('region', { name: 'Danger zone' });
  await expect(danger).toContainText('Only the owner can delete the organization.');
  await expect(danger.getByRole('button')).toHaveCount(0);
});

test('the settings of another organization never show the first one’s', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/settings');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  const general = page.getByRole('region', { name: 'Organization' });
  await expect(general.getByRole('textbox', { name: 'Name' })).toHaveValue('Globex');
  await expect(general.getByText('globex', { exact: true })).toBeVisible();
  await expect(general.getByText('acme', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('Acme');
});

test('a person creates a token, copies its secret once, then revokes it', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Tokens');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tokens');

  const form = page.getByRole('region', { name: 'New token' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Nightly CI');
  await form.getByRole('checkbox', { name: 'Receipts: Read' }).check();
  await form.getByRole('combobox', { name: 'Expires' }).selectOption('90');
  await form.getByRole('button', { name: 'Create the token' }).click();
  const secret = form.getByRole('textbox', { name: 'Secret of Nightly CI' });
  await expect(secret).toHaveValue(/^osp_/);
  await form.getByRole('button', { name: 'I copied it' }).click();
  await expect(secret).toHaveCount(0);

  const row = page.getByRole('listitem').filter({ hasText: 'Nightly CI' });
  await expect(row).toContainText('receipts:read');
  await row.getByRole('button', { name: 'Revoke' }).click();
  await row.getByRole('button', { name: 'Revoke Nightly CI' }).click();
  await expect(row).toHaveCount(0);
});
