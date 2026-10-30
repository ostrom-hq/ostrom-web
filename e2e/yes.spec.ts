import { expect, test } from '@playwright/test';

test('an approver opens a request from the queue, says yes and gets the signed receipt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Approvals' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Waiting for your yes');
  await expect(page.getByText('signed as maya · approver account')).toBeVisible();

  await page.getByRole('link', { name: /Merge a pull request/ }).click();
  await expect(page).toHaveURL(/\/yes\/ask-merge-412$/);
  await expect(page.getByText('gh pr merge 412 --squash')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, run it' }).click();

  const receipt = page.getByRole('region', { name: 'Signed receipt' });
  await expect(receipt).toContainText('Yes from maya');
  await expect(receipt).toContainText('signature valid');

  await page.getByRole('link', { name: 'Back to the queue' }).click();
  await expect(page.getByRole('heading', { name: '1 waiting' })).toBeVisible();
});

test('the author of a request cannot approve it while another approver exists, but can refuse it', async ({
  page,
}) => {
  await page.goto('/yes/ask-deploy-88');
  await expect(page.getByText('You asked for this action: samir has to approve it.')).toBeVisible();

  await page.getByRole('button', { name: 'Yes, run it' }).click();
  await expect(page.getByRole('alert')).toContainText('refused by Ostrom');

  await page.getByRole('button', { name: 'No' }).click();
  await expect(page.getByRole('region', { name: 'Signed receipt' })).toContainText('No from maya');
});

test('a sign-in link keeps the token and leaves no trace in the address bar', async ({ page }) => {
  await page.goto('/yes?signin=opk_e2e_token_123');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Waiting for your yes');
  await expect(page).toHaveURL(/\/yes$/);
  expect(await page.evaluate(() => window.localStorage.getItem('ostrom.token'))).toBe('opk_e2e_token_123');
});
