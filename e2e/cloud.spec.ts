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

test('a developer opens a conversation session, reads it, and messages its agent', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Cloud agents');
  // Only a conversation has its own screen: its title opens it.
  await page.getByRole('link', { name: 'Why the invoice test fails on Mondays' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Why the invoice test fails on Mondays');
  const transcript = page.getByRole('region', { name: 'Conversation' });
  await expect(transcript.getByText('Why does the invoice test fail on Mondays?')).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await transcript.getByRole('button', { name: /2 actions/ }).click();
  await transcript.getByRole('button', { name: /^Bash/ }).click();
  await expect(transcript.getByText('Exit code 1')).toBeVisible();
  // The answer comes back on the live stream.
  await page.getByRole('textbox', { name: 'Message the agent' }).fill('Fix it with UTC dates');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(transcript.getByText('On it: Fix it with UTC dates')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message the agent' })).toHaveValue('');
});

test('a developer answers the agent’s permission request, and follows what runs in the session', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Cloud agents');
  await page.getByRole('link', { name: 'Why the invoice test fails on Mondays' }).click();
  const transcript = page.getByRole('region', { name: 'Conversation' });
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message the agent' }).fill('Run the deploy');
  await page.getByRole('button', { name: 'Send' }).click();
  // The agent asks before its deploy; meanwhile a reviewer subagent and the tests run in the background.
  const asked = page.getByRole('region', { name: 'The agent asks to use Bash' });
  await expect(asked).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Running in this session' });
  await expect(panel.getByText('Review the deploy script')).toBeVisible();
  await expect(panel.getByText('Tests in watch mode')).toBeVisible();
  await asked.getByRole('button', { name: 'Allow' }).click();
  await expect(transcript.getByText('Deployed.')).toBeVisible();
  await expect(transcript.getByText('A permission request was answered')).toBeVisible();
  await expect(asked).toBeHidden();
  // The reviewer's own thread, from its feed.
  await transcript.getByRole('button', { name: 'Open reviewer' }).click();
  await expect(transcript.getByText('The script looks safe.')).toBeVisible();
  await transcript.getByRole('button', { name: '← Main conversation' }).click();
  await expect(transcript.getByText('Deployed.')).toBeVisible();
});

test('a developer attaches a file to a message for the agent', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Cloud agents');
  await page.getByRole('link', { name: 'Why the invoice test fails on Mondays' }).click();
  const transcript = page.getByRole('region', { name: 'Conversation' });
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  // The paperclip opens the browser's file dialog; the file uploads at once, as a chip.
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'trace.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('TypeError at invoice.ts:42'),
  });
  const chips = page.getByRole('list', { name: 'Files of the next message' });
  await expect(chips.getByText(/^Uploaded/)).toBeVisible();
  // A message may carry files and no text.
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(transcript.getByText('Read trace.txt.')).toBeVisible();
  await expect(transcript.getByText('trace.txt (26 B)')).toBeVisible();
  await expect(chips).toBeHidden();
});
