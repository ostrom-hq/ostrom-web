// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('someone asks for a sign-in link, then opens it and lands on the requests', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
    'href',
    /\/api\/v1\/auth\/github\/start\?redirect=%2F$/,
  );
  await page.getByRole('textbox', { name: 'Your e-mail address' }).fill('maya@acme.dev');
  await page.getByRole('button', { name: 'E-mail me a link' }).click();
  await expect(page.getByRole('alert')).toContainText('If maya@acme.dev may sign in, a link is on its way.');

  // The demo is signed in already: the link says who, and replaces the session only after a yes (login CSRF).
  await page.goto('/auth/email#token=ml_demo');
  await expect(page.getByRole('alert')).toContainText('This link signs it in as the account it was sent to');
  expect(page.url()).not.toContain('ml_demo');
  await page.getByRole('button', { name: 'Sign in with the link' }).click();
  await expect(page).toHaveURL(/\/yes$/);
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  expect(page.url()).not.toContain('ml_demo');
});
