// SPDX-License-Identifier: AGPL-3.0-only
// Lines 1.2 and 2.5 of the journey (demo/PARCOURS.md), console side, against the real server and a fake GitHub
// (e2e-real/fakeGithub.ts) on the ports ostrom-server's `console-journey.yml` points the server at: a person signs in
// with GitHub, and an owner installs the GitHub App and reads the repositories given to it. Nothing reaches GitHub.
import { expect, test } from '@playwright/test';
import { zMe } from '../gen/api/zod.gen';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub, SIGN_IN_PORT } from './fakeGithub';
import { callFromPage, ownerOfNewOrganization } from './real';

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

/** A name no other journey uses. */
function uniqueRun(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

test('1.2 someone signs in with GitHub and is signed in as their GitHub login', async ({ page }) => {
  const login = `octo-${uniqueRun()}`;
  github.signInAs(login, `${login}@${uniqueRun()}.e2e.ostrom.test`);
  await page.goto('/signin');
  await page.getByRole('link', { name: 'Continue with GitHub' }).click();
  await expect(page).not.toHaveURL(/\/signin|127\.0\.0\.1:4610/);
  await expect
    .poll(async () => {
      const me = await callFromPage(page, 'GET', '/api/v1/auth/me');
      return me.status === 200 ? zMe.parse(me.body).dev.login : `status ${String(me.status)}`;
    })
    .toBe(login);
  // The server exchanged GitHub's code itself, with the PKCE verifier, and read who the token is.
  expect(github.requests.filter((r) => r.port === SIGN_IN_PORT).map((r) => r.path)).toEqual(
    expect.arrayContaining(['/login/oauth/authorize', '/login/oauth/access_token', '/user']),
  );
});

test('2.5 an owner installs the GitHub App on the console and reads the repositories given to it', async ({
  page,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const run = uniqueRun();
  const installation = 100_000 + Math.floor(Math.random() * 800_000);
  const admin = `ada-gh-${run}`;
  github.installation({ id: installation, account: `acme-${run}`, admins: [admin], repos: ['api', 'web'] });
  const { baseURL } = test.info().project.use;
  github.installs(installation, admin, `${baseURL ?? ''}/api/v1/github/app/install/callback`);

  await page.goto('/github');
  const app = page.getByRole('region', { name: 'GitHub App' });
  await expect(app.getByText('Not installed', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Install on GitHub' }).click();
  // GitHub's install page, then the server's callback, then the console's page with what happened.
  await expect(page.getByText('The GitHub App is installed. Its repositories show below.')).toBeVisible();
  await expect(app.getByText('Installed', { exact: true })).toBeVisible();
  const repos = page.getByRole('region', { name: 'Governed repositories' });
  await expect(repos).toContainText('The app reads 2 repositories.');
  // The repositories given to this installation, as the fake describes them: not another run's.
  await expect(repos).toContainText(`The api repository of acme-${run}`);
  await expect(repos).toContainText(`The web repository of acme-${run}`);

  const read = await callFromPage(page, 'GET', '/api/v1/github/app', undefined, org);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect(read.body).toMatchObject({ installed: true });
});
