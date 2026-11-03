// SPDX-License-Identifier: AGPL-3.0-only
// Line 2.1 of the journey (demo/PARCOURS.md), console side, against the real server and a fake GitHub
// (e2e-real/fakeGithub.ts): the setup guide of a new organization counts each of its six steps as the owner takes
// them, each read from what the server answers (the GitHub App installed, a person joined, a shared subscription, a
// workflow), the last one said by the person.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { APP_PORT, FakeGitHub, SIGN_IN_PORT } from './fakeGithub';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';
import { zMe } from '../gen/api/zod.gen';

const github = new FakeGitHub();

test.skip(SIGN_IN_PORT === 0 || APP_PORT === 0, 'the server of this run points at no fake GitHub');
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
  const login = zMe.parse((await callFromPage(member, 'GET', '/api/v1/auth/me')).body).dev.login;
  guide = await guideOf(page);
  await expect(guide).toContainText('3 of 6 done');
  await expect(stepOf(guide, 'Invite your team')).toContainText('(done)');

  // 4. A shared subscription, from the guide's step.
  // The shape secrets.spec.ts shares: an API key, not an OAuth token (which comes with its refresh token).
  const secret = `sk-e2e-${run()}`;
  expect(
    (await callFromPage(page, 'POST', '/api/v1/secrets', { name: 'CLAUDE_MAX_TOKEN', value: secret })).status,
  ).toBe(201);
  await stepOf(guide, 'Add a model account').getByRole('link', { name: 'Add an account' }).click();
  const form = page.getByRole('region', { name: 'Share a subscription' });
  await form.getByRole('combobox', { name: 'Provider' }).selectOption('anthropic');
  await form.getByRole('textbox', { name: 'Name' }).fill('Gus’s Claude Max');
  await form.getByRole('combobox', { name: 'Credential' }).selectOption('CLAUDE_MAX_TOKEN');
  await form.getByRole('textbox', { name: 'Daily share in USD (optional)' }).fill('25');
  await form.getByRole('checkbox', { name: login, exact: true }).check();
  await form.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('article', { name: 'Gus’s Claude Max' })).toBeVisible();
  guide = await guideOf(page);
  await expect(guide).toContainText('4 of 6 done');
  await expect(stepOf(guide, 'Add a model account')).toContainText('(done)');

  // 5. A first workflow.
  const workflow = {
    id: `wf-guide-${id}`,
    name: 'Release train',
    domain: `acme-${id}/api`,
    nodes: [{ id: 'n-1', kind: 'trigger', label: 'A tag is pushed' }],
    edges: [{ from: 'n-1', to: null }],
    start: 'n-1',
    status: 'accepted',
    foundAt: new Date().toISOString(),
  };
  expect((await callFromPage(page, 'POST', '/api/v1/workflows', workflow)).status).toBe(201);
  guide = await guideOf(page);
  await expect(guide).toContainText('5 of 6 done');
  await expect(stepOf(guide, 'Write a first workflow')).toContainText('(done)');

  // 6. The CLI: nothing the console reads can tell, the person says so.
  await stepOf(guide, 'Install the CLI').getByRole('button', { name: 'It is set up' }).click();
  await expect(guide).toContainText('All 6 done');
  await expect(stepOf(guide, 'Install the CLI')).toContainText('(done)');
});
