// SPDX-License-Identifier: Apache-2.0
// « Mon compte » (/account), against the real server and a fake GitHub (e2e-real/fakeGithub.ts): a person who signed
// up by e-mail, in no organization, reads their account and links their GitHub from it (decision Q-GATES-G1: a gate
// knows a pull request is theirs only through that link). Nothing reaches GitHub.
import { expect, test } from '@playwright/test';
import { zAccount } from '../gen/api/zod.gen';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub, SIGN_IN_PORT } from './fakeGithub';
import { callFromPage, freshEmail, signIn } from './real';

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

test('a person in no organization links their GitHub from their account', async ({ page }) => {
  await signIn(page, freshEmail('zoe'), '/account');
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  const section = page.getByRole('region', { name: 'GitHub' });
  await expect(section.getByText(/Link your GitHub: a gate then knows/)).toBeVisible();

  const login = `zoe-gh-${uniqueRun()}`;
  github.signInAs(login, `${login}@${uniqueRun()}.e2e.ostrom.test`);
  await section.getByRole('button', { name: 'Link GitHub' }).click();
  // GitHub's consent page, then the server's callback, then back on the account: the page was left and came back.
  await expect
    .poll(() => github.requests.some((r) => r.port === SIGN_IN_PORT && r.path === '/login/oauth/authorize'))
    .toBe(true);
  await expect(section.getByText('Linked', { exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/account');
  await expect(section.getByRole('button', { name: 'Link GitHub' })).toHaveCount(0);

  const read = await callFromPage(page, 'GET', '/api/v1/auth/me/account');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect(zAccount.parse(read.body).providers).toEqual(expect.arrayContaining(['github']));
  expect(github.requests.filter((r) => r.port === SIGN_IN_PORT).map((r) => r.path)).toEqual(
    expect.arrayContaining(['/login/oauth/authorize', '/login/oauth/access_token', '/user']),
  );
});
