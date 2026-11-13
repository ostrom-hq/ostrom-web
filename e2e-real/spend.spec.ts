// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

interface BudgetLine {
  readonly scope: string;
  readonly subject?: string;
  readonly usdPerMonth?: number;
  readonly usdPerDay?: number;
  readonly hardStop: boolean;
}

test('an owner reads a new organization’s spend, sets its monthly budget that stops, and another organization sees none', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'nils');

  // Nothing spent and no budget yet: the server's /spending and /budgets say so, and the screen with them.
  const spending = await callFromPage(page, 'GET', '/api/v1/spending?period=month');
  expect(spending.status).toBe(200);
  expect(spending.body).toMatchObject({ totalUsd: 0 });
  expect(spending.body).not.toHaveProperty('budgetUsd');
  await page.goto('/spend');
  await expect(page.getByRole('heading', { level: 1, name: 'Spend' })).toBeVisible();
  await expect(
    page.getByText('No budget for the organization: nothing warns or stops the spend.'),
  ).toBeVisible();
  await expect(page.getByText('Nothing spent in this period.').first()).toBeVisible();
  const budgets = page.getByRole('region', { name: 'Budgets' });
  await expect(budgets.getByText('No budget yet.')).toBeVisible();

  // The organization's budget, by the month, that stops the agents.
  const form = page.getByRole('region', { name: 'Set a budget' });
  await form.getByRole('combobox', { name: 'For' }).selectOption('org');
  await form.getByRole('textbox', { name: 'Per month ($)' }).fill('100');
  await form.getByRole('checkbox', { name: 'Stop the agents at the limit (otherwise, warn only)' }).check();
  await form.getByRole('button', { name: 'Save the budget' }).click();
  const orgLine = budgets.getByRole('listitem').filter({ hasText: 'The organization' });
  await expect(orgLine).toContainText('$100.00 a month');
  await expect(orgLine).toContainText('Stops');
  await expect(page.getByRole('meter', { name: 'Spent of the budget' })).toHaveAttribute(
    'aria-valuetext',
    '$0.00 of $100.00',
  );

  // The server holds it, as the organization's own.
  const held = await callFromPage(page, 'GET', '/api/v1/budgets');
  expect(held.status).toBe(200);
  const lines = (held.body as { items: BudgetLine[] }).items;
  expect(lines).toEqual([expect.objectContaining({ usdPerMonth: 100, hardStop: true })]);
  expect(['org', 'organization']).toContain(lines[0]?.scope);
  // The spending carries it too: that is what the meter reads.
  const after = await callFromPage(page, 'GET', '/api/v1/spending?period=month');
  expect(after.body).toMatchObject({ totalUsd: 0, budgetUsd: 100 });

  // Another organization: no budget on screen, and naming the first one opens nothing.
  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'pera');
  await stranger.goto('/spend');
  await expect(stranger.getByRole('region', { name: 'Budgets' }).getByText('No budget yet.')).toBeVisible();
  for (const path of ['/api/v1/budgets', '/api/v1/spending?period=month']) {
    expect((await callFromPage(stranger, 'GET', path, undefined, org.id)).status, path).toBe(404);
  }
});

test('an owner sets a member’s daily budget that warns only, chosen by login and held by id', async ({
  page,
  browser,
}) => {
  const org = await ownerOfNewOrganization(page, 'sora');
  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'tara', 'member');
  const login = ((await callFromPage(member, 'GET', '/api/v1/auth/me')).body as { dev: { login: string } })
    .dev.login;
  // The members list carries each member's id: what a member budget names.
  const listed = await callFromPage(page, 'GET', `/api/v1/orgs/${org.id}/members`);
  const id = (listed.body as { items: { id: string; login: string }[] }).items.find(
    (item) => item.login === login,
  )?.id;
  expect(id).toBeDefined();

  await page.goto('/spend');
  const form = page.getByRole('region', { name: 'Set a budget' });
  await form.getByRole('combobox', { name: 'For' }).selectOption('member');
  await form.getByRole('combobox', { name: 'Person' }).selectOption({ label: login });
  await form.getByRole('textbox', { name: 'Per day ($)' }).fill('20');
  await form.getByRole('button', { name: 'Save the budget' }).click();
  const line = page.getByRole('region', { name: 'Budgets' }).getByRole('listitem').filter({ hasText: login });
  await expect(line).toContainText('$20.00 a day');
  await expect(line).toContainText('Warns');

  // The server holds it by the member's id, by the day, warning only.
  const held = await callFromPage(page, 'GET', '/api/v1/budgets');
  const own = (held.body as { items: BudgetLine[] }).items.filter((item) => item.subject === id);
  expect(own).toEqual([expect.objectContaining({ scope: 'member', usdPerDay: 20, hardStop: false })]);
  expect(own[0]).not.toHaveProperty('usdPerMonth');
});
