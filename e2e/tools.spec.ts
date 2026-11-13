// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner adds a secret, then an MCP server that uses it', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Secrets');
  const secret = page.getByRole('region', { name: 'Add a secret' });
  await secret.getByRole('textbox', { name: 'Name', exact: true }).fill('NOTION_KEY');
  await secret.getByLabel('Value').fill('s3cret');
  await secret.getByRole('button', { name: 'Save the secret' }).click();
  await expect(page.getByText('NOTION_KEY')).toBeVisible();
  await expect(page.getByText('s3cret')).toHaveCount(0);

  await openScreen(page, 'MCP');
  const form = page.getByRole('region', { name: 'Add a server' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('notion');
  await form.getByRole('textbox', { name: 'URL' }).fill('https://mcp.notion.com/mcp');
  await form.getByRole('textbox', { name: /Secrets it needs/ }).fill('NOTION_KEY');
  await form.getByRole('button', { name: 'Add the server' }).click();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'notion' }) });
  await expect(card).toContainText('Uses NOTION_KEY');
  await expect(card).not.toContainText('Missing');
});
