// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

/** A value nobody else writes: the journeys look for it where it must never show. */
function valueOfASecret(): string {
  return `sk-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

test('an owner writes a secret, never reads its value back, replaces it and removes it; another organization sees none of it', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'ines');
  await page.goto('/secrets');
  await expect(page.getByRole('heading', { level: 1, name: 'Secrets' })).toBeVisible();
  await expect(page.getByText('No secret yet.')).toBeVisible();

  const value = valueOfASecret();
  const add = page.getByRole('region', { name: 'Add a secret' });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('NOTION_KEY');
  await add.getByLabel('Value').fill(value);
  await add.getByRole('button', { name: 'Save the secret' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'NOTION_KEY' });
  await expect(row).toContainText('Not used yet');
  await expect(page.getByText(value)).toHaveCount(0);

  // The server keeps the name, a version and who changed it, never the value.
  const listed = await callFromPage(page, 'GET', '/api/v1/secrets');
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body)).not.toContain(value);
  const secrets = (listed.body as { items: { name: string; version: number }[] }).items;
  expect(secrets).toEqual([expect.objectContaining({ name: 'NOTION_KEY' })]);
  const version = secrets[0]?.version ?? 0;

  // A new value: a new version, still unread.
  const next = valueOfASecret();
  await row.getByRole('button', { name: 'Replace the value' }).click();
  await row.getByLabel('New value of NOTION_KEY').fill(next);
  await row.getByRole('button', { name: 'Save the value' }).click();
  await expect(row.getByLabel('New value of NOTION_KEY')).toHaveCount(0);
  await expect(page.getByText(next)).toHaveCount(0);
  const replaced = await callFromPage(page, 'GET', '/api/v1/secrets');
  expect(JSON.stringify(replaced.body)).not.toContain(next);
  const [after] = (replaced.body as { items: { name: string; version: number }[] }).items;
  expect(after?.version).toBeGreaterThan(version);

  // Another organization: nothing on screen, and naming the first one opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'jona');
  await stranger.goto('/secrets');
  await expect(stranger.getByText('No secret yet.')).toBeVisible();
  await expect(stranger.getByText('NOTION_KEY')).toHaveCount(0);
  expect((await callFromPage(stranger, 'GET', '/api/v1/secrets', undefined, org.id)).status).toBe(404);
  expect(
    (await callFromPage(stranger, 'DELETE', '/api/v1/secrets/NOTION_KEY', undefined, org.id)).status,
  ).toBe(404);

  // Removed, on screen and on the server.
  await row.getByRole('button', { name: 'Remove', exact: true }).click();
  await row.getByRole('button', { name: 'Remove NOTION_KEY' }).click();
  await expect(page.getByText('No secret yet.')).toBeVisible();
  const gone = await callFromPage(page, 'GET', '/api/v1/secrets');
  expect((gone.body as { items: unknown[] }).items).toEqual([]);
});

test('an owner finds the organization’s members to lend a subscription to, and the secrets it can use', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'kira');
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'liam', 'member');
  const login = ((await callFromPage(member, 'GET', '/api/v1/auth/me')).body as { dev: { login: string } })
    .dev.login;
  expect(
    (
      await callFromPage(page, 'POST', '/api/v1/secrets', {
        name: 'CLAUDE_MAX_TOKEN',
        value: valueOfASecret(),
      })
    ).status,
  ).toBe(201);

  await page.goto('/accounts');
  await expect(page.getByRole('heading', { level: 1, name: 'Shared subscriptions' })).toBeVisible();
  await expect(page.getByText('No shared subscription yet.')).toBeVisible();
  // The people come from the organization's served members route, the owner left out; the credential from its secrets.
  const form = page.getByRole('region', { name: 'Share a subscription' });
  await expect(form.getByRole('group', { name: 'Lend it to' }).getByRole('checkbox')).toHaveCount(1);
  await expect(form.getByRole('checkbox', { name: login, exact: true })).toBeVisible();
  await expect(form.getByRole('combobox', { name: 'Credential' }).getByRole('option')).toHaveText([
    'Pick a secret',
    'CLAUDE_MAX_TOKEN',
  ]);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('an owner lends a subscription to a member from a secret, pauses it and stops sharing it; another organization sees none of it', async ({
  page,
  browser,
}) => {
  // Since ostrom-server#201, POST /api/v1/accounts reads the contract's body: credentialSecret, sharedWith and
  // dailyAllocationUsd.
  const org = await ownerOfNewOrganization(page, 'kira');
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'liam', 'member');
  const login = ((await callFromPage(member, 'GET', '/api/v1/auth/me')).body as { dev: { login: string } })
    .dev.login;

  // A subscription's token is a secret first.
  const value = valueOfASecret();
  expect(
    (await callFromPage(page, 'POST', '/api/v1/secrets', { name: 'CLAUDE_MAX_TOKEN', value })).status,
  ).toBe(201);

  await page.goto('/accounts');
  await expect(page.getByRole('heading', { level: 1, name: 'Shared subscriptions' })).toBeVisible();
  await expect(page.getByText('No shared subscription yet.')).toBeVisible();
  const form = page.getByRole('region', { name: 'Share a subscription' });
  await form.getByRole('combobox', { name: 'Provider' }).selectOption('anthropic');
  await form.getByRole('textbox', { name: 'Name' }).fill('Kira’s Claude Max');
  await form.getByRole('combobox', { name: 'Credential' }).selectOption('CLAUDE_MAX_TOKEN');
  await form.getByRole('textbox', { name: 'Daily share in USD (optional)' }).fill('25');
  await form.getByRole('checkbox', { name: login, exact: true }).check();
  await form.getByRole('button', { name: 'Share' }).click();

  const card = page.getByRole('article', { name: 'Kira’s Claude Max' });
  await expect(card).toContainText('$25.00 a day');
  await expect(card).toContainText(`Lent to ${login}`);
  await expect(page.getByText(value)).toHaveCount(0);
  const listed = await callFromPage(page, 'GET', '/api/v1/accounts');
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body)).not.toContain(value);
  const accounts = (listed.body as { items: { id: string; label: string; sharedWith: string[] }[] }).items;
  expect(accounts).toEqual([
    expect.objectContaining({ label: 'Kira’s Claude Max', provider: 'anthropic', sharedWith: [login] }),
  ]);
  const id = accounts[0]?.id ?? '';

  // Paused, then resumed: the server says so each time.
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(card).toContainText('Paused');
  const paused = await callFromPage(page, 'GET', '/api/v1/accounts');
  expect((paused.body as { items: { paused: boolean }[] }).items[0]?.paused).toBe(true);
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(card.getByRole('button', { name: 'Pause' })).toBeVisible();

  // Another organization: nothing on screen, and naming the first one opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'milo');
  await stranger.goto('/accounts');
  await expect(stranger.getByText('No shared subscription yet.')).toBeVisible();
  expect((await callFromPage(stranger, 'GET', '/api/v1/accounts', undefined, org.id)).status).toBe(404);
  expect((await callFromPage(stranger, 'DELETE', `/api/v1/accounts/${id}`, undefined, org.id)).status).toBe(
    404,
  );

  // Stopped: the card and the account are gone.
  await card.getByRole('button', { name: 'Stop sharing', exact: true }).click();
  await card
    .getByRole('button', { name: 'Stop sharing Kira’s Claude Max and delete its credential' })
    .click();
  await expect(page.getByText('No shared subscription yet.')).toBeVisible();
  const gone = await callFromPage(page, 'GET', '/api/v1/accounts');
  expect((gone.body as { items: unknown[] }).items).toEqual([]);
});
