// SPDX-License-Identifier: AGPL-3.0-only
// Line 2.1 of the journey (demo/PARCOURS.md), console side, against the real server and a fake GitHub
// (e2e-real/fakeGithub.ts): the setup guide of a new organization counts each of its six steps as the owner takes
// them, each read from what the server answers (the GitHub App installed, a person joined, a shared subscription, a
// workflow), the last one said by the person.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub } from './fakeGithub';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization } from './real';

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

  // 4. A shared subscription, as `ostrom accounts share` sends it from a member's machine: the console's own form
  // sends another body, which this server refuses (JOURNAL, 03/11). The guide's step leads to the accounts screen.
  await expect(
    stepOf(guide, 'Add a model account').getByRole('link', { name: 'Add an account' }),
  ).toHaveAttribute('href', '/accounts');
  const shared = await callFromPage(page, 'POST', '/api/v1/accounts', {
    provider: 'claude',
    label: `Gus’s Claude Max ${id}`,
    providerAccountId: `gus-${id}@acme.test`,
    accessToken: `sk-ant-oat01-e2e-${run()}`,
    refreshToken: `sk-ant-ort01-e2e-${run()}`,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  expect(shared.status, JSON.stringify(shared.body)).toBe(201);
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
