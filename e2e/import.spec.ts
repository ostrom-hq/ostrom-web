// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';

const EXPORT = {
  members: [{ id: 'tc-1', username: 'maya' }],
  mcpServers: [{ id: 'v-1', target: 'notion', variant: 'default', url: 'https://mcp.notion.com/mcp' }],
  assignments: [{ memberId: 'tc-1', serverId: 'v-1' }],
  accounts: [
    {
      provider: 'claude',
      providerAccountId: 'acc-1',
      label: 'Old Claude',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: '2020-01-01T00:00:00Z',
    },
  ],
  memberMap: { 'tc-1': '3d6f9a1e-2b4c-4d8e-9f0a-1b2c3d4e5f60' },
};

async function chooseExport(page: Page): Promise<void> {
  await page.getByLabel('Export file (JSON)').setInputFiles({
    name: 'teamcode.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(EXPORT)),
  });
}

test('an owner sees the plan, imports it, then cuts over once TeamCode is stopped', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.role', 'owner')");
  await page.goto('/');
  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Import from TeamCode');
  await chooseExport(page);
  await expect(page.getByRole('region', { name: 'TeamCode export' })).toContainText('teamcode.json');

  const plan = page.getByRole('region', { name: '1. The plan' });
  await plan.getByRole('button', { name: 'Show the plan' }).click();
  await expect(plan.getByRole('list', { name: 'The plan in numbers' })).toContainText(
    '2 planned1 waits for the cutover',
  );

  const run = page.getByRole('region', { name: '2. The import' });
  await run.getByRole('button', { name: 'Import' }).click();
  await run.getByRole('button', { name: 'Write 2 changes into Acme' }).click();
  await expect(run.getByRole('list', { name: 'The import in numbers' })).toContainText('2 created');

  const cutover = page.getByRole('region', { name: '3. The cutover' });
  await expect(cutover.getByRole('button', { name: 'Run the cutover' })).toBeDisabled();
  await cutover.getByRole('checkbox', { name: 'TeamCode is stopped' }).check();
  await cutover.getByRole('button', { name: 'Run the cutover' }).click();
  await cutover.getByRole('button', { name: 'Cut Acme over, in my name' }).click();
  await expect(cutover.getByText('The cutover ran and is in the audit log.')).toBeVisible();
  await expect(cutover.getByRole('list', { name: 'The cutover, line by line' })).toContainText(
    'Old ClaudeShared accountUpdated',
  );
});

test('an admin imports but leaves the cutover to an owner', async ({ page }) => {
  await page.goto('/import');
  await chooseExport(page);
  await expect(page.getByRole('region', { name: '3. The cutover' })).toContainText(
    'Only an owner runs the cutover.',
  );
});

test('an import in another organization never shows the first one’s', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/import');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  await expect(page.getByText(/Move a TeamCode team into Globex/)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Acme');
});
