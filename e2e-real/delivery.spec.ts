// SPDX-License-Identifier: Apache-2.0
// The team's skills and hooks against the real server (parity rows TC-SKL-7 and TC-HOK-5): an owner publishes a
// version through the API (as a CI would, with the session standing in for its key), then pins it, sets who receives
// it and reads what a member receives, all from the console. Publication has no form in the console, as in TeamCode.
import { expect, type Page, test } from '@playwright/test';
import { anotherPerson, callFromPage, closeOthers, joinAs, ownerOfNewOrganization, served } from './real';

test.afterEach(closeOthers);

const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

/** Publishes a skill version as a CI does, and says so if the server refuses. */
async function publishSkill(page: Page, name: string, version: string, org?: string): Promise<void> {
  const published = await callFromPage(
    page,
    'POST',
    `/api/v1/skills/${name}/versions`,
    {
      version,
      files: [{ path: 'SKILL.md', contentBase64: base64(`# ${name}\n\nReview a pull request.\n`) }],
    },
    org,
  );
  expect(published.status).toBe(201);
}

async function publishHook(page: Page, name: string, version: string): Promise<void> {
  const published = await callFromPage(page, 'POST', `/api/v1/hooks/${name}/versions`, {
    version,
    definition: { events: ['Stop'], command: 'bin/check.sh', timeoutSeconds: 20 },
    files: [{ path: 'bin/check.sh', mode: 'executable', contentBase64: base64('#!/bin/sh\necho checked\n') }],
  });
  expect(published.status).toBe(201);
}

test('an owner pins a skill and delivers it to every member, then reads what a member receives', async ({
  page,
}) => {
  // Served on the server's main: a probe that fails is a broken server, never a journey to skip.
  expect(await served(page, 'GET', '/api/v1/skills')).toBe(true);
  await ownerOfNewOrganization(page, 'owen');
  await publishSkill(page, 'review-pr', '1.0.0');
  await publishSkill(page, 'review-pr', '1.1.0');

  await page.goto('/skills');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Skill catalog');
  const row = page
    .getByRole('list', { name: 'Skills' })
    .getByRole('listitem')
    .filter({ hasText: 'review-pr' });
  await expect(row).toContainText('Not pinned: not delivered');
  await row.getByRole('link', { name: 'review-pr' }).click();

  // Both versions, newest first, with their digest; pinning is the owner's gesture.
  const versions = page.getByRole('list', { name: 'Versions of review-pr' });
  await expect(versions.getByRole('listitem')).toHaveCount(2);
  await expect(versions.getByRole('listitem').first()).toContainText('1.1.0');
  await expect(versions).toContainText('sha256:');
  await versions
    .getByRole('listitem')
    .filter({ hasText: '1.0.0' })
    .getByRole('button', { name: 'Pin this version' })
    .click();
  await expect(versions.getByRole('listitem').filter({ hasText: '1.0.0' })).toContainText(
    'Approved and delivered',
  );

  // Nothing reaches the members until the audience says so: all members, except those set to No.
  const access = page.getByRole('region', { name: 'Access' });
  await access.getByRole('combobox', { name: 'Audience' }).selectOption('all');
  await access.getByRole('button', { name: 'Save audience' }).click();
  await expect(access).toContainText('including members who join later');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Access' }).getByRole('combobox', { name: 'Audience' }),
  ).toHaveValue('all');

  // What the owner receives: the pinned version, not the newer one.
  await page.goto('/skills');
  await page.getByRole('link', { name: 'My delivered skills' }).click();
  const delivered = page.getByRole('list', { name: 'Delivered skills' });
  await expect(delivered).toContainText('review-pr');
  await expect(delivered).toContainText('1.0.0');
  await expect(delivered).not.toContainText('1.1.0');

  // Unpinned, it is delivered to nobody; the catalog says so.
  await page.goto('/skills/review-pr');
  await page.getByRole('button', { name: 'Unpin (stop delivery)' }).click();
  await expect(page.getByRole('button', { name: 'Unpin (stop delivery)' })).toHaveCount(0);
  await page.goto('/skills');
  await expect(row).toContainText('Not pinned: not delivered');
});

test('an owner reads a hook’s code before pinning it, then decides who runs it', async ({ page }) => {
  expect(await served(page, 'GET', '/api/v1/hooks')).toBe(true);
  await ownerOfNewOrganization(page, 'hana');
  await publishHook(page, 'check-status', '1.0.0');

  await page.goto('/hooks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Team hooks');
  await page.getByRole('link', { name: 'check-status' }).click();
  const versions = page.getByRole('list', { name: 'Versions of check-status' });
  await expect(versions).toContainText('runs bin/check.sh, 20 s');

  // The code first: the definition and the script, read in full, then back to pin.
  await versions.getByRole('link', { name: 'Read the files of version 1.0.0' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hook check-status 1.0.0');
  await expect(page.getByRole('region', { name: 'bin/check.sh' })).toContainText('echo checked');
  await page.getByRole('link', { name: 'Back to the hook' }).click();
  await page.getByRole('button', { name: 'Pin this version' }).click();
  await expect(versions).toContainText('Approved and delivered');

  // Only a member set to Yes receives it: the owner decides for themself.
  const members = page.getByRole('list', { name: 'Decision of each member' });
  await members.getByRole('combobox').first().selectOption('allow');
  await members.getByRole('button', { name: 'Save' }).first().click();
  await expect(members.getByRole('combobox').first()).toHaveValue('allow');
  await page.goto('/hooks');
  await page.getByRole('link', { name: 'My delivered hooks' }).click();
  await expect(page.getByRole('list', { name: 'Delivered hooks' })).toContainText('check-status');
});

test('a member’s personal skill stays theirs until an administrator promotes it', async ({
  page,
  browser,
}) => {
  expect(await served(page, 'GET', '/api/v1/skills')).toBe(true);
  const owner = await ownerOfNewOrganization(page, 'olga');
  const member = await anotherPerson(browser);
  await joinAs(page, owner.id, member, 'mia', 'member');
  const published = await callFromPage(
    member,
    'POST',
    '/api/v1/me/skills/mia-notes/versions',
    { version: '0.1.0', files: [{ path: 'SKILL.md', contentBase64: base64('# notes\n') }] },
    owner.id,
  );
  expect(published.status).toBe(201);

  // The member sees it at their own screen, and is sent there from the catalog they may not read.
  await member.goto('/me/skills');
  await expect(member.getByRole('list', { name: 'Personal skills' })).toContainText('mia-notes');
  await member.goto('/skills');
  await expect(member.getByRole('heading', { level: 1 })).toHaveText('Delivered skills');
  expect((await callFromPage(member, 'GET', '/api/v1/skills', undefined, owner.id)).status).toBe(403);

  // The owner sees it in the catalog as a personal skill, and promotes it.
  await page.goto('/skills');
  const row = page
    .getByRole('list', { name: 'Skills' })
    .getByRole('listitem')
    .filter({ hasText: 'mia-notes' });
  await expect(row).toContainText('Personal');
  await row.getByRole('link', { name: 'mia-notes' }).click();
  await page.getByRole('button', { name: 'Promote to the team' }).click();
  await page.getByRole('button', { name: 'Promote mia-notes to the team' }).click();
  await expect(page.getByRole('region', { name: 'Access' })).toBeVisible();
  await page.goto('/skills');
  await expect(row).not.toContainText('Personal');
  await expect(row).toContainText('Not pinned: not delivered');
});

test('another organization never sees the first one’s skills or hooks', async ({ page }) => {
  expect(await served(page, 'GET', '/api/v1/skills')).toBe(true);
  expect(await served(page, 'GET', '/api/v1/hooks')).toBe(true);
  const ada = await ownerOfNewOrganization(page, 'ada');
  await publishSkill(page, 'vault-review', '1.0.0');
  await publishHook(page, 'vault-check', '1.0.0');
  await page.goto('/skills');
  await expect(page.getByRole('list', { name: 'Skills' })).toContainText('vault-review');
  await page.goto('/hooks');
  await expect(page.getByRole('list', { name: 'Hooks' })).toContainText('vault-check');

  // Someone else, in their own organization: none of it shows, and none of it answers.
  await ownerOfNewOrganization(page, 'bea');
  await page.goto('/skills');
  await expect(page.getByText('No skill has been published yet.')).toBeVisible();
  await expect(page.getByText('vault-review')).toHaveCount(0);
  await page.goto('/hooks');
  await expect(page.getByText('No hook has been published yet.')).toBeVisible();
  await expect(page.getByText('vault-check')).toHaveCount(0);
  for (const path of [
    '/api/v1/skills/vault-review/versions',
    '/api/v1/skills/vault-review/assignments',
    '/api/v1/hooks/vault-check/versions',
    '/api/v1/hooks/vault-check/versions/1.0.0',
    '/api/v1/hooks/vault-check/assignments',
  ]) {
    expect((await callFromPage(page, 'GET', path)).status, `GET ${path}`).toBe(404);
  }
  expect(
    (await callFromPage(page, 'PUT', '/api/v1/skills/vault-review/pin', { version: '1.0.0' })).status,
  ).toBe(404);
  expect(
    (await callFromPage(page, 'PUT', '/api/v1/hooks/vault-check/pin', { version: '1.0.0' })).status,
  ).toBe(404);
  // Naming the first organization does not open it: the person is not in it, and the answer does not say it exists.
  for (const path of ['/api/v1/skills', '/api/v1/hooks', '/api/v1/skills/vault-review/versions']) {
    expect((await callFromPage(page, 'GET', path, undefined, ada.id)).status, `GET ${path}`).toBe(404);
  }
});
