// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

interface Feed {
  readonly items: { readonly summary: string; readonly repo?: string }[];
  readonly next?: string;
}

test('an owner reads the activity of a new organization as the server lists it, and one repository’s sessions', async ({
  page,
}) => {
  test.skip(
    !(await served(page, 'GET', '/api/v1/activity')),
    'GET /api/v1/activity not served yet (server#72)',
  );
  await signIn(page, freshEmail('ines'));
  const run = Date.now().toString(36);
  const org = await callFromPage(page, 'POST', '/api/v1/orgs', { name: `Initrode ${run}` });
  expect(org.status).toBe(201);
  const { slug } = org.body as { slug: string };
  // An accepted workflow is a signed decision: the feed may show it as a workflow change.
  await callFromPage(page, 'POST', '/api/v1/workflows', {
    id: `wf-${run}`,
    name: `Ship ${run}`,
    domain: `${slug}/api`,
    status: 'accepted',
    foundAt: new Date().toISOString(),
    nodes: [{ id: 'g-deploy', kind: 'gate', label: 'Deploy', approvers: ['ines'] }],
    edges: [],
  });

  const all = await callFromPage(page, 'GET', '/api/v1/activity');
  expect(all.status).toBe(200);
  const feed = all.body as Feed;
  await page.goto('/activity');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity');
  const list = page.getByRole('main').getByRole('list');
  if (feed.items.length === 0) await expect(page.getByText('Nothing has happened yet.')).toBeVisible();
  else {
    await expect(list.getByRole('listitem')).toHaveCount(feed.items.length);
    for (const item of feed.items) await expect(list).toContainText(item.summary);
  }
  await expect(page.getByRole('button', { name: 'Show older' })).toHaveCount(feed.next === undefined ? 0 : 1);

  // One repository: the server keeps its sessions only, and the screen says what that leaves out.
  const repo = `${slug}/api`;
  const one = await callFromPage(page, 'GET', `/api/v1/activity?repo=${encodeURIComponent(repo)}`);
  expect(one.status).toBe(200);
  const sessions = (one.body as Feed).items;
  await page.getByRole('textbox', { name: 'Repository' }).fill(repo);
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText(/requests and workflow changes are left out/)).toBeVisible();
  if (sessions.length === 0) await expect(page.getByText(`No session in ${repo}.`)).toBeVisible();
  else await expect(list.getByRole('listitem')).toHaveCount(sessions.length);
});
