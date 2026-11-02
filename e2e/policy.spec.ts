// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an admin narrows the models, gives a member their own list, and checks a launch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Agent policy' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agent policy');

  const models = page.getByRole('region', { name: 'Models' });
  await expect(models.getByText('Only for theo')).toBeVisible();
  await models.getByRole('button', { name: 'Change' }).click();
  await models.getByRole('textbox', { name: 'Allowed models' }).fill('claude-');
  await models.getByRole('button', { name: 'Add a member' }).click();
  await models.getByRole('combobox', { name: 'Member 2' }).selectOption({ label: 'lena' });
  await models.getByRole('textbox', { name: 'Models of member 2' }).fill('claude-, gpt-5');
  await models.getByRole('button', { name: 'Save' }).click();
  await expect(models.getByText('Models saved.')).toBeVisible();
  await expect(models.getByText('Only for lena')).toBeVisible();

  const keys = page.getByRole('region', { name: 'Provider keys' });
  await expect(keys.getByRole('combobox', { name: 'Anthropic key' })).toHaveValue('ANTHROPIC_API_KEY');

  const check = page.getByRole('region', { name: 'Would a launch pass?' });
  await check.getByRole('textbox', { name: 'Model' }).fill('gpt-5');
  await check.getByRole('button', { name: 'Ask' }).click();
  await expect(check.getByText('The organization does not allow gpt-5.')).toBeVisible();
  await check.getByRole('textbox', { name: 'Model' }).fill('claude-opus-4-1');
  await check.getByRole('button', { name: 'Ask' }).click();
  await expect(check.getByText('You may launch claude with claude-opus-4-1.')).toBeVisible();
});
