// SPDX-License-Identifier: Apache-2.0
import { expect, type Page, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization, served } from './real';

test.afterEach(closeOthers);

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

test('an owner edits the API price table: a dated row of its own over the list prices, the list loaded again, a row removed, and another organization keeps the built-in prices', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'pablo');
  const capabilities = await callFromPage(page, 'GET', '/api/v1/capabilities');
  test.skip(
    !(capabilities.body as { features: string[] }).features.includes('capacity.apiprices.v1'),
    'the server does not serve the API prices yet',
  );
  interface Table {
    readonly prices: { readonly provider: string; readonly model: string; readonly effectiveFrom: string }[];
    readonly defaults?: boolean;
  }
  const read = async (on: Page, as?: string): Promise<Table> => {
    const answer = await callFromPage(on, 'GET', '/api/v1/policy/api-prices', undefined, as);
    expect(answer.status).toBe(200);
    return answer.body as Table;
  };
  expect((await read(page)).defaults).toBe(true);

  await page.goto('/policy');
  const box = page.getByRole('region', { name: 'API prices' });
  await expect(box.getByText('Built-in prices')).toBeVisible();
  const form = box.getByRole('form', { name: 'Add or replace a price' });
  await form.getByRole('textbox', { name: 'Model or family prefix' }).fill('claude-test-9');
  await form.getByLabel('Effective from (UTC)').fill('2026-11-01');
  await form.getByRole('textbox', { name: 'Input $ / million tokens' }).fill('2');
  await form.getByRole('textbox', { name: 'Cache read $ / million' }).fill('0.2');
  await form.getByRole('textbox', { name: 'Output $ / million' }).fill('8');
  await form.getByRole('button', { name: 'Save the price' }).click();
  await expect(box.getByRole('cell', { name: 'claude-test-9', exact: true })).toBeVisible();
  await expect(box.getByText('Built-in prices')).toHaveCount(0);
  const own = await read(page);
  expect(own.defaults).not.toBe(true);
  // The built-in rows shown are kept as the organization's own, with the new one.
  expect(own.prices.length).toBeGreaterThan(1);
  expect(own.prices).toContainEqual(
    expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-test-9',
      effectiveFrom: '2026-11-01',
      outputMicros: 8_000_000,
    }),
  );

  // Loading again changes nothing: every list price is there already.
  await box.getByRole('button', { name: 'Load current Anthropic prices' }).click();
  await expect.poll(async () => (await read(page)).prices.length).toBe(own.prices.length);
  await box.getByRole('button', { name: 'Remove claude-test-9 from 2026-11-01' }).click();
  await expect(box.getByRole('cell', { name: 'claude-test-9', exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await read(page)).prices.some((row) => row.model === 'claude-test-9'))
    .toBe(false);

  // Another organization still reads the built-in prices, and cannot name this one.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'paz');
  expect((await read(stranger)).defaults).toBe(true);
  expect((await callFromPage(stranger, 'GET', '/api/v1/policy/api-prices', undefined, org.id)).status).toBe(
    404,
  );
});
