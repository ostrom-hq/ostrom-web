// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { callFromPage, ownerOfNewOrganization, served } from './real';

/**
 * Skips the journey while the server does not serve the policy. A new organization's has no `default` (ostrom-server
 * `ModelPolicyDto.defaultModel` is nullable while the contract requires it): the console reads it as no default.
 */
async function skipUnlessServed(page: Page): Promise<void> {
  const policy = await callFromPage(page, 'GET', '/api/v1/policy/models');
  test.skip(
    policy.status !== 200,
    `GET /api/v1/policy/models answers ${policy.status.toString()}: not served yet`,
  );
}

test('an owner sets the models, names a key, and asks whether a launch would pass', async ({ page }) => {
  // `GET /policy/agents` is served since ostrom-server#84: a probe that fails is a broken server, never a skip.
  expect(await served(page, 'GET', '/api/v1/policy/agents')).toBe(true);
  await ownerOfNewOrganization(page, 'pia');
  await skipUnlessServed(page);
  await page.goto('/policy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agent policy');

  const models = page.getByRole('region', { name: 'Models' });
  await models.getByRole('button', { name: 'Change' }).click();
  await models.getByRole('textbox', { name: 'Allowed models' }).fill('claude-, gpt-5');
  await models.getByRole('textbox', { name: 'Default model' }).fill('claude-sonnet-4-5');
  await models.getByRole('button', { name: 'Save' }).click();
  await expect(models.getByText('Models saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Models' }).getByText('claude-, gpt-5')).toBeVisible();

  const keys = page.getByRole('region', { name: 'Provider keys' });
  await keys.getByRole('checkbox', { name: /shared subscriptions serve before/ }).uncheck();
  await keys.getByRole('button', { name: 'Save' }).click();
  await expect(keys.getByText('Provider keys saved.')).toBeVisible();

  const check = page.getByRole('region', { name: 'Would a launch pass?' });
  await check.getByRole('textbox', { name: 'Model' }).fill('claude-sonnet-4-5');
  await check.getByRole('button', { name: 'Ask' }).click();
  await expect(check.getByText('You may launch claude with claude-sonnet-4-5.')).toBeVisible();
  await check.getByRole('combobox', { name: 'Agent' }).fill('Claude Code');
  await check.getByRole('button', { name: 'Ask' }).click();
  await expect(check.getByText('The agent name is not valid.')).toBeVisible();
});

test('another organization never sees the first one’s models or keys', async ({ page }) => {
  expect(await served(page, 'GET', '/api/v1/policy/agents')).toBe(true);
  const ada = await ownerOfNewOrganization(page, 'ada');
  await skipUnlessServed(page);
  const set = await callFromPage(page, 'PUT', '/api/v1/policy/models', {
    allowed: ['claude-'],
    default: 'claude-opus-4-1',
  });
  expect(set.status).toBe(200);

  // Someone else, in their own organization: none of it shows, and naming the first one opens nothing.
  await ownerOfNewOrganization(page, 'bea');
  await page.goto('/policy');
  const models = page.getByRole('region', { name: 'Models' });
  await expect(models.getByText('Every model', { exact: true })).toBeVisible();
  await expect(models.getByText('claude-opus-4-1')).toHaveCount(0);
  for (const [method, path, body] of [
    ['GET', '/api/v1/policy/models', undefined],
    ['PUT', '/api/v1/policy/models', { allowed: [], default: 'x' }],
    ['GET', '/api/v1/inference/settings', undefined],
    ['GET', '/api/v1/policy/agents?agent=claude', undefined],
  ] as const) {
    const status = (await callFromPage(page, method, path, body, ada.id)).status;
    expect([403, 404], `${method} ${path}`).toContain(status);
  }
});
