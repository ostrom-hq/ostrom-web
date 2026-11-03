// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin invites by e-mail, makes an invitation link and gives someone the approver role', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Members');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acme');
  await expect(page.getByText('5 people · you are Admin')).toBeVisible();

  const invite = page.getByRole('region', { name: 'Invite people' });
  await invite.getByRole('textbox', { name: 'E-mail addresses' }).fill('ana@acme.dev');
  await invite.getByRole('button', { name: 'Send 1 invitation' }).click();
  await expect(invite.getByRole('alert')).toContainText('Invitation sent to ana@acme.dev.');
  await expect(page.getByRole('listitem').filter({ hasText: 'ana@acme.dev' })).toContainText('Member');

  const link = page.getByRole('region', { name: 'Invitation link' });
  await link.getByRole('button', { name: 'Create a link' }).click();
  await expect(link.getByLabel('Invitation link', { exact: true })).toHaveValue(/\/invite#token=/);

  const role = page.getByRole('combobox', { name: 'Role of theo' });
  await role.selectOption('approver');
  await expect(role).toHaveValue('approver');
});
