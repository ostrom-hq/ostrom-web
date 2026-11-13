// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner reviews the rules and finds the signed decision', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Rules');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rules');

  const review = page.locator('article').filter({ hasText: 'one review from an owner' });
  await review.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('button', { name: 'To review 1' })).toBeVisible();

  await openScreen(page, 'Decisions');
  const latest = page.getByRole('link', { name: /maya accepted the rule/ });
  await expect(latest).toBeVisible();
  await latest.click();
  await expect(page).toHaveURL(/\/receipts\/rcpt-dec-/);
});

test('an owner writes a rule that puts a gate, then deletes another one', async ({ page }) => {
  await page.goto('/rules');
  await page.getByRole('button', { name: 'New rule' }).click();
  const form = page.getByRole('region', { name: 'A new rule' });
  await form.getByRole('textbox', { name: 'Rule' }).fill('A deploy waits for a yes from a release owner.');
  await form.getByRole('combobox', { name: 'Group' }).fill('Releases');
  await form.getByRole('combobox', { name: 'What it does' }).selectOption('gate');
  const gate = form.getByRole('group', { name: 'Gate' });
  await gate.getByRole('checkbox', { name: /Deploy/ }).check();
  await gate.getByRole('textbox', { name: 'Who may say yes' }).fill('samir');
  await gate.getByRole('button', { name: 'Add a check' }).click();
  await gate.getByRole('textbox', { name: 'Check 1' }).fill('n-tests');
  await gate.getByRole('checkbox', { name: 'Only a run on a runner or in CI counts' }).check();
  await form.getByRole('button', { name: 'Add the rule' }).click();

  const written = page.locator('article').filter({ hasText: 'A deploy waits for a yes' });
  await expect(written).toContainText('Gate: Deploy, waits for a yes from samir');
  await expect(written).toContainText('Needs: n-tests (runner or CI)');

  await page.getByRole('button', { name: /^To review/ }).click();
  const tests = page.locator('article').filter({ hasText: 'Run `pnpm test`' });
  await tests.getByRole('button', { name: 'Delete' }).click();
  await tests.getByRole('button', { name: 'Delete this rule' }).click();
  await expect(page.getByRole('button', { name: 'To review 1' })).toBeVisible();
});
