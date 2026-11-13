// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { freshEmail, signIn } from './real';

test('someone signs in with an e-mailed link and holds an HttpOnly session the page cannot read', async ({
  page,
}) => {
  await signIn(page, freshEmail('maya'));
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name.includes('ostrom_session'));
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate<string>('document.cookie')).not.toMatch(/ostrom_session/);
  expect(page.url()).not.toContain('token=');
});
