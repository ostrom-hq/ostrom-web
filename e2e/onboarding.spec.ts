// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('a new account creates its organization and lands on the setup guide', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'none')");
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your organization');
  await page.getByRole('textbox', { name: 'Organization name' }).fill('Wayne Enterprises');
  await expect(page.getByText('Short name: wayne-enterprises')).toBeVisible();
  await page.getByRole('button', { name: 'Create the organization' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wayne Enterprises');
  const guide = page.getByRole('region', { name: 'Set up' });
  await expect(guide.getByText('1 of 6 done')).toBeVisible();
  await expect(guide.getByRole('listitem').filter({ hasText: 'Connect GitHub' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(guide.getByRole('textbox', { name: 'Sign in command' })).toHaveValue(
    /^ostrom login --server http:\/\/localhost:\d+$/,
  );

  await guide.getByRole('button', { name: 'Hide the guide' }).click();
  await page.getByRole('button', { name: 'Show the setup guide' }).click();
  await expect(guide.getByText('1 of 6 done')).toBeVisible();
});

test('an invitation link shows where it leads, without its secret in the address, then joins', async ({
  page,
}) => {
  await page.goto('/invite#token=inv_demo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join Initech');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByText('You are invited as Approver.')).toBeVisible();
  await page.getByRole('button', { name: 'Join Initech' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Initech');
});

test('a dead invitation says so', async ({ page }) => {
  await page.goto('/invite#token=inv_gone');
  await expect(page.getByText('This invitation no longer works')).toBeVisible();
});
