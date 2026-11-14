// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('the starter hands in what an agent step asked for, and sees the run succeed', async ({ page }) => {
  await page.goto('/runs/run-release-2');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Release notes');
  const form = page.getByRole('form', { name: 'Hand in the result' });
  await form.getByLabel('The address (https)').fill('https://gitlab.com/acme/api/pull/3');
  await form.getByRole('button', { name: 'Hand it in' }).click();
  await expect(form.getByRole('alert')).toContainText('github.com');
  await form.getByLabel('The address (https)').fill('https://github.com/acme/api/pull/3');
  await form.getByRole('button', { name: 'Hand it in' }).click();
  await expect(page.getByRole('region', { name: 'Output' })).toContainText('github.com/acme/api/pull/3');
  await expect(form).toHaveCount(0);
});

test('an owner starts a release run with its inputs and a repository', async ({ page }) => {
  await page.goto('/workflows/wf-release');
  const form = page.getByRole('form', { name: 'Start a run' });
  await expect(form.getByRole('button', { name: 'Run it now' })).toBeDisabled();
  await form.getByLabel('Release tag (required)').fill('v2.0.0');
  await form.getByLabel('Repository (required)').fill('acme/api');
  await form.getByRole('button', { name: 'Run it now' }).click();
  const runs = page.getByRole('region', { name: 'Runs' });
  await expect(runs.getByRole('listitem').first()).toContainText('Queued');
  await runs.getByRole('listitem').first().getByRole('link', { name: 'Details' }).click();
  await expect(page.getByRole('region', { name: 'Inputs' })).toContainText('v2.0.0');
  await page.getByRole('button', { name: 'Cancel the run' }).click();
  await page.getByRole('button', { name: 'Cancel this run' }).click();
  await expect(page.getByText('Cancelled').first()).toBeVisible();
});

test('an admin changes who decides workflows', async ({ page }) => {
  await page.goto('/settings');
  const box = page.getByRole('region', { name: 'Who can decide workflows' });
  await expect(box.getByRole('radio', { name: 'Owners and admins' })).toBeChecked();
  await box.getByRole('radio', { name: 'Every member' }).check();
  await box.getByRole('button', { name: 'Save' }).click();
  await expect(box.getByText('Saved.')).toBeVisible();
});
