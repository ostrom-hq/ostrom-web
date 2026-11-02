// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('from an ended session to its receipt, verified by the server and ready to check offline', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sessions' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sessions');

  await page.getByRole('link', { name: /acme\/web/ }).click();
  await expect(page).toHaveURL(/\/sessions\/ses-2b9e$/);
  await page.getByRole('link', { name: 'Open receipt rcpt-ses-2b9e' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Session ses-2b9e');
  await expect(page.getByRole('region', { name: 'Signature' })).toContainText('Signature verified');
  // A check says where it ran; the workstation's word is never shown as proven.
  const steps = page.getByRole('region', { name: 'Workflow steps' });
  await expect(steps.getByRole('listitem').filter({ hasText: 'Tests pass' })).toContainText(
    'Declared by the workstation',
  );
  await expect(steps.getByRole('listitem').filter({ hasText: 'Lint' })).toContainText('Run in CI');
  await expect(page.getByText('ostrom verify rcpt-ses-2b9e')).toBeVisible();
});

test('a receipt whose signature matches no key says so', async ({ page }) => {
  await page.goto('/receipts');
  await page.getByRole('link', { name: /wf-backend/ }).click();
  await expect(page.getByRole('alert')).toContainText('Does not verify');
});
