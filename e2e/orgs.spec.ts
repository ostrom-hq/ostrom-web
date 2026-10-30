// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

/** The demo's two organizations (src/mocks/fixtures/organization.ts). */
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';
const GLOBEX = '8c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

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

  await page.goto('/artifacts');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await expect(picker).toBeVisible();
  await picker.getByRole('textbox', { name: 'Organization id' }).fill('two words');
  await picker.getByRole('button', { name: 'Use this organization' }).click();
  await expect(picker.getByRole('alert')).toHaveText(/This is not an organization id\./);

  await picker.getByRole('textbox', { name: 'Organization id' }).fill(GLOBEX);
  await picker.getByRole('button', { name: 'Use this organization' }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'Billing API: latency study' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Organization: Globex. Switch' })).toBeVisible();

  // A reload keeps acting in Globex: nothing to choose again.
  await page.reload();
  await expect(page.getByRole('heading', { level: 3, name: 'Billing API: latency study' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Switching lists the organization already named, and acts in the new one at once.
  await page.getByRole('button', { name: 'Organization: Globex. Switch' }).click();
  await expect(picker.getByRole('button', { name: /Globex/ })).toHaveAttribute('aria-current', 'true');
  await picker.getByRole('textbox', { name: 'Organization id' }).fill(ACME);
  await picker.getByRole('button', { name: 'Use this organization' }).click();
  await expect(page.getByRole('button', { name: 'Organization: Acme. Switch' })).toBeVisible();
  expect(named).toContain(GLOBEX);
  await expect.poll(() => named.at(-1)).toBe(ACME);
});

test('a person in one organization is never asked, and the console names it', async ({ page }) => {
  await page.goto('/artifacts');
  await expect(page.getByRole('heading', { level: 3, name: 'Billing API: latency study' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Organization: Acme. Switch' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
