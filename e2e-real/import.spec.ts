// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

const EXPORT = {
  members: [{ id: 'tc-1', username: 'ghost' }],
  mcpServers: [{ id: 'v-1', target: 'notion', variant: 'default', url: 'https://mcp.notion.com/mcp' }],
  assignments: [{ memberId: 'tc-1', serverId: 'v-1' }],
  memberMap: {},
};

async function ownerOfNewOrganization(page: Page, who: string): Promise<void> {
  await signIn(page, freshEmail(who));
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `${who} ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
}

async function chooseExport(page: Page): Promise<void> {
  await page.getByLabel('Export file (JSON)').setInputFiles({
    name: 'teamcode.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(EXPORT)),
  });
}

/**
 * Whether the server answers the report the contract describes. Until ostrom-server#86 is on main, the report has no
 * `reviveAtCutover` and the console refuses it as outside the contract.
 */
async function reportsAsTheContract(page: Page): Promise<boolean> {
  const probe = await callFromPage(page, 'POST', '/api/v1/import/teamcode?dryRun=true', {});
  return (
    probe.status === 200 &&
    typeof probe.body === 'object' &&
    probe.body !== null &&
    'reviveAtCutover' in probe.body
  );
}

test('an owner sees the plan, imports it, a second plan reads unchanged, then the cutover answers', async ({
  page,
}) => {
  test.skip(
    !(await served(page, 'POST', '/api/v1/import/teamcode')),
    'POST /api/v1/import/teamcode not served yet',
  );
  await ownerOfNewOrganization(page, 'ivo');
  test.skip(
    !(await reportsAsTheContract(page)),
    'the import report has no reviveAtCutover (ostrom-server#86)',
  );

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
  test.skip(
    !(await served(page, 'POST', '/api/v1/import/teamcode')),
    'POST /api/v1/import/teamcode not served yet',
  );
  await ownerOfNewOrganization(page, 'cleo');
  test.skip(
    !(await reportsAsTheContract(page)),
    'the import report has no reviveAtCutover (ostrom-server#86)',
  );
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
  test.skip(
    !(await served(page, 'POST', '/api/v1/import/teamcode')),
    'POST /api/v1/import/teamcode not served yet',
  );
  await ownerOfNewOrganization(page, 'dora');
  test.skip(
    !(await reportsAsTheContract(page)),
    'the import report has no reviveAtCutover (ostrom-server#86)',
  );
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
});
