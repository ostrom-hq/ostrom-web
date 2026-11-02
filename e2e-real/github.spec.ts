// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, signIn } from './real';

test('an owner reads the GitHub App of a new organization and is sent to install it', async ({ page }) => {
  await signIn(page, freshEmail('gina'));
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `Initech ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
  const org = (created.body as { id: string }).id;
  // `GET /github/app` comes with ostrom-server#44 and #77, and needs an App configured on the server. Asked signed
  // in, so the session filter cannot hide a missing route: until it says the new org has not installed the App, the
  // journey is skipped.
  const app = await callFromPage(page, 'GET', '/api/v1/github/app');
  test.skip(
    app.status !== 200 || (app.body as { installed?: unknown }).installed !== false,
    `GET /api/v1/github/app answers ${app.status.toString()}: not served, or no App configured`,
  );

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
