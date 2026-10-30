// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, served, signIn } from './real';

test('a person in two organizations chooses one, and every call then names it', async ({ page }) => {
  // `GET /me/organizations` and the 409 org_required come with ostrom-server#64; once it is on main, the repository
  // variable OSTROM_WEB_REQUIRE_ORGS makes a missing route a failure, not a skip.
  const required = process.env['OSTROM_E2E_REQUIRE_ORGS'] === 'true';
  test.skip(
    !required && !(await served(page, 'GET', '/api/v1/me/organizations')),
    'GET /api/v1/me/organizations not served yet',
  );
  await signIn(page, freshEmail('lena'));
  const run = Date.now().toString(36);
  const [acme, globex] = [`Acme ${run}`, `Globex ${run}`];
  const ids: string[] = [];
  for (const name of [acme, globex]) {
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
  await picker.getByRole('button', { name: globex }).click();
  await named;
  await expect(page.getByRole('button', { name: `Organization: ${globex}. Switch` })).toBeVisible();
});
