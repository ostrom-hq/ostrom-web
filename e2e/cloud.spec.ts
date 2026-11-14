// SPDX-License-Identifier: Apache-2.0
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('a developer starts a cloud agent, then runs an automation now', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Cloud agents');
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Bump the SDK');
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('SDK bump');
  await form.getByRole('button', { name: 'Start the agent' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'SDK bump' })).toContainText('Queued');

  await openScreen(page, 'Automations');
  const nightly = page.locator('article').filter({ hasText: 'Nightly dependency upgrades' });
  await nightly.getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByText(/is queued \(run-/)).toBeVisible();
});

test('a developer starts an agent with a preparation recipe, and reads what a failed preparation asks', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Cloud agents');
  const form = page.getByRole('region', { name: 'Start an agent' });
  await form.getByRole('textbox', { name: 'What should it do?' }).fill('Ship the release notes');
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Release notes');
  await form.getByText('Preparation recipe').click();
  await form.getByRole('button', { name: 'Add a repository' }).click();
  const repository = form.getByRole('group', { name: 'Repository 1' });
  await repository.getByRole('textbox', { name: 'Clone URL' }).fill('https://github.com/acme/web');
  await form.getByRole('textbox', { name: 'Required variables' }).fill('NPM_TOKEN');
  await form
    .getByRole('textbox', { name: 'Setup commands, once per workspace (one a line)' })
    .fill('pnpm install');
  // The older single repository and the recipe's repositories never go together.
  await form.getByRole('textbox', { name: 'Repository', exact: true }).fill('https://github.com/acme/api');
  await expect(form.getByRole('alert')).toContainText('not both');
  await expect(form.getByRole('button', { name: 'Start the agent' })).toBeDisabled();
  // The recipe open, with what it says, is read by everyone (WCAG 2.2 AA, as the screens of a11yScreens.spec.ts).
  const axe = await new AxeBuilder({ page })
    .include('form')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  await form.getByRole('textbox', { name: 'Repository', exact: true }).fill('');
  await form.getByRole('button', { name: 'Start the agent' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Release notes' })).toContainText('Queued');

  const sessions = page.getByRole('region', { name: 'Sessions' });
  await expect(sessions.getByRole('listitem').filter({ hasText: 'cs-30' })).toContainText(
    'cloning the repositories',
  );
  await expect(sessions.getByRole('listitem').filter({ hasText: 'cs-25' })).toContainText(
    'fix the recipe or your environment variables first',
  );
});
