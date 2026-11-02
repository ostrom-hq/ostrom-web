// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, signIn } from './real';

test('an owner writes a rule by hand, finds it signed, and deletes it', async ({ page }) => {
  await signIn(page, freshEmail('rhea'));
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `Hooli ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
  // `POST /rules` comes with ostrom-server#76 and the gate with #79. Asked signed in, so the session filter cannot
  // hide a missing route: until the list answers, the journey is skipped.
  const listed = await callFromPage(page, 'GET', '/api/v1/rules');
  test.skip(listed.status !== 200, `GET /api/v1/rules answers ${listed.status.toString()}: not served yet`);

  await page.goto('/rules');
  await page.getByRole('button', { name: 'New rule' }).click();
  const form = page.getByRole('region', { name: 'A new rule' });
  const statement = `Read the runbook before a deploy (${Date.now().toString(36)}).`;
  await form.getByRole('textbox', { name: 'Rule' }).fill(statement);
  await form.getByRole('combobox', { name: 'Group' }).fill('Ops');
  await form.getByRole('button', { name: 'Add the rule' }).click();

  const written = page.locator('article').filter({ hasText: statement });
  await expect(written).toBeVisible();
  await expect(written).toContainText('Accepted');

  await written.getByRole('button', { name: 'Delete' }).click();
  await written.getByRole('button', { name: 'Delete this rule' }).click();
  await expect(page.locator('article').filter({ hasText: statement })).toHaveCount(0);
});
