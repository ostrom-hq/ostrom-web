// SPDX-License-Identifier: Apache-2.0
// Line 2.1 of the journey (demo/PARCOURS.md), console side, against the real server and a fake GitHub
// (e2e-real/fakeGithub.ts): the setup guide of a new organization counts each of its six steps as the owner takes
// them on the console, each read from what the server answers (the GitHub App installed, a person joined, a shared
// subscription, a workflow), the last one said by the person.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub } from './fakeGithub';
import { anotherPerson, closeOthers, joinAs, ownerOfNewOrganization } from './real';

const github = new FakeGitHub();

test.skip(
  !FAKE_GITHUB_CONFIGURED,
  'the server of this run points at no fake GitHub (ports and webhook secret)',
);
test.beforeAll(async () => {
  await github.start();
});
test.afterAll(async () => {
  await github.stop();
});
test.afterEach(async () => {
  await closeOthers();
});

function run(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The guide on the home screen, read again. */
async function guideOf(page: Page): Promise<Locator> {
  await page.goto('/');
  const guide = page.getByRole('region', { name: 'Set up' });
  await expect(guide).toBeVisible();
  return guide;
}

function stepOf(guide: Locator, title: string): Locator {
  return guide.getByRole('listitem').filter({ hasText: title });
}

test('2.1 the setup guide counts its six steps as the owner takes them', async ({ page, browser }) => {
  const { id: org } = await ownerOfNewOrganization(page, 'gus');
  let guide = await guideOf(page);
  await expect(guide).toContainText('1 of 6 done');
  await expect(stepOf(guide, 'Create the organization')).toContainText('(done)');
  await expect(stepOf(guide, 'Connect GitHub')).not.toContainText('(done)');

  // 2. GitHub: from the guide's step to the GitHub screen, then GitHub's install page and back.
  const id = run();
  const installation = 100_000 + Math.floor(Math.random() * 800_000);
  github.installation({ id: installation, account: `acme-${id}`, admins: [`gus-gh-${id}`], repos: ['api'] });
  const { baseURL } = test.info().project.use;
  github.installs(installation, `gus-gh-${id}`, `${baseURL ?? ''}/api/v1/github/app/install/callback`);
  await stepOf(guide, 'Connect GitHub').getByRole('link', { name: 'Connect' }).click();
  await expect(page).toHaveURL(/\/github$/);
  await page.getByRole('link', { name: 'Install on GitHub' }).click();
  await expect(page.getByText('The GitHub App is installed. Its repositories show below.')).toBeVisible();
  guide = await guideOf(page);
  await expect(guide).toContainText('2 of 6 done');
  await expect(stepOf(guide, 'Connect GitHub')).toContainText('(done)');

  // 3. The team: someone joins.
  const member = await anotherPerson(browser);
  await joinAs(page, org, member, 'hal', 'member');
  guide = await guideOf(page);
  await expect(guide).toContainText('3 of 6 done');
  await expect(stepOf(guide, 'Invite your team')).toContainText('(done)');

  // 4. A shared subscription, from the guide's step: its token stored as a secret first, then shared on /accounts.
  await stepOf(guide, 'Add a model account').getByRole('link', { name: 'Add an account' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await page.getByRole('link', { name: 'Add it in Secrets' }).click();
  await expect(page).toHaveURL(/\/secrets$/);
  const secret = `GUS_CLAUDE_${id.toUpperCase()}`;
  const add = page.getByRole('region', { name: 'Add a secret' });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill(secret);
  await add.getByLabel('Value').fill(`sk-ant-oat01-e2e-${run()}`);
  await add.getByRole('button', { name: 'Save the secret' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: secret })).toBeVisible();
  // Back to the form, as the secrets screen leaves it to the person.
  await page.goto('/accounts');
  const label = `Gus’s Claude Max ${id}`;
  const share = page.getByRole('region', { name: 'Share a subscription' });
  await share.getByLabel('Provider').selectOption('anthropic');
  await share.getByRole('textbox', { name: 'Name', exact: true }).fill(label);
  await share.getByLabel('Credential').selectOption(secret);
  await share.getByLabel('Daily share in USD (optional)').fill('40');
  await share.getByRole('button', { name: 'Share' }).click();
  // Shared as the form said, daily share included; a refusal would be an alert on the screen.
  await expect(page.getByRole('article', { name: label })).toContainText('$40.00 a day');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  guide = await guideOf(page);
  await expect(guide).toContainText('4 of 6 done');
  await expect(stepOf(guide, 'Add a model account')).toContainText('(done)');

  // 5. A first workflow, from the guide's step: written on the console.
  await stepOf(guide, 'Write a first workflow').getByRole('link', { name: 'Open workflows' }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await page.getByRole('link', { name: 'New workflow' }).click();
  const form = page.getByRole('form', { name: 'A new workflow' });
  const name = `Release train ${id}`;
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await form.getByLabel('Domain').fill('Release');
  // The repository of the installation, picked among the organization's.
  await form.getByRole('checkbox', { name: 'api', exact: true }).check();
  await form.getByLabel('Step 1: What it is').fill('A tag is pushed');
  await form.getByRole('button', { name: 'Create the workflow' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  guide = await guideOf(page);
  await expect(guide).toContainText('5 of 6 done');
  await expect(stepOf(guide, 'Write a first workflow')).toContainText('(done)');

  // 6. The CLI: nothing the console reads can tell, the person says so.
  await stepOf(guide, 'Install the CLI').getByRole('button', { name: 'It is set up' }).click();
  await expect(guide).toContainText('All 6 done');
  await expect(stepOf(guide, 'Install the CLI')).toContainText('(done)');
});
