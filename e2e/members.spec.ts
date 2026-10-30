// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an admin invites people and gives someone the approver role', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Members' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acme');

  const invite = page.getByRole('region', { name: 'Invite people' });
  await invite.getByRole('textbox', { name: 'GitHub logins' }).fill('ana');
  await invite.getByRole('button', { name: 'Send 1 invitation' }).click();
  await expect(invite.getByRole('alert')).toContainText('Invitation sent to ana.');

  const role = page.getByRole('combobox', { name: 'Role of theo' });
  await role.selectOption('approver');
  await expect(role).toHaveValue('approver');
  await expect(
    page.getByRole('listitem').filter({ has: page.getByText('ana', { exact: true }) }),
  ).toContainText('Invited');
});
