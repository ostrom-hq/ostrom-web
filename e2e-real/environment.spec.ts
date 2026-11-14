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
  await create.getByLabel('Value').fill(value);
  await create.getByRole('button', { name: 'Create variant' }).click();
  const variants = page.getByRole('list', { name: 'Team variants' });
  await expect(variants.getByRole('listitem').filter({ hasText: 'E2E_TOKEN' })).toContainText(
    'shared value stored',
  );

  // Nobody receives it until it is assigned: the owner picks it for themself.
  const assign = page.getByRole('region', { name: 'Assign a variant' });
  const ownerOption = assign.getByLabel('Member').locator('option').filter({ hasNotText: 'wim' });
  await assign.getByLabel('Member').selectOption((await ownerOption.getAttribute('value')) ?? '');
  await assign.getByRole('button', { name: 'Assign' }).click();
  const assignments = page.getByRole('list', { name: 'Effective assignments' });
  await expect(assignments.getByText(/E2E_TOKEN/).first()).toBeVisible();

  // The member is excluded from the variable.
  const exclude = page.getByRole('region', { name: 'Exclude a member' });
  const memberOption = exclude.getByLabel('Member').locator('option').filter({ hasText: 'wim' });
  await exclude.getByLabel('Member').selectOption((await memberOption.getAttribute('value')) ?? '');
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
