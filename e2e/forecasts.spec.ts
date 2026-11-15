// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('an owner reads each window of a subscription, switches account, and pauses the live updates', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Forecasts');
  await expect(page.getByRole('heading', { level: 1, name: 'Forecasts' })).toBeVisible();
  const five = page.getByRole('region', { name: 'five_hour' });
  await expect(five.getByText('Threshold before the reset')).toBeVisible();
  await expect(five.getByRole('img', { name: 'five_hour: readings and projection' })).toBeVisible();
  await expect(five.getByTestId('measured')).toHaveCount(2);
  await expect(five.getByTestId('projection')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'model:opus' }).getByText('Rate unknown')).toBeVisible();

  await page.getByRole('combobox', { name: 'Subscription account' }).selectOption('acc-2');
  await expect(page).toHaveURL(/\?account=acc-2$/);
  await expect(page.getByText('Idle: no measured burn')).toBeVisible();
  await expect(page.getByText('Exhausted: threshold reached')).toBeVisible();

  await page.getByRole('button', { name: 'Pause live updates' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Live updates paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume live updates' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Live updates on' })).toBeVisible();
});

test('a member never sees the link, and the page tells them it is for owners and admins', async ({
  page,
}) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.role', 'member')");
  await page.goto('/forecasts');
  await expect(page.getByText('Owners and admins only')).toBeVisible();
  await expect(page.getByRole('region', { name: 'five_hour' })).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Forecasts', exact: true }),
  ).toHaveCount(0);
});

test('another organization never shows the first one’s accounts, by its list or by an id', async ({
  page,
}) => {
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  await page.goto('/forecasts?account=acc-1');
  await page
    .getByRole('dialog', { name: 'Which organization?' })
    .getByRole('button', { name: 'Globex' })
    .click();
  await expect(page.getByText('No such account')).toBeVisible();
  await expect(page.getByText('Maya’s Claude Max')).toHaveCount(0);
  await page.getByRole('link', { name: 'Show the first account' }).click();
  await expect(page.getByText('No shared subscription yet')).toBeVisible();
  await expect(page.getByRole('option', { name: /Maya’s Claude Max/ })).toHaveCount(0);
});
