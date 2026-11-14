// SPDX-License-Identifier: Apache-2.0
// The Cloud administration page against the real server (ostrom-server#479, ostrom-core#223): an owner saves the
// organization's cloud settings and reads them back, a member sees them and cannot change them, and another
// organization never sees them. The cap of automation sessions per member (ostrom-server#502) is not asserted here:
// it is added once the server serves it.
import { expect, test } from '@playwright/test';
import { zCloudSettings } from '../gen/api/zod.gen';
import {
  anotherPerson,
  callFromPage,
  closeOthers,
  joinAs,
  ownerOfNewOrganization,
  served,
  shown,
} from './real';

test.afterEach(closeOthers);

/** The default the server answers while nothing is stored. */
const DEFAULT_MINUTES = 240;

test('an owner saves the organization’s cloud settings and reads them back, a member only reads them', async ({
  page,
  browser,
}) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'GET', '/api/v1/cloud/settings')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'cora');

  await page.goto('/cloud/admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cloud administration');
  const settings = page.getByRole('region', { name: 'Organization settings' });
  const minutes = settings.getByLabel(/^Background work/);
  await expect(minutes).toHaveValue(String(DEFAULT_MINUTES));
  await expect(settings.getByText('The default: nothing is saved yet.')).toBeVisible();
  await minutes.fill('45');
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(settings.getByText('The organization’s cloud settings are saved.')).toBeVisible();

  // Read back: by the page afresh, and by the API.
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Organization settings' }).getByLabel(/^Background work/),
  ).toHaveValue('45');
  const read = await callFromPage(page, 'GET', '/api/v1/cloud/settings', undefined, org);
  expect(read.status, shown(read.body)).toBe(200);
  expect(zCloudSettings.parse(read.body).backgroundWorkMaxMinutes).toBe(45);

  // A member of the organization sees what was saved, and has nothing to change it with.
  const member = await anotherPerson(browser);
  await joinAs(page, org, member, 'milo', 'member');
  await member.goto('/cloud/admin');
  const theirs = member.getByRole('region', { name: 'Organization settings' });
  await expect(theirs.getByLabel(/^Background work/)).toHaveValue('45');
  await expect(theirs.getByLabel(/^Background work/)).toBeDisabled();
  await expect(theirs.getByText('Only an owner or an admin changes these settings.')).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Save' })).toHaveCount(0);
  // Nor does the server take their write.
  const refused = await callFromPage(
    member,
    'PUT',
    '/api/v1/cloud/settings',
    { backgroundWorkMaxMinutes: 1 },
    org,
  );
  expect(refused.status).toBe(403);
  // And nothing was written: the owner still reads 45.
  const after = await callFromPage(page, 'GET', '/api/v1/cloud/settings', undefined, org);
  expect(zCloudSettings.parse(after.body).backgroundWorkMaxMinutes).toBe(45);
});

test('another organization never sees the first one’s cloud settings', async ({ page, browser }) => {
  expect(await served(page, 'GET', '/api/v1/cloud/settings')).toBe(true);
  const { id: org } = await ownerOfNewOrganization(page, 'dara');
  const saved = await callFromPage(
    page,
    'PUT',
    '/api/v1/cloud/settings',
    { backgroundWorkMaxMinutes: 15 },
    org,
  );
  expect(saved.status, shown(saved.body)).toBe(200);

  const stranger = await anotherPerson(browser);
  const { id: theirOrg } = await ownerOfNewOrganization(stranger, 'eli');
  await stranger.goto('/cloud/admin');
  const settings = stranger.getByRole('region', { name: 'Organization settings' });
  // Their own, still the default: nothing of the first organization's 15.
  await expect(settings.getByLabel(/^Background work/)).toHaveValue(String(DEFAULT_MINUTES));
  const own = await callFromPage(stranger, 'GET', '/api/v1/cloud/settings', undefined, theirOrg);
  expect(own.status, shown(own.body)).toBe(200);
  expect(zCloudSettings.parse(own.body).backgroundWorkMaxMinutes).toBe(DEFAULT_MINUTES);
  // Naming the first organization opens nothing either, and writes nothing there.
  expect((await callFromPage(stranger, 'GET', '/api/v1/cloud/settings', undefined, org)).status).toBe(404);
  expect(
    (await callFromPage(stranger, 'PUT', '/api/v1/cloud/settings', { backgroundWorkMaxMinutes: 1 }, org))
      .status,
  ).toBe(404);
  const first = await callFromPage(page, 'GET', '/api/v1/cloud/settings', undefined, org);
  expect(zCloudSettings.parse(first.body).backgroundWorkMaxMinutes).toBe(15);
  const mine = await callFromPage(stranger, 'GET', '/api/v1/cloud/settings', undefined, theirOrg);
  expect(zCloudSettings.parse(mine.body).backgroundWorkMaxMinutes).toBe(DEFAULT_MINUTES);
});
