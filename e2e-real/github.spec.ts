// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

test('an owner reads the GitHub App of a new organization and is sent to install it', async ({ page }) => {
  // `GET /github/app` comes with ostrom-server#44 and #77: until it is on main, the journey is skipped.
  test.skip(!(await served(page, 'GET', '/api/v1/github/app')), 'GET /api/v1/github/app not served yet');
  await signIn(page, freshEmail('gina'));
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `Initech ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
  const org = (created.body as { id: string }).id;

  // Back from GitHub with an error: the banner speaks from the type only, and the address is cleaned.
  await page.goto('/github?error=denied');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('GitHub');
  await expect(page.getByText('The installation was cancelled on GitHub.')).toBeVisible();
  await expect(page).toHaveURL(/\/github$/);

  // A new organization has not installed the app: its owner is sent to GitHub through the server, for this org.
  await expect(page.getByText('Not installed', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Install on GitHub' })).toHaveAttribute(
    'href',
    new RegExp(`/api/v1/github/app/install/start\\?org=${org}$`),
  );
  await expect(page.getByRole('heading', { name: 'Governed repositories' })).toHaveCount(0);
});
