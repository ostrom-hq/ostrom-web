// SPDX-License-Identifier: Apache-2.0
// Line 3.6 of the journey (demo/PARCOURS.md), the audit log side, against the real server (`GET /audit`,
// ostrom-server#131): an owner reads the organization's signed log as the server lists it; a member is told it is
// for owners and admins; another organization never sees the first one's lines.
import { expect, test } from '@playwright/test';
import { zListAuditResponse } from '../gen/api/zod.gen';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization, shown } from './real';

test.afterEach(closeOthers);

test('3.6 an owner reads the audit log as the server lists it; a member is told it is not theirs', async ({
  page,
  browser,
}) => {
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const ben = await anotherPerson(browser);
  // A membership change: something the log writes.
  await joinAs(page, org, ben, 'ben', 'member');

  const listed = await callFromPage(page, 'GET', '/api/v1/audit', undefined, org);
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  const { items } = zListAuditResponse.parse(listed.body);
  const [newest] = items;
  expect(newest, shown(items)).toBeDefined();
  if (newest === undefined) return;

  await page.goto('/audit');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit log');
  const lines = page.getByRole('main').getByRole('list').getByRole('listitem');
  await expect(lines).toHaveCount(items.length);
  await expect(lines.first()).toContainText(newest.event);
  await expect(lines.first()).toContainText(`${newest.actor} · ${newest.subject}`);

  const asMember = await callFromPage(ben, 'GET', '/api/v1/audit', undefined, org);
  expect(asMember.status).toBe(403);
  await ben.goto('/audit');
  await expect(
    ben.getByText('Only an owner or an admin of the organization reads its audit log.'),
  ).toBeVisible();
  await expect(ben.getByRole('main').getByRole('list')).toHaveCount(0);
});

test('3.6 another organization’s owner never reads the first one’s audit log', async ({ page, browser }) => {
  const first = await ownerOfNewOrganization(page, 'ada');
  const ben = await anotherPerson(browser);
  await joinAs(page, first.id, ben, 'ben', 'member');
  const mine = await callFromPage(page, 'GET', '/api/v1/audit', undefined, first.id);
  expect(mine.status).toBe(200);
  const subjects = zListAuditResponse.parse(mine.body).items.map((event) => event.subject);

  const other = await anotherPerson(browser);
  const second = await ownerOfNewOrganization(other, 'cleo');
  expect((await callFromPage(other, 'GET', '/api/v1/audit', undefined, first.id)).status).toBe(404);
  await other.goto('/audit');
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Audit log');
  const theirs = await callFromPage(other, 'GET', '/api/v1/audit', undefined, second.id);
  expect(theirs.status).toBe(200);
  const lines = other.getByRole('main').getByRole('listitem');
  await expect(lines).toHaveCount(zListAuditResponse.parse(theirs.body).items.length);
  for (const subject of subjects.filter((item) => item.startsWith('member:')))
    await expect(other.getByRole('main')).not.toContainText(subject);
});
