// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization, served } from './real';

const EXPORT = {
  members: [{ id: 'tc-1', username: 'ghost' }],
  mcpServers: [{ id: 'v-1', target: 'notion', variant: 'default', url: 'https://mcp.notion.com/mcp' }],
  assignments: [{ memberId: 'tc-1', serverId: 'v-1' }],
  memberMap: {},
};

// The other people's browsers are closed after each test, their traces kept when it failed.
test.afterEach(closeOthers);

async function chooseExport(page: Page): Promise<void> {
  await page.getByLabel('Export file (JSON)').setInputFiles({
    name: 'teamcode.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(EXPORT)),
  });
}

/** Whether the server answers the report the contract describes (`reviveAtCutover`, ostrom-server#86 on main). */
async function reportsAsTheContract(page: Page): Promise<boolean> {
  const probe = await callFromPage(page, 'POST', '/api/v1/import/teamcode?dryRun=true', {});
  return (
    probe.status === 200 &&
    typeof probe.body === 'object' &&
    probe.body !== null &&
    'reviveAtCutover' in probe.body
  );
}

test('an owner sees the plan, imports it, a second plan reads unchanged, and finds the server on the MCP screen', async ({
  page,
}) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'POST', '/api/v1/import/teamcode')).toBe(true);
  await ownerOfNewOrganization(page, 'ivo');
  expect(await reportsAsTheContract(page)).toBe(true);

  await page.goto('/import');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Import from TeamCode');
  await chooseExport(page);
  await expect(page.getByRole('region', { name: 'TeamCode export' })).toContainText(
    'ghost has no Ostrom member in the file’s map',
  );

  const plan = page.getByRole('region', { name: '1. The plan' });
  await plan.getByRole('button', { name: 'Show the plan' }).click();
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).toContainText('planned');
  await expect(plan.getByRole('list', { name: 'The plan, line by line' })).toContainText('notion');

  const run = page.getByRole('region', { name: '2. The import' });
  await run.getByRole('button', { name: 'Import' }).click();
  await run.getByRole('button', { name: /^Write \d+ changes? into / }).click();
  await expect(run.getByRole('list', { name: 'The import in numbers' })).toContainText('created');

  await plan.getByRole('button', { name: 'Show the plan' }).click();
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).not.toContainText('planned');
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).toContainText('unchanged');

  // The imported server is on the MCP screen.
  await page.getByRole('link', { name: 'MCP' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'notion' })).toBeVisible();
});

test('the cutover is the owner’s, and the server says when it cannot run it', async ({ page }) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'POST', '/api/v1/import/teamcode')).toBe(true);
  await ownerOfNewOrganization(page, 'cleo');
  expect(await reportsAsTheContract(page)).toBe(true);
  await page.goto('/import');
  await chooseExport(page);
  await page
    .getByRole('region', { name: '1. The plan' })
    .getByRole('button', { name: 'Show the plan' })
    .click();
  const run = page.getByRole('region', { name: '2. The import' });
  await run.getByRole('button', { name: 'Import' }).click();
  await run.getByRole('button', { name: /^Write \d+ changes? into / }).click();
  await expect(run.getByRole('list', { name: 'The import in numbers' })).toBeVisible();

  const cutover = page.getByRole('region', { name: '3. The cutover' });
  await cutover.getByRole('checkbox', { name: 'TeamCode is stopped' }).check();
  await cutover.getByRole('button', { name: 'Run the cutover' }).click();
  await cutover.getByRole('button', { name: /^Cut .* over, in my name$/ }).click();
  // A server with an audit log and shared accounts runs it; one without says so (503), nothing written.
  await expect(
    page.getByText(
      /The cutover ran and is in the audit log\.|This server cannot run the cutover: it needs an audit log and shared accounts\./,
    ),
  ).toBeVisible();
});

test('another organization’s plan never shows the first one’s import', async ({ page }) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'POST', '/api/v1/import/teamcode')).toBe(true);
  const dora = await ownerOfNewOrganization(page, 'dora');
  expect(await reportsAsTheContract(page)).toBe(true);
  expect((await callFromPage(page, 'POST', '/api/v1/import/teamcode', EXPORT)).status).toBe(200);

  await ownerOfNewOrganization(page, 'eli');
  await page.goto('/import');
  await chooseExport(page);
  const plan = page.getByRole('region', { name: '1. The plan' });
  await plan.getByRole('button', { name: 'Show the plan' }).click();
  // What the first organization imported is planned here, never unchanged.
  await expect(plan.getByRole('list', { name: 'The plan, line by line' })).toContainText('notion');
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).toContainText('planned');
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).not.toContainText('unchanged');
  expect((await callFromPage(page, 'GET', '/api/v1/mcp/servers')).body).toEqual({ items: [] });
  // Naming the first organization does not open it: its plan, its servers and its cutover are refused.
  for (const [method, path, body] of [
    ['POST', '/api/v1/import/teamcode?dryRun=true', EXPORT],
    ['POST', '/api/v1/import/teamcode?cutover=true', EXPORT],
    ['GET', '/api/v1/mcp/servers', undefined],
  ] as const) {
    // 404, as for an organization that does not exist: the answer does not tell that it does.
    expect((await callFromPage(page, method, path, body, dora.id)).status, `${method} ${path}`).toBe(404);
  }
});

test('an admin plans and imports, but the cutover is the owner’s, on screen and on the server; a member does neither', async ({
  page,
  browser,
}) => {
  expect(await served(page, 'POST', '/api/v1/import/teamcode')).toBe(true);
  const org = await ownerOfNewOrganization(page, 'gus');
  expect(await reportsAsTheContract(page)).toBe(true);
  const admin = await anotherPerson(browser);
  await joinAs(page, org.id, admin, 'hana', 'admin');

  await admin.goto('/import');
  await chooseExport(admin);
  const plan = admin.getByRole('region', { name: '1. The plan' });
  await plan.getByRole('button', { name: 'Show the plan' }).click();
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).toContainText('planned');
  const run = admin.getByRole('region', { name: '2. The import' });
  await run.getByRole('button', { name: 'Import' }).click();
  await run.getByRole('button', { name: /^Write \d+ changes? into / }).click();
  await expect(run.getByRole('list', { name: 'The import in numbers' })).toContainText('created');
  // The screen offers an admin no cutover; the server refuses one anyway, and writes nothing in their name.
  const cutover = admin.getByRole('region', { name: '3. The cutover' });
  await expect(cutover).toContainText('Only an owner runs the cutover.');
  await expect(cutover.getByRole('button', { name: 'Run the cutover' })).toHaveCount(0);
  // A server only this refused cutover carries: refused, it is nowhere afterwards.
  const withMore = {
    ...EXPORT,
    mcpServers: [
      ...EXPORT.mcpServers,
      { id: 'v-2', target: 'refused-cutover', variant: 'default', url: 'https://mcp.linear.app/mcp' },
    ],
  };
  expect((await callFromPage(admin, 'POST', '/api/v1/import/teamcode?cutover=true', withMore)).status).toBe(
    403,
  );
  const servers = await callFromPage(page, 'GET', '/api/v1/mcp/servers');
  expect(JSON.stringify(servers.body)).not.toContain('refused-cutover');

  const member = await anotherPerson(browser);
  await joinAs(page, org.id, member, 'ines', 'member');
  await member.goto('/import');
  await expect(member.getByText(/ask an owner or an admin/)).toBeVisible();
  for (const query of ['?dryRun=true', '', '?cutover=true']) {
    expect((await callFromPage(member, 'POST', `/api/v1/import/teamcode${query}`, EXPORT)).status).toBe(403);
  }
});
