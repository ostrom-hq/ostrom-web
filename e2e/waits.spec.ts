// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('a person reads what waits for them, opens one and answers it in place', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'Waiting for you 3 open');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Waiting for you');
  await page.getByRole('link', { name: /Which region first\?/ }).click();
  const form = page.getByRole('form', { name: 'Your answer' });
  await form.getByRole('radio', { name: 'us' }).check();
  await form.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('region', { name: 'Answer' })).toContainText('Done, by you');
  await expect(page.getByRole('region', { name: 'Answer' })).toContainText('us');
});

test('an answer that misses a required field is refused before anything is sent', async ({ page }) => {
  await page.goto('/waits/0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a01');
  const form = page.getByRole('form', { name: 'Your answer' });
  await form.getByRole('button', { name: 'Approve' }).click();
  await expect(form.getByRole('alert')).toHaveText('Fill this in to go on.');
});

test('another organization never shows Acme’s waits', async ({ page }) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/waits');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  await expect(page.getByText('Nothing is waiting')).toBeVisible();
  await expect(page.getByText('Ship the ledger migration to production?')).toHaveCount(0);
});

test('a secret is typed masked, sent with the answer and never shown again', async ({ page }) => {
  const secret = 'sentinel-hunter2-4f9c';
  await page.goto('/waits/0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a01');
  const form = page.getByRole('form', { name: 'Your answer' });
  const token = form.getByLabel('Deploy token');
  await expect(token).toHaveAttribute('type', 'password');
  await form.getByLabel('Reason').fill('Looks right');
  await form.getByLabel('Screenshot').fill('shot.png');
  await token.fill(secret);
  await form.getByRole('button', { name: 'Approve' }).click();
  const outcome = page.getByRole('region', { name: 'Answer' });
  await expect(outcome).toContainText('Deploy token');
  await expect(outcome).toContainText('Provided');
  await expect(outcome).toContainText('shot.png');
  expect(await page.content()).not.toContain(secret);
  expect(page.url()).not.toContain(secret);
  const stored = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(stored).not.toContain(secret);
});
