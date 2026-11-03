// SPDX-License-Identifier: AGPL-3.0-only
// CONVENTIONS §16 on the console's screens, against the real server: what one organization holds never shows on
// another's. Sessions, activity, spend, decisions and the audit log have their own journey (sessions.spec,
// activity.spec, spend.spec, decisions.spec, audit.spec). This one covers the rules and the gate queue; the server side
// of the same check is AUTH-REPRISE's.
import { expect, test } from '@playwright/test';
import { askPushToMain, askingToken, gatedRepository, loginOf, requestOf, uniqueRun } from './gate';
import { anotherPerson, callFromPage, closeOthers, ownerOfNewOrganization } from './real';

test.afterEach(closeOthers);

test('§16 another organization’s owner sees none of the first one’s rules on /rules', async ({
  page,
  browser,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'nora');
  const statement = `Never deploy on a Friday (${uniqueRun()}).`;
  const rule = await callFromPage(page, 'POST', '/api/v1/rules', { statement, group: 'Releases' }, org);
  expect(rule.status, JSON.stringify(rule.body)).toBe(201);

  // The owner's own list has it, under every rule.
  await page.goto('/rules');
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^All / }).click();
  await expect(page.locator('article').filter({ hasText: statement })).toBeVisible();

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'otto');
  await stranger.goto('/rules');
  const show = stranger.getByRole('group', { name: 'Show' });
  await show.getByRole('button', { name: 'All 0' }).click();
  await expect(
    stranger.getByText('No rule yet: they appear as the deep pass reads your repositories.'),
  ).toBeVisible();
  await expect(stranger.getByText(statement)).toHaveCount(0);
});

test('§16 another organization’s owner sees none of the first one’s gates, in the queue or by its address', async ({
  page,
  browser,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'pia');
  const owner = await loginOf(page);
  const repo = await gatedRepository(page, org, [owner]);
  const gate = await askPushToMain(await askingToken(page, org), org, repo);
  const request = await requestOf(page, org, gate);

  // The owner's queue has it.
  await page.goto('/yes');
  await expect(page.locator(`a[href$="/yes/${request.id}"]`).first()).toBeVisible();

  const stranger = await anotherPerson(browser);
  await ownerOfNewOrganization(stranger, 'quin');
  await stranger.goto('/yes');
  await expect(stranger.getByText('Nothing waits for you')).toBeVisible();
  await expect(stranger.locator(`a[href*="/yes/${request.id}"]`)).toHaveCount(0);
  await expect(stranger.getByText(repo)).toHaveCount(0);

  // Its address, typed by hand, opens nothing of it: no detail, no answer.
  await stranger.goto(`/yes/${request.id}`);
  await expect(stranger.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(stranger.getByText(repo)).toHaveCount(0);
  if (request.title !== '') await expect(stranger.getByText(request.title)).toHaveCount(0);
  await expect(stranger.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
});
