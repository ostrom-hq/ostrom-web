// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { openScreen } from './navigation';

test('a person chooses what they are told about and sends a test to their phones', async ({ page }) => {
  await page.goto('/');
  await openScreen(page, 'My notifications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My notifications');

  const switches = page.getByRole('region', { name: 'What you are told about' });
  const finished = switches
    .getByRole('group', { name: 'An agent finished its turn' })
    .getByRole('checkbox', { name: 'Push to your phones' });
  await expect(finished).not.toBeChecked();
  await finished.click();
  await expect(finished).toBeChecked();

  const phone = page.getByRole('region', { name: 'Approvals on your phone' });
  await phone.getByRole('checkbox', { name: 'A budget about to be reached' }).check();
  await phone.getByRole('checkbox', { name: 'No notifications during these hours' }).check();
  await phone.getByLabel('Time zone').fill('Europe/Paris');
  await phone.getByRole('button', { name: 'Save' }).click();
  await expect(phone.getByText('Saved.')).toBeVisible();

  const trial = page.getByRole('region', { name: 'Test' });
  await trial.getByRole('button', { name: 'Send a test notification' }).click();
  await expect(trial.getByText('Sent to 1 phone. It shows in a few seconds.')).toBeVisible();
  await expect(trial.getByRole('list', { name: 'Your phones' }).getByRole('listitem')).toHaveCount(2);
});
