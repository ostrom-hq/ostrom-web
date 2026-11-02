// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an admin renames the agents’ prefix, gives a server to everyone and adds an argument policy', async ({
  page,
}) => {
  await page.goto('/mcp');
  const names = page.getByRole('region', { name: 'Agent names' });
  await expect(names.getByText('mcp__ostrom-linear__<tool>')).toBeVisible();
  await names.getByRole('textbox', { name: 'Prefix' }).fill('acme');
  await names.getByRole('button', { name: 'Save the prefix' }).click();
  await expect(names.getByText('mcp__acme-linear__<tool>')).toBeVisible();
  await expect(names.getByRole('button', { name: 'Save the prefix' })).toBeDisabled();

  const sentry = page.locator('article').filter({ has: page.getByRole('heading', { name: 'sentry' }) });
  await sentry.getByRole('button', { name: 'Who may use it' }).click();
  await expect(sentry.getByText('Nobody yet: give it to everyone or to one member.')).toBeVisible();
  const give = sentry.getByRole('form', { name: 'Give sentry' });
  await give.getByRole('combobox', { name: 'Tools' }).selectOption('some');
  await give.getByRole('textbox', { name: /Allowed tools/ }).fill('search_issues');
  await give.getByRole('button', { name: 'Give access' }).click();
  await expect(sentry.getByRole('list', { name: 'Who may use sentry' })).toContainText(
    'EveryoneTools search_issues',
  );

  const policy = sentry.getByRole('form', { name: 'New argument policy for sentry' });
  await policy.getByRole('textbox', { name: 'Tool (* for every tool)' }).fill('resolve_issue');
  await policy.getByRole('combobox', { name: 'Then' }).selectOption('REQUIRE_APPROVAL');
  await policy.getByRole('textbox', { name: 'What the agent is told' }).fill('A human resolves it.');
  await policy.getByRole('button', { name: 'Add a condition' }).click();
  await policy.getByRole('textbox', { name: 'Argument of condition 1' }).fill('project');
  await policy.getByRole('textbox', { name: 'Value of condition 1' }).fill('billing');
  await policy.getByRole('button', { name: 'Add the policy' }).click();
  const policies = sentry.getByRole('list', { name: 'Argument policies of sentry' });
  await expect(policies).toContainText('resolve_issueAsk for a yesproject is billing');
  await policies.getByRole('button', { name: 'Remove' }).click();
  await policies.getByRole('button', { name: 'Remove the policy on resolve_issue' }).click();
  await expect(sentry.getByText('No policy: every call the assignment allows goes through.')).toBeVisible();
});

test('a member reads the prefix and never sees who may use a server', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.role', 'member')");
  await page.goto('/mcp');
  await expect(page.getByText('The prefix is ostrom; owners and admins change it.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'linear' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Who may use it' })).toHaveCount(0);
});

test('the MCP servers of another organization never show the first one’s', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/mcp');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  await expect(page.getByText(/No MCP server yet/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'linear' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Recent calls' })).toHaveCount(0);
});
