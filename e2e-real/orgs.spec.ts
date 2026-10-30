// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

test('a person in two organizations chooses one, and every call then names it', async ({ page }) => {
  // `GET /me/organizations` and the 409 org_required come with ostrom-server#64.
  test.skip(
    !(await served(page, 'GET', '/api/v1/me/organizations')),
    'GET /api/v1/me/organizations not served yet',
  );
  await signIn(page, freshEmail('lena'));
  const names = [`Acme ${Date.now().toString(36)}`, `Globex ${Date.now().toString(36)}`];
  const ids: string[] = [];
  for (const name of names) {
    const created = await callFromPage(page, 'POST', '/api/v1/orgs', { name });
    expect(created.status).toBe(201);
    ids.push((created.body as { id: string }).id);
  }
  await page.goto('/artifacts');
  const picker = page.getByRole('dialog', { name: 'Which organization?' });
  await expect(picker).toBeVisible();
  const named = page.waitForRequest(
    (request) => request.url().includes('/api/v1/artifacts') && request.headers()['ostrom-org'] === ids[1],
  );
  await picker.getByRole('button', { name: names[1] }).click();
  await named;
  await expect(page.getByRole('button', { name: `Organization: ${names[1] ?? ''}. Switch` })).toBeVisible();
});
