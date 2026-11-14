// SPDX-License-Identifier: Apache-2.0
// The environment variants page against the real server (ostrom-server#398): an owner creates a shared variant,
// assigns it to themself and excludes a member, the value never shows anywhere; a member sees the page is not theirs,
// and another organization never sees any of it.
import { expect, test } from '@playwright/test';
import { zEnvironmentAssignmentsPage, zEnvironmentVariantsPage } from '../gen/api/zod.gen';
import {
  anotherPerson,
  callFromPage,
  closeOthers,
  joinAs,
  ownerOfNewOrganization,
  served,
  shown,
} from './real';

test.afterEach(closeOthers);

function valueOfAVariant(): string {
  return `env-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

test('an owner creates, assigns and excludes; the value never shows; a member and another organization see nothing', async ({
  page,
  browser,
}) => {
  expect(await served(page, 'GET', '/api/v1/environment/variants')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'vera');
  const member = await anotherPerson(browser);
  await joinAs(page, org, member, 'wim', 'member');

  await page.goto('/environment');
  await expect(page.getByRole('heading', { level: 1, name: 'Environment variables' })).toBeVisible();
  await expect(page.getByText('No variants yet.')).toBeVisible();
  const value = valueOfAVariant();
  const create = page.getByRole('region', { name: 'Create a variant' });
  await create.getByLabel('Variable name').fill('E2E_TOKEN');
  await create.getByLabel('Variant name').fill('acme');
  await create.getByLabel('Value', { exact: true }).fill(value);
  await create.getByRole('button', { name: 'Create variant' }).click();
  const variants = page.getByRole('list', { name: 'Team variants' });
  await expect(variants.getByRole('listitem').filter({ hasText: 'E2E_TOKEN' })).toContainText(
    'shared value stored',
  );

  // Nobody receives it until it is assigned: the owner picks it for themself.
  const assign = page.getByRole('region', { name: 'Assign a variant' });
  const ownerOption = assign
    .getByLabel('Member', { exact: true })
    .locator('option')
    .filter({ hasNotText: 'wim' });
  await assign
    .getByLabel('Member', { exact: true })
    .selectOption((await ownerOption.getAttribute('value')) ?? '');
  await assign.getByRole('button', { name: 'Assign' }).click();
  const assignments = page.getByRole('list', { name: 'Effective assignments' });
  await expect(assignments.getByText(/E2E_TOKEN/).first()).toBeVisible();

  // The member is excluded from the variable.
  const exclude = page.getByRole('region', { name: 'Exclude a member' });
  const memberOption = exclude
    .getByLabel('Member', { exact: true })
    .locator('option')
    .filter({ hasText: 'wim' });
  await exclude
    .getByLabel('Member', { exact: true })
    .selectOption((await memberOption.getAttribute('value')) ?? '');
  await exclude.getByLabel('Variable name').fill('E2E_TOKEN');
  await exclude.getByRole('button', { name: 'Exclude' }).click();
  await expect(assignments.getByText('E2E_TOKEN excluded')).toBeVisible();
  await expect(page.getByText(value)).toHaveCount(0);

  // The server answers metadata only.
  const listed = await callFromPage(page, 'GET', '/api/v1/environment/variants', undefined, org);
  expect(listed.status, shown(listed.body)).toBe(200);
  expect(JSON.stringify(listed.body)).not.toContain(value);
  expect(zEnvironmentVariantsPage.parse(listed.body).items.map((item) => item.variable)).toEqual([
    'E2E_TOKEN',
  ]);
  const read = await callFromPage(page, 'GET', '/api/v1/environment/assignments', undefined, org);
  const page1 = zEnvironmentAssignmentsPage.parse(read.body);
  expect(page1.items).toHaveLength(1);
  expect(page1.exclusions).toHaveLength(1);

  // A member: the page is an owner's or an admin's, and the server refuses them too.
  await member.goto('/environment');
  await expect(
    member.getByText('Only an owner or an admin of the organization manages its environment variants.'),
  ).toBeVisible();
  expect((await callFromPage(member, 'GET', '/api/v1/environment/variants', undefined, org)).status).toBe(
    403,
  );

  // Another organization: nothing of the first one, and naming it opens nothing.
  const stranger = await anotherPerson(browser);
  const { id: theirs } = await ownerOfNewOrganization(stranger, 'xan');
  await stranger.goto('/environment');
  await expect(stranger.getByText('No variants yet.')).toBeVisible();
  await expect(stranger.getByText('E2E_TOKEN')).toHaveCount(0);
  const own = await callFromPage(stranger, 'GET', '/api/v1/environment/variants', undefined, theirs);
  expect(zEnvironmentVariantsPage.parse(own.body).items).toEqual([]);
  expect((await callFromPage(stranger, 'GET', '/api/v1/environment/variants', undefined, org)).status).toBe(
    404,
  );
  expect(
    (
      await callFromPage(
        stranger,
        'POST',
        '/api/v1/environment/variants',
        { variable: 'X', name: 'x', value: 'v' },
        org,
      )
    ).status,
  ).toBe(404);
});

test('a member declares a value of their own, receives it by name, an owner reviews and promotes it; another organization sees none of it', async ({
  page,
  browser,
}) => {
  expect(await served(page, 'GET', '/api/v1/me/environment/variants')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'yara');
  const member = await anotherPerson(browser);
  await joinAs(page, org, member, 'zeno', 'member');

  const value = valueOfAVariant();
  await member.goto('/me/environment');
  await expect(member.getByRole('heading', { level: 1, name: 'My environment' })).toBeVisible();
  const create = member.getByRole('region', { name: 'Add a value of your own' });
  await create.getByLabel('Variable name').fill('E2E_MINE');
  await create.getByLabel('Variant name').fill('mine');
  await create.getByLabel('Value', { exact: true }).fill(value);
  await create.getByRole('button', { name: 'Create variant' }).click();
  await expect(member.getByRole('list', { name: 'Your own values' })).toContainText('E2E_MINE');
  await expect(member.getByRole('list', { name: 'What your agents receive' })).toContainText('E2E_MINE');
  await expect(member.getByText(value)).toHaveCount(0);

  // The owner reviews it, never its value, and promotes it to the team.
  await page.goto('/environment');
  const review = page.getByRole('list', { name: 'Members’ personal variants' });
  const row = review.getByRole('listitem').filter({ hasText: 'E2E_MINE' });
  await expect(row).toContainText('shared value stored');
  await expect(page.getByText(value)).toHaveCount(0);
  await row.getByRole('button', { name: 'Promote to the team' }).click();
  await row.getByRole('button', { name: 'Make E2E_MINE: mine a team variant' }).click();
  await expect(
    page.getByRole('list', { name: 'Team variants' }).getByRole('listitem').filter({ hasText: 'E2E_MINE' }),
  ).toBeVisible();

  // Another organization: none of it, and naming the first one opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'abel');
  await stranger.goto('/me/environment');
  await expect(stranger.getByText('You have not declared any value of your own.')).toBeVisible();
  await expect(stranger.getByText('E2E_MINE')).toHaveCount(0);
  expect(
    (await callFromPage(stranger, 'GET', '/api/v1/me/environment/variants', undefined, org)).status,
  ).toBe(404);
  expect((await callFromPage(stranger, 'GET', '/api/v1/environment', undefined, org)).status).toBe(404);
});

test('a member declares an MCP server of their own; another organization never sees it', async ({
  page,
  browser,
}) => {
  expect(await served(page, 'GET', '/api/v1/me/mcp/servers')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'bram');
  await page.goto('/me/mcp');
  await expect(page.getByRole('heading', { level: 1, name: 'My MCP servers' })).toBeVisible();
  const form = page.getByRole('region', { name: 'Add a server' });
  await form.getByLabel('Name', { exact: true }).fill('e2e-mine');
  await form.getByLabel('URL', { exact: true }).fill('https://mcp.example.com/mcp');
  await form.getByRole('button', { name: 'Add the server' }).click();
  await expect(page.getByRole('article', { name: 'e2e-mine' })).toBeVisible();

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'cleo');
  await stranger.goto('/me/mcp');
  await expect(stranger.getByText('You have not declared any MCP server of your own.')).toBeVisible();
  await expect(stranger.getByText('e2e-mine')).toHaveCount(0);
  expect((await callFromPage(stranger, 'GET', '/api/v1/me/mcp/servers', undefined, org)).status).toBe(404);
});
