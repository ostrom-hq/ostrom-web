// SPDX-License-Identifier: Apache-2.0
// The repositories a workflow is limited to (audit of the runner 2, R6), console side, against the real server and a
// fake GitHub (e2e-real/fakeGithub.ts): the list says which repositories a workflow covers, or all of them, and the
// editor picks them among the organization's, with a warning while none is picked.
import { expect, test } from '@playwright/test';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub } from './fakeGithub';
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

test('an owner limits a workflow to repositories of the organization, then to none, and the list says which', async ({
  page,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'remy');
  const run = uniqueRun();
  const installation = 100_000 + Math.floor(Math.random() * 800_000);
  const admin = `remy-gh-${run}`;
  github.installation({ id: installation, account: `acme-${run}`, admins: [admin], repos: ['api', 'web'] });
  const { baseURL } = test.info().project.use;
  github.installs(installation, admin, `${baseURL ?? ''}/api/v1/github/app/install/callback`);
  await page.goto('/github');
  await page.getByRole('link', { name: 'Install on GitHub' }).click();
  await expect(page.getByText('The GitHub App is installed. Its repositories show below.')).toBeVisible();

  // Another workflow, limited to nothing: the list says it covers every repository.
  const open = `Open ${run}`;
  const created = await callFromPage(
    page,
    'POST',
    '/api/v1/workflows',
    {
      id: `wf-open-${run}`,
      name: open,
      domain: 'Release',
      nodes: [{ id: 'n-1', kind: 'trigger', label: 'A tag is pushed' }],
      edges: [{ from: 'n-1', to: null }],
      start: 'n-1',
      status: 'accepted',
      foundAt: new Date().toISOString(),
    },
    org,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);

  const name = `Web only ${run}`;
  await page.goto('/workflows');
  await expect(page.getByRole('link', { name: new RegExp(open) })).toContainText('All repositories');
  await page.getByRole('link', { name: 'New workflow' }).click();
  const form = page.getByRole('form', { name: 'A new workflow' });
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Domain').fill('Frontend');
  await form.getByLabel('Step 1: What it is').fill('A branch is pushed');
  // None picked yet: the editor warns that the workflow reaches every repository its gates or words point to.
  await expect(form.getByRole('note')).toContainText('No repository picked');
  // The organization's repositories, as the GitHub App reads them.
  await expect(form.getByRole('checkbox', { name: 'api', exact: true })).toBeVisible();
  await form.getByRole('checkbox', { name: 'web', exact: true }).check();
  await expect(form.getByRole('note')).toHaveCount(0);
  await form.getByRole('button', { name: 'Create the workflow' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page.getByText('Repositories', { exact: true })).toBeVisible();

  // The server kept what the console wrote: the repository by its name, whatever its owner.
  const id = `wf-web-only-${run}`;
  const read = await callFromPage(page, 'GET', `/api/v1/workflows/${id}`, undefined, org);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect(read.body).toMatchObject({ repos: ['*/web'] });
  await page.goto('/workflows');
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('Frontend · web ·');

  // Every repository again: the warning comes back, and the server keeps no field.
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('form', { name: 'Edit the workflow' });
  await expect(edit.getByRole('checkbox', { name: 'web', exact: true })).toBeChecked();
  await edit.getByRole('checkbox', { name: 'web', exact: true }).uncheck();
  await expect(edit.getByRole('note')).toContainText('No repository picked');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('form')).toHaveCount(0);
  const again = await callFromPage(page, 'GET', `/api/v1/workflows/${id}`, undefined, org);
  expect(again.status).toBe(200);
  expect(again.body).not.toHaveProperty('repos');
  await page.goto('/workflows');
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('All repositories');
});
