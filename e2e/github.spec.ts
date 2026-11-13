// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin reads the governed repositories, analyses them and opens the proposed rules', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'GitHub');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('GitHub');
  await expect(page.getByText('Installed', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choose repositories on GitHub' })).toHaveAttribute(
    'href',
    /\/api\/v1\/github\/app\/install\/start\?org=/,
  );
  const repos = page.getByRole('list', { name: 'Governed repositories' });
  await expect(repos.getByRole('listitem')).toHaveCount(6);
  await page.getByRole('searchbox', { name: 'Find a repository' }).fill('billing');
  await expect(repos.getByRole('listitem')).toHaveCount(2);

  const analysis = page.getByRole('region', { name: 'Rules from your repositories' });
  await analysis.getByRole('button', { name: 'Analyse the repositories' }).click();
  await expect(analysis.getByText('Reading the repositories…')).toBeVisible();
  await expect(analysis.getByRole('link', { name: 'Review the rules' })).toBeVisible({ timeout: 15_000 });
  await analysis.getByRole('link', { name: 'Review the rules' }).click();
  await expect(page).toHaveURL(/\/rules$/);
});

test('coming back from GitHub says the app is installed and cleans the address', async ({ page }) => {
  await page.goto('/github?installed=1');
  await expect(page.getByText('The GitHub App is installed. Its repositories show below.')).toBeVisible();
  await expect(page).toHaveURL(/\/github$/);
});

test('another organization never shows Acme’s repositories', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/github');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  await expect(page.getByText('Not installed', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Governed repositories' })).toHaveCount(0);
  await expect(page.getByText('The billing and accounts API')).toHaveCount(0);
});
