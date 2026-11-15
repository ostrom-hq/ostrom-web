// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner shares an artifact with a member, then lends a subscription', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Artifacts');
  const study = page.locator('article').filter({ hasText: 'Billing API: latency study' });
  await study.getByRole('button', { name: 'Versions and readers' }).click();
  await study.getByRole('combobox', { name: 'Add a reader' }).selectOption({ label: 'Samir Haddad (samir)' });
  await study.getByRole('button', { name: 'Share' }).click();
  await expect(study.getByRole('button', { name: 'Stop sharing with samir' })).toBeVisible();

  await openScreen(page, 'Shared subscriptions');
  const form = page.getByRole('region', { name: 'Share a subscription' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Team Pro');
  await form.getByRole('combobox', { name: 'Credential' }).selectOption('LINEAR_TOKEN');
  await form.getByRole('textbox', { name: 'Daily share in USD (optional)' }).fill('25');
  await form.getByRole('checkbox', { name: 'theo' }).check();
  await form.getByRole('button', { name: 'Share' }).click();
  const lent = page.locator('article').filter({ hasText: 'Team Pro' });
  await expect(lent).toContainText('$25.00 a day');
  await expect(lent).toContainText('Lent to theo');
});

test('a reader opens an artifact’s page, framed and sandboxed, and its owner pins an older version', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Artifacts');
  await page.getByRole('link', { name: 'Billing API: latency study' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Billing API: latency study' })).toBeVisible();
  const frame = page.locator('iframe[title="Billing API: latency study"]');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  await expect(frame).toHaveAttribute('src', /\/a\/art-7\/t3\/index\.html$/);
  await page.getByText('Versions', { exact: true }).click();
  await page.getByRole('link', { name: /^Version 1 / }).click();
  await expect(frame).toHaveAttribute('src', /\/a\/art-7\/t1\/index\.html$/);
  await expect(page.getByRole('link', { name: 'the latest is version 3' })).toBeVisible();
});

test('an admin hands an imported subscription over once TeamCode no longer renews it', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Shared subscriptions');
  await expect(page.getByText('1 imported subscription lends nothing until it is handed over')).toBeVisible();
  const imported = page.locator('article').filter({ hasText: 'Team Max (TeamCode)' });
  await expect(imported).toContainText('Waiting for its handover');
  const handover = imported.getByRole('button', { name: 'Hand over Team Max (TeamCode)' });
  await expect(handover).toBeDisabled();
  await imported
    .getByRole('checkbox', { name: 'TeamCode, or any other tool, no longer renews its tokens' })
    .check();
  await handover.click();
  await expect(imported).toContainText('Active');
  await expect(page.getByText('imported subscription lends nothing')).toHaveCount(0);
});
