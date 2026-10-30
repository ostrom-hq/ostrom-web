// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

test('an approver opens a request from the queue, says yes and gets the signed receipt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Requests' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await expect(page.getByText('Approving as maya · approver account')).toBeVisible();

  await page.getByRole('link', { name: /Merge a pull request/ }).click();
  await expect(page).toHaveURL(/\/yes\/ask-merge-412$/);
  await expect(page.getByText('gh pr merge 412 --squash')).toBeVisible();
  await page.getByRole('button', { name: 'Approve merge' }).click();

  const receipt = page.getByRole('region', { name: 'Receipt' });
  await expect(receipt).toContainText('maya approved: Merge a pull request');
  await expect(receipt).toContainText('Signature verified');

  await page.getByRole('link', { name: 'All requests' }).click();
  await expect(page.getByRole('heading', { name: '1 waiting for you' })).toBeVisible();
});

test('the author of a request cannot approve it while another approver exists, but can decline it', async ({
  page,
}) => {
  await page.goto('/yes/ask-deploy-88');
  await expect(page.getByText('You asked for this action: samir has to approve it.')).toBeVisible();

  await page.getByRole('button', { name: 'Approve deployment' }).click();
  await expect(page.getByRole('alert')).toContainText('Not allowed');

  await page.getByRole('button', { name: 'Decline & tell the agent…' }).click();
  await page.getByRole('textbox', { name: 'What should the agent do instead?' }).fill('Wait for samir.');
  await page.getByRole('button', { name: 'Decline and send' }).click();
  const receipt = page.getByRole('region', { name: 'Receipt' });
  await expect(receipt).toContainText('maya declined: Deploy');
  await expect(receipt).toContainText('Wait for samir.');
});

test('a sign-in link keeps the token and leaves no trace in the address bar', async ({ page }) => {
  await page.goto('/yes?signin=opk_e2e_token_123');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await expect(page).toHaveURL(/\/yes$/);
  expect(await page.evaluate(() => window.localStorage.getItem('ostrom.token'))).toBe('opk_e2e_token_123');
});
