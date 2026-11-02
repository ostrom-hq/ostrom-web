// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, signIn } from './real';

test('the owner renames the organization, then deletes it with its short name typed again', async ({
  page,
}) => {
  await signIn(page, freshEmail('ines'));
  const run = Date.now().toString(36);
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', { name: `Initech ${run}` });
  expect(created.status).toBe(201);
  const { slug } = created.body as { slug: string };

  await page.goto('/settings');
  const general = page.getByRole('region', { name: 'Organization' });
  await expect(general.getByText(slug, { exact: true })).toBeVisible();
  await general.getByRole('textbox', { name: 'Name' }).fill(`Initech Labs ${run}`);
  await general.getByRole('button', { name: 'Save the name' }).click();
  await expect(general.getByRole('alert')).toContainText(`Initech Labs ${run}`);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Organization' }).getByRole('textbox', { name: 'Name' }),
  ).toHaveValue(`Initech Labs ${run}`);

  const danger = page.getByRole('region', { name: 'Danger zone' });
  await danger.getByRole('textbox', { name: `Type ${slug} to confirm` }).fill(slug);
  await danger.getByRole('button', { name: `Delete Initech Labs ${run}` }).click();
  await expect(page).toHaveURL(/\/$/);
  const left = await callFromPage(page, 'GET', '/api/v1/orgs');
  expect(left.status).toBe(200);
  expect((left.body as { items: unknown[] }).items).toEqual([]);
});

test('a person creates a token, sees its secret once, and revokes it', async ({ page }) => {
  await signIn(page, freshEmail('theo'));
  // Until the kernel writes nulls (`explicitNulls`), the server leaves `lastUsedAt` out of a new token, and the
  // console refuses an answer the contract does not allow: the journey waits for that fix.
  const probe = await callFromPage(page, 'POST', '/api/v1/tokens', {
    name: 'probe',
    scopes: ['profile:read'],
  });
  expect(probe.status).toBe(201);
  const token = (probe.body as { token: Record<string, unknown> }).token;
  test.skip(!('lastUsedAt' in token), 'the server omits null fields of Token (explicitNulls)');
  expect((await callFromPage(page, 'DELETE', `/api/v1/tokens/${String(token['id'])}`)).status).toBe(204);

  await page.goto('/tokens');
  const form = page.getByRole('region', { name: 'New token' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Nightly CI');
  await form.getByRole('checkbox', { name: 'Receipts: Read' }).check();
  await form.getByRole('button', { name: 'Create the token' }).click();
  const secret = form.getByRole('textbox', { name: 'Secret of Nightly CI' });
  await expect(secret).toHaveValue(/\S{16,}/);
  await form.getByRole('button', { name: 'I copied it' }).click();
  await expect(secret).toHaveCount(0);

  const row = page.getByRole('listitem').filter({ hasText: 'Nightly CI' });
  await row.getByRole('button', { name: 'Revoke' }).click();
  await row.getByRole('button', { name: 'Revoke Nightly CI' }).click();
  await expect(row).toHaveCount(0);
});
