// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('an administrator creates a variant, assigns it and never sees a value', async ({ page }) => {
  await page.goto('/environment');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Environment variables');
  const create = page.getByRole('region', { name: 'Create a variant' });
  await create.getByLabel('Variable name').fill('LINEAR_KEY');
  await create.getByLabel('Variant name').fill('acme');
  await create.getByLabel('Value', { exact: true }).fill('lin_api_demo_value');
  await create.getByRole('button', { name: 'Create variant' }).click();
  const variants = page.getByRole('list', { name: 'Team variants' });
  await expect(variants.getByRole('listitem').filter({ hasText: 'LINEAR_KEY' })).toContainText(
    'shared value stored',
  );

  const assign = page.getByRole('region', { name: 'Assign a variant' });
  await assign.getByLabel('Member', { exact: true }).selectOption({ label: 'theo' });
  await assign.getByLabel('Variant').selectOption({ label: 'LINEAR_KEY: acme (shared)' });
  await assign.getByRole('button', { name: 'Assign' }).click();
  await expect(
    page.getByRole('list', { name: 'Effective assignments' }).getByRole('listitem', { name: 'theo' }),
  ).toContainText('LINEAR_KEY → acme');
  await expect(page.getByText('lin_api_demo_value')).toHaveCount(0);
});

test('a person adds a value of their own and sees what their agents receive, by name', async ({ page }) => {
  await page.goto('/me/environment');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My environment');
  const create = page.getByRole('region', { name: 'Add a value of your own' });
  await create.getByLabel('Variable name').fill('LINEAR_KEY');
  await create.getByLabel('Variant name').fill('mine');
  await create.getByLabel('Value', { exact: true }).fill('lin_api_mine_value');
  await create.getByRole('button', { name: 'Create variant' }).click();
  await expect(page.getByRole('list', { name: 'What your agents receive' })).toContainText('LINEAR_KEY');
  await expect(page.getByText('lin_api_mine_value')).toHaveCount(0);
});

test('a person declares an MCP server of their own', async ({ page }) => {
  await page.goto('/me/mcp');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My MCP servers');
  const form = page.getByRole('region', { name: 'Add a server' });
  await form.getByLabel('Name').fill('my-tracker');
  await form.getByLabel('URL').fill('https://mcp.tracker.dev/mcp');
  await form.getByRole('button', { name: 'Add the server' }).click();
  await expect(page.getByRole('article', { name: 'my-tracker' })).toBeVisible();
});
