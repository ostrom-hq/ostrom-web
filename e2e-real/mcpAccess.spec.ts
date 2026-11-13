// SPDX-License-Identifier: Apache-2.0
import { expect, type Locator, type Page, test } from '@playwright/test';
import { callFromPage, ownerOfNewOrganization, served } from './real';

/** Adds a server through the form, as an owner does, and returns its card. */
async function addServer(page: Page, name: string): Promise<Locator> {
  const form = page.getByRole('region', { name: 'Add a server' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await form.getByRole('textbox', { name: 'URL' }).fill('https://mcp.linear.app/mcp');
  await form.getByRole('button', { name: 'Add the server' }).click();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name }) });
  await expect(card).toBeVisible();
  return card;
}

test('an owner changes the agents’ prefix, gives a server to everyone, adds and removes a policy', async ({
  page,
}) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'GET', '/api/v1/mcp/servers/linear/assignments')).toBe(true);
  await ownerOfNewOrganization(page, 'owen');
  await page.goto('/mcp');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('MCP servers');
  const card = await addServer(page, 'linear');

  // The prefix: saved on the server, read again after a reload.
  const prefix = `acme${Date.now().toString(36)}`;
  const names = page.getByRole('region', { name: 'Agent names' });
  await expect(names.getByText('mcp__ostrom-linear__<tool>')).toBeVisible();
  await names.getByRole('textbox', { name: 'Prefix' }).fill(prefix);
  await names.getByRole('button', { name: 'Save the prefix' }).click();
  await expect(names.getByRole('button', { name: 'Save the prefix' })).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Agent names' }).getByText(`mcp__${prefix}-linear__<tool>`),
  ).toBeVisible();

  // Who may use it: everyone, with one tool.
  await card.getByRole('button', { name: 'Who may use it' }).click();
  await expect(card.getByText('Nobody yet: give it to everyone or to one member.')).toBeVisible();
  const give = card.getByRole('form', { name: 'Give linear' });
  await give.getByRole('combobox', { name: 'Tools' }).selectOption('some');
  await give.getByRole('textbox', { name: /Allowed tools/ }).fill('list_issues');
  await give.getByRole('button', { name: 'Give access' }).click();
  const who = card.getByRole('list', { name: 'Who may use linear' });
  await expect(who).toContainText('EveryoneTools list_issues');

  // An argument policy: refused when the team is SEC.
  const policy = card.getByRole('form', { name: 'New argument policy for linear' });
  await policy.getByRole('textbox', { name: 'Tool (* for every tool)' }).fill('create_issue');
  await policy
    .getByRole('textbox', { name: 'What the agent is told' })
    .fill('Security issues are filed by hand.');
  await policy.getByRole('button', { name: 'Add a condition' }).click();
  await policy.getByRole('textbox', { name: 'Argument of condition 1' }).fill('team');
  await policy.getByRole('textbox', { name: 'Value of condition 1' }).fill('SEC');
  await policy.getByRole('button', { name: 'Add the policy' }).click();
  const policies = card.getByRole('list', { name: 'Argument policies of linear' });
  await expect(policies).toContainText('create_issueRefuseteam is SEC');
  await page.reload();
  const again = page.locator('article').filter({ has: page.getByRole('heading', { name: 'linear' }) });
  await again.getByRole('button', { name: 'Who may use it' }).click();
  await expect(again.getByRole('list', { name: 'Argument policies of linear' })).toContainText(
    'The agent is told: “Security issues are filed by hand.”',
  );

  // Both taken back.
  const kept = again.getByRole('list', { name: 'Argument policies of linear' });
  await kept.getByRole('button', { name: 'Remove' }).click();
  await kept.getByRole('button', { name: 'Remove the policy on create_issue' }).click();
  await expect(again.getByText('No policy: every call the assignment allows goes through.')).toBeVisible();
  const everyone = again.getByRole('list', { name: 'Who may use linear' });
  await everyone.getByRole('button', { name: 'Take back' }).click();
  await everyone.getByRole('button', { name: 'Take it back from Everyone' }).click();
  await expect(again.getByText('Nobody yet: give it to everyone or to one member.')).toBeVisible();
});

test('another organization never sees the first one’s servers, people or policies', async ({ page }) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'GET', '/api/v1/mcp/servers/linear/assignments')).toBe(true);
  const ada = await ownerOfNewOrganization(page, 'ada');
  await page.goto('/mcp');
  const card = await addServer(page, 'vault');
  await card.getByRole('button', { name: 'Who may use it' }).click();
  await card.getByRole('form', { name: 'Give vault' }).getByRole('button', { name: 'Give access' }).click();
  await expect(card.getByRole('list', { name: 'Who may use vault' })).toContainText('Everyone');

  // Someone else, in their own organization: none of it shows, and none of it answers.
  await ownerOfNewOrganization(page, 'bea');
  await page.goto('/mcp');
  await expect(page.getByText(/No MCP server yet/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'vault' })).toHaveCount(0);
  for (const path of ['/api/v1/mcp/servers/vault/assignments', '/api/v1/mcp/servers/vault/policies']) {
    expect((await callFromPage(page, 'GET', path)).status).toBe(404);
  }
  expect((await callFromPage(page, 'PUT', '/api/v1/mcp/servers/vault/assignments/all', {})).status).toBe(404);
  // Naming the first organization does not open it: its server, who may use it and its policies are refused.
  for (const [method, path, body] of [
    ['GET', '/api/v1/mcp/servers', undefined],
    ['GET', '/api/v1/mcp/servers/vault/assignments', undefined],
    ['GET', '/api/v1/mcp/servers/vault/policies', undefined],
    ['PUT', '/api/v1/mcp/servers/vault/assignments/all', {}],
    ['DELETE', '/api/v1/mcp/servers/vault/assignments/all', undefined],
  ] as const) {
    // 404, as for an organization that does not exist: the answer does not tell that it does.
    expect((await callFromPage(page, method, path, body, ada.id)).status, `${method} ${path}`).toBe(404);
  }
});
