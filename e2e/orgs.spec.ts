// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

/** The demo's second organization (src/mocks/fixtures/organization.ts). */
const GLOBEX = '8c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

test('a person in two organizations is asked which one, and the console keeps acting in it', async ({
  page,
}) => {
  // Before the demo starts: its person is a member of Acme and Globex, so the server needs `Ostrom-Org`.
  await page.addInitScript("localStorage.setItem('ostrom.mock.memberships', 'two')");
  const named: string[] = [];
  page.on('request', (request) => {
    const header = request.headers()['ostrom-org'];
    if (request.url().includes('/api/v1/artifacts') && header !== undefined) named.push(header);
  });
  const study = page.getByRole('heading', { level: 3, name: 'Billing API: latency study' });

  await page.goto('/artifacts');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await picker.getByRole('button', { name: 'Globex' }).click();
  await expect(picker).toBeHidden();
  // Acme's artifacts are not Globex's: none of them shows.
  await expect(page.getByText('No artifact yet.')).toBeVisible();
  await expect(study).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Organization: Globex. Switch' })).toBeVisible();
  expect(named).toContain(GLOBEX);

  // A reload keeps acting in Globex: nothing to choose again.
  await page.reload();
  await expect(page.getByText('No artifact yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Organization: Globex. Switch' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Switching acts in the new one at once.
  await page.getByRole('button', { name: 'Organization: Globex. Switch' }).click();
  await expect(picker.getByRole('button', { name: 'Globex' })).toHaveAttribute('aria-current', 'true');
  await picker.getByRole('button', { name: 'Acme' }).click();
  await expect(page.getByRole('button', { name: 'Organization: Acme. Switch' })).toBeVisible();
  await expect(study).toBeVisible();
  await expect.poll(() => named.at(-1)).toBe(ACME);
});

test('a person in one organization is never asked, and the console names it', async ({ page }) => {
  await page.goto('/artifacts');
  await expect(page.getByRole('heading', { level: 3, name: 'Billing API: latency study' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Organization: Acme. Switch' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
