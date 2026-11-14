// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner adds a webhook, copies its secret once, sends a test, and deletes it', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Webhooks');
  await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'https://hooks.acme.dev/ostrom' })).toBeVisible();

  const form = page.getByRole('region', { name: 'Add a webhook' });
  await form.getByRole('textbox', { name: 'URL (https)' }).fill('https://example.com/hook');
  await form.getByRole('textbox', { name: 'Description' }).fill('Everything');
  await form.getByRole('button', { name: 'Add webhook' }).click();
  await expect(page.getByRole('textbox', { name: 'Signing secret' })).toHaveValue(/^whsec_/);
  await page.getByRole('button', { name: 'I copied it' }).click();
  await expect(page.getByRole('textbox', { name: 'Signing secret' })).toHaveCount(0);

  await page.getByRole('link', { name: 'https://example.com/hook' }).first().click();
  await expect(page.getByRole('region', { name: 'State' })).toContainText('Enabled');
  const actions = page.getByRole('region', { name: 'Actions' });
  await actions.getByRole('button', { name: 'Send a test' }).click();
  await expect(actions.getByText(/A test delivery is queued/)).toBeVisible();
  await expect(page.getByRole('table').getByText('webhook.test')).toBeVisible();
  await actions.getByRole('button', { name: 'Delete webhook' }).click();
  await actions.getByRole('button', { name: 'Delete this webhook and its deliveries' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your webhooks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'https://example.com/hook' })).toHaveCount(0);
});

test('a member never sees the link, and the page tells them it is for owners and admins', async ({
  page,
}) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.role', 'member')");
  await page.goto('/webhooks');
  await expect(page.getByText('Owners and admins only')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Add a webhook' })).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Webhooks', exact: true }),
  ).toHaveCount(0);
});

test('the webhooks of another organization never show the first one’s', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/webhooks');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  await expect(page.getByText('No webhooks yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'https://hooks.acme.dev/ostrom' })).toHaveCount(0);
});
