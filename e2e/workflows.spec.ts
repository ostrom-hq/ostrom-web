// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('a developer reads how a change goes to production and who approves it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Workflows', exact: true }).click();
  await page.getByRole('link', { name: /Backend changes/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backend changes');
  const steps = page.getByRole('region', { name: 'Steps' });
  await expect(steps.getByRole('listitem').first()).toContainText('A branch is pushed');
  await expect(steps).toContainText('Approved by maya, samir');
  await page.getByRole('link', { name: 'All workflows' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workflows');
});

test('an owner writes a workflow, changes it, and deletes it', async ({ page }) => {
  await page.goto('/workflows');
  await page.getByRole('link', { name: 'New workflow' }).click();
  const form = page.getByRole('form', { name: 'A new workflow' });
  await form.getByLabel('Name').fill('Release train');
  await form.getByLabel('Repository').fill('acme/web');
  await form.getByLabel('Step 1: What it is').fill('A tag is pushed');
  await form.getByRole('button', { name: 'Add a step' }).click();
  await form.getByLabel('What step 2 does').selectOption('Approval');
  await form.getByLabel('Step 2: What it is').fill('Ship it');
  await expect(form).toContainText('Nobody may approve this step');
  await form.getByLabel('Step 2: Who may approve').fill('maya');
  await form.getByRole('button', { name: 'Create the workflow' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Release train');
  await expect(page.getByRole('region', { name: 'Steps' })).toContainText('Approved by maya');

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Step 2: Who may approve').fill('maya, samir');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Steps' })).toContainText('Approved by maya, samir');

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete this workflow' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workflows');
  await expect(page.getByRole('link', { name: /Release train/ })).toHaveCount(0);
});
