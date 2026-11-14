// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an administrator pins a skill, delivers it to everyone, and reads a hook’s code before pinning it', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Skills');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Skill catalog');
  const row = page
    .getByRole('list', { name: 'Skills' })
    .getByRole('listitem')
    .filter({ hasText: 'release-notes' });
  await expect(row).toContainText('Not pinned: not delivered');
  await row.getByRole('link', { name: 'release-notes' }).click();
  await page.getByRole('button', { name: 'Pin this version' }).click();
  await expect(page.getByRole('list', { name: 'Versions of release-notes' })).toContainText(
    'Approved and delivered',
  );
  const access = page.getByRole('region', { name: 'Access' });
  await access.getByRole('combobox', { name: 'Audience' }).selectOption('all');
  await access.getByRole('button', { name: 'Save audience' }).click();
  await expect(access).toContainText('including members who join later');

  await openScreen(page, 'Hooks');
  await page.getByRole('link', { name: 'audit-tools' }).click();
  await page.getByRole('link', { name: 'Read the files of version 0.1.0' }).click();
  await expect(page.getByRole('region', { name: 'audit.sh' })).toContainText('echo audit');
  await page.getByRole('link', { name: 'Back to the hook' }).click();
  await page.getByRole('button', { name: 'Pin this version' }).click();
  await expect(page.getByRole('list', { name: 'Versions of audit-tools' })).toContainText(
    'Approved and delivered',
  );
});
