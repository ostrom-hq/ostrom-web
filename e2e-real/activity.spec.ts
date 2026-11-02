// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

interface Feed {
  readonly items: { readonly summary: string; readonly repo?: string }[];
  readonly next?: string;
}

/** A person with an organization of their own and one accepted workflow, which the feed may show. */
async function owner(page: Page, who: string, run: string): Promise<string> {
  await signIn(page, freshEmail(who));
  const org = await callFromPage(page, 'POST', '/api/v1/orgs', { name: `${who} ${run}` });
  expect(org.status).toBe(201);
  const { slug } = org.body as { slug: string };
  await callFromPage(page, 'POST', '/api/v1/workflows', {
    id: `wf-${who}-${run}`,
    name: `Ship ${who} ${run}`,
    domain: `${slug}/api`,
    status: 'accepted',
    foundAt: new Date().toISOString(),
    nodes: [{ id: 'g-deploy', kind: 'gate', label: `Deploy ${who} ${run}`, approvers: [who] }],
    edges: [],
  });
  return slug;
}

/** The summaries the screen shows, once it has shown the feed or said it is empty. */
async function shown(page: Page): Promise<string[]> {
  const main = page.getByRole('main');
  await expect(
    main.getByRole('list').or(main.getByText(/^Nothing has happened yet\.$|^No session in /)),
  ).toBeVisible();
  return main.getByRole('listitem').locator('.o-row__title').allTextContents();
}

test('an owner reads their organization’s activity as the server lists it, and never another’s', async ({
  page,
  browser,
}) => {
  test.skip(
    !(await served(page, 'GET', '/api/v1/activity')),
    'GET /api/v1/activity not served yet (server#72)',
  );
  const run = Date.now().toString(36);
  // Another organization, with its own person and its own workflow.
  const other = await browser.newPage();
  const otherSlug = await owner(other, 'umbra', run);
  await other.close();
  const slug = await owner(page, 'ines', run);

  // The screen first, then the API: a line the screen shows was there when the API is read after it.
  await page.goto('/activity');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity');
  const lines = await shown(page);
  const all = await callFromPage(page, 'GET', '/api/v1/activity');
  expect(all.status).toBe(200);
  const summaries = (all.body as Feed).items.map((item) => item.summary);
  for (const line of lines) expect(summaries).toContain(line);
  // Nothing of the other organization, in the screen or in the answer (CONVENTIONS § 16).
  await expect(page.getByRole('main')).not.toContainText(`umbra ${run}`);
  for (const summary of summaries) expect(summary).not.toContain(`umbra ${run}`);

  // One repository: its sessions only, and the screen says what that leaves out.
  await page.getByRole('textbox', { name: 'Repository' }).fill(`${slug}/api`);
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText(/requests and workflow changes are left out/)).toBeVisible();
  const repoLines = await shown(page);
  const repoFeed = await callFromPage(
    page,
    'GET',
    `/api/v1/activity?repo=${encodeURIComponent(`${slug}/api`)}`,
  );
  expect(repoFeed.status).toBe(200);
  const repoSummaries = (repoFeed.body as Feed).items.map((item) => item.summary);
  for (const line of repoLines) expect(repoSummaries).toContain(line);

  // The other organization's repository, asked from here, shows nothing of it.
  const leak = await callFromPage(
    page,
    'GET',
    `/api/v1/activity?repo=${encodeURIComponent(`${otherSlug}/api`)}`,
  );
  if (leak.status === 200) expect((leak.body as Feed).items).toEqual([]);
  else expect(leak.status).toBe(404);
});
