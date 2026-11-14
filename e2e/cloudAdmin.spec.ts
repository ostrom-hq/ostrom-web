// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('an administrator saves the organization settings, a profile and a cluster', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.instanceAdmin', 'yes')");
  await page.goto('/cloud/admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cloud administration');

  const settings = page.getByRole('region', { name: 'Organization settings' });
  const minutes = settings.getByLabel(/^Background work/);
  await minutes.fill('30');
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(settings.getByText('The organization’s cloud settings are saved.')).toBeVisible();

  const profiles = page.getByRole('region', { name: 'Profiles' });
  await profiles.getByRole('button', { name: 'Edit default' }).click();
  const profile = page.getByRole('form', { name: 'default' });
  await profile.getByLabel('Session image').fill('ghcr.io/acme/session:2');
  await profile.getByRole('button', { name: 'Save' }).click();
  await expect(profiles.getByText('Version 3')).toBeVisible();

  const clusters = page.getByRole('region', { name: 'Clusters' });
  await expect(clusters.getByText('CA bundle set')).toBeVisible();
  // A secret is never read back: the page says only that it is set.
  await expect(page.getByText('BEGIN CERTIFICATE')).toHaveCount(0);
});
