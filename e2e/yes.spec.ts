// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an approver opens a request from the queue, reads the proof, approves and gets the signed receipt', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Requests' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await expect(page.getByText('Approving as Maya Lind (maya)')).toBeVisible();

  await page.getByRole('link', { name: /Merge PR #412 into main/ }).click();
  await expect(page).toHaveURL(/\/yes\/apr-merge-412$/);
  await expect(page.getByText('fix(invoices): round VAT per line')).toBeVisible();
  await page.getByRole('button', { name: /^Approve/ }).click();

  const decision = page.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText('maya approved: Merge PR #412 into main');
  await decision.getByText('Verify the receipt').click();
  await expect(decision).toContainText('ostrom verify rcpt-apr-merge-412');

  await page.getByRole('link', { name: 'All requests' }).click();
  await expect(page.getByRole('heading', { name: '1 waiting for you' })).toBeVisible();
});

test('the asker cannot approve while another approver exists, but can decline with what to do instead', async ({
  page,
}) => {
  await page.goto('/yes/apr-deploy-88');
  await expect(page.getByText('You asked for this yourself.')).toBeVisible();

  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByRole('alert')).toContainText('samir has to approve it');

  await page.getByRole('button', { name: 'Decline & tell the agent…' }).click();
  await page.getByRole('textbox', { name: 'What should the agent do instead?' }).fill('Wait for samir.');
  await page.getByRole('button', { name: 'Decline and send' }).click();
  const decision = page.getByRole('region', { name: 'Decision' });
  await expect(decision).toContainText('maya declined: Deploy');
  await expect(decision).toContainText('Wait for samir.');
});

test('a sign-in link keeps the token in memory and leaves no trace in the address bar or storage', async ({
  page,
}) => {
  await page.goto('/yes#signin=opk_e2e_token_123');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await expect(page).toHaveURL(/\/yes$/);
  const { origins } = await page.context().storageState();
  const stored = origins.flatMap((origin) => origin.localStorage).map((entry) => entry.value);
  expect(stored.some((value) => value.includes('opk_e2e_token_123'))).toBe(false);
});

test('a yes from a sign-in five minutes old asks to sign in again, then goes through', async ({ page }) => {
  await page.clock.install();
  await page.goto('/yes/apr-merge-412');
  await expect(page.getByText('fix(invoices): round VAT per line')).toBeVisible();
  // The demo signed in when it opened: six minutes later, a yes needs a fresh sign-in (S2-54).
  await page.clock.fastForward('06:00');
  await page.getByRole('button', { name: /^Approve/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('your sign-in is more than five minutes old');
  await alert.getByRole('link', { name: 'Sign in again' }).click();
  await expect(page).toHaveURL(/\/signin\?redirect=%2Fyes%2Fapr-merge-412$/);

  await page.getByRole('textbox', { name: 'Your e-mail address' }).fill('maya@acme.dev');
  await page.getByRole('button', { name: 'E-mail me a link' }).click();
  await page.goto('/auth/email#token=ml_demo');
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await page.getByRole('link', { name: /Merge PR #412 into main/ }).click();
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(
    'maya approved: Merge PR #412 into main',
  );
});
