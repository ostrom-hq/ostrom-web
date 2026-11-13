// SPDX-License-Identifier: Apache-2.0
// Q-GATES-G1 (a), console side, against the real server and a fake GitHub (e2e-real/fakeGithub.ts): under the `never`
// policy (the default), a pull request whose author is linked to no Ostrom person waits for an approver who linked a
// GitHub account. The approver signed up by e-mail and linked none: the request says why a yes waits and where to link
// it, Approve is off and Decline open; once GitHub is linked from « My account », back on the request, the yes goes
// through. Needs a server that serves `ApprovalCallerView.reasonType` (ostrom-core#112), started by ostrom-server's
// `console-journey.yml` with the fake GitHub's ports and webhook secret. Nothing reaches GitHub.
import { expect, test } from '@playwright/test';
import { zApprovalView, zListApprovalsResponse } from '../gen/api/zod.gen';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub } from './fakeGithub';
import { acceptedWorkflow, loginOf, uniqueRun } from './gate';
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

test('G1 an approver who linked no GitHub account reads why a yes waits, links it from My account, comes back and says yes', async ({
  page,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const owner = await loginOf(page);
  const run = uniqueRun();
  const account = `acme-${run}`;
  const repo = `${account}/api`;

  // The organization's GitHub App, installed on the console as an owner does (journey 2.5).
  const installation = 100_000 + Math.floor(Math.random() * 800_000);
  const admin = `ada-admin-${run}`;
  github.installation({ id: installation, account, admins: [admin], repos: ['api'] });
  const { baseURL } = test.info().project.use;
  github.installs(installation, admin, `${baseURL ?? ''}/api/v1/github/app/install/callback`);
  await page.goto('/github');
  await page.getByRole('link', { name: 'Install on GitHub' }).click();
  await expect(page.getByText('The GitHub App is installed. Its repositories show below.')).toBeVisible();

  // Merging a pull request of that repository waits for the owner's yes.
  await acceptedWorkflow(page, org, {
    id: `merge-${run}`,
    name: `Merge ${run}`,
    nodes: [
      {
        id: 'merge',
        kind: 'gate',
        label: 'Merge',
        approvers: [owner],
        actions: [{ class: 'merge', label: 'Merge a pull request', patterns: [], repos: [repo] }],
      },
    ],
    edges: [],
  });

  // A pull request opens on GitHub, by an author no Ostrom person linked: GitHub's signed webhook opens its gate.
  const author = `octo-${run}`;
  expect(await github.openPullRequest(installation, repo, { number: 6, author, base: 'develop' })).toBe(true);
  let request: string | undefined;
  await expect
    .poll(async () => {
      const mine = await callFromPage(
        page,
        'GET',
        '/api/v1/approvals?mine=true&status=pending',
        undefined,
        org,
      );
      request =
        mine.status === 200
          ? zListApprovalsResponse
              .parse(mine.body)
              .items.find((item) => item.repo === repo || item.action?.repo === repo)?.id
          : undefined;
      return request;
    })
    .toBeDefined();
  const id = request ?? '';

  // The server says why: a yes waits for the approver's GitHub link.
  const view = await callFromPage(page, 'GET', `/api/v1/approvals/${id}/view`, undefined, org);
  expect(view.status, JSON.stringify(view.body)).toBe(200);
  expect(zApprovalView.parse(view.body).you).toMatchObject({
    canApprove: false,
    reasonType: 'github_link_required',
  });

  await page.goto(`/yes/${id}`);
  await expect(page.getByText('To approve this request, link your GitHub account.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Approve/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Decline & tell the agent…' })).toBeEnabled();

  // « My account », its GitHub section: GitHub's consent, then the server's callback, then back on the account.
  await page.locator('a[href="/account#github"]').click();
  await expect(page).toHaveURL(/\/account#github$/);
  const section = page.getByRole('region', { name: 'GitHub' });
  const login = `ada-gh-${run}`;
  github.signInAs(login, `${login}@${run}.e2e.ostrom.test`);
  await section.getByRole('button', { name: 'Link GitHub' }).click();
  await expect(section.getByText('Linked', { exact: true })).toBeVisible();

  // Back on the request: read afresh, the yes is open, and it goes through.
  await page.goto(`/yes/${id}`);
  await expect(page.getByText('To approve this request, link your GitHub account.')).toBeHidden();
  const approve = page.getByRole('button', { name: /^Approve/ });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(`${owner} approved`);
});
