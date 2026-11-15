// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an admin narrows the models, gives a member their own list, and checks a launch', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Agent policy');
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

test('an admin adds an API price over the built-in ones, then loads Anthropic’s list prices', async ({
  page,
}) => {
  await page.goto('/policy');
  const box = page.getByRole('region', { name: 'API prices' });
  await expect(box.getByText('Built-in prices')).toBeVisible();
  const form = box.getByRole('form', { name: 'Add or replace a price' });
  await form.getByRole('combobox', { name: 'Provider' }).selectOption('openai');
  await form.getByRole('textbox', { name: 'Model or family prefix' }).fill('gpt-5');
  await form.getByRole('textbox', { name: 'Input $ / million tokens' }).fill('1.25');
  await form.getByRole('textbox', { name: 'Output $ / million' }).fill('10');
  await form.getByRole('button', { name: 'Save the price' }).click();
  await expect(box.getByText('gpt-5', { exact: true })).toBeVisible();
  await expect(box.getByText('Built-in prices')).toHaveCount(0);
  // The built-in rows were kept as the organization's own: one removed comes back with the list prices.
  await box.getByRole('button', { name: 'Remove claude-opus-4 from 2026-10-21' }).click();
  await expect(box.getByText('claude-opus-4', { exact: true })).toHaveCount(0);
  await box.getByRole('button', { name: 'Load current Anthropic prices' }).click();
  await expect(box.getByText('claude-opus-4', { exact: true })).toBeVisible();
});
