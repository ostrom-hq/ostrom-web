// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { callFromPage, freshEmail, signIn } from './real';

/*
 * Web audit 2, M3 (ostrom-server#150): a sensitive write from the console needs a sign-in less than five minutes old.
 * The journey waits it out for real, against the server's own clock: nothing in the server can be set older.
 */
const STEP_UP_WITHIN_MS = 5 * 60_000;

test('a token asked for from a sign-in more than five minutes old asks to sign in again, then comes back to finish', async ({
  page,
}) => {
  test.setTimeout(STEP_UP_WITHIN_MS + 4 * 60_000);
  const email = freshEmail('vera');
  await signIn(page, email);
  // The sign-in grows older than five minutes; the session itself stays open.
  await page.waitForTimeout(STEP_UP_WITHIN_MS + 20_000);

  await page.goto('/tokens');
  const name = `Stale ${Date.now().toString(36)}`;
  const form = page.getByRole('region', { name: 'New token' });
  await form.getByRole('textbox', { name: 'Name' }).fill(name);
  await form.getByRole('checkbox', { name: 'Receipts: Read' }).check();
  await form.getByRole('button', { name: 'Create the token' }).click();
  const said = form.getByRole('alert');
  await expect(said).toContainText('This change needs a sign-in less than five minutes old.');
  const tokens = async (): Promise<string[]> => {
    const listed = await callFromPage(page, 'GET', '/api/v1/tokens');
    expect(listed.status).toBe(200);
    return (listed.body as { tokens: { name: string }[] }).tokens.map((token) => token.name);
  };
  // Refused by the server, not only said: no token was made.
  expect(await tokens()).not.toContain(name);

  // The link starts a fresh sign-in that comes back to the tokens.
  await said.getByRole('link', { name: 'Sign in again' }).click();
  await expect(page).toHaveURL(/\/signin\?redirect=%2Ftokens$/);
  await signIn(page, email, '/tokens');

  // Signed in a moment ago: the same write goes through.
  await page.getByRole('region', { name: 'New token' }).getByRole('textbox', { name: 'Name' }).fill(name);
  await page
    .getByRole('region', { name: 'New token' })
    .getByRole('checkbox', { name: 'Receipts: Read' })
    .check();
  await page
    .getByRole('region', { name: 'New token' })
    .getByRole('button', { name: 'Create the token' })
    .click();
  await expect.poll(tokens).toContain(name);
  await expect(page.getByText('This change needs a sign-in less than five minutes old.')).toHaveCount(0);
});
