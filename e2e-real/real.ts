// SPDX-License-Identifier: AGPL-3.0-only
// Journeys against the REAL Ostrom server (CI job `ci`, after the mock journeys): the console is served by `vite
// preview`, which proxies /api to the server, so the session cookie and its CSRF token are first-party, as behind the
// console image. Sign-in links are read from the directory the server writes its mails to (OSTROM_MAIL_DIR).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

const mailDir = process.env['OSTROM_E2E_MAIL_DIR'] ?? '';

/** A fresh address per journey: no two journeys share a person. */
export function freshEmail(who: string): string {
  return `${who}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@e2e.ostrom.test`;
}

/** The header lines of a mail, lower-cased: everything before the first blank line. */
function headersOf(text: string): string[] {
  return (text.split('\n\n')[0] ?? '').toLowerCase().split('\n');
}

/** The token of the newest sign-in mail to `email`, if the server wrote one. */
function signInToken(email: string): string | undefined {
  const mails = readdirSync(mailDir)
    .map((name) => join(mailDir, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => ({ at: statSync(path).mtimeMs, text: readFileSync(path, 'utf8').replace(/\r\n/g, '\n') }))
    .filter((mail) => headersOf(mail.text).includes(`to: ${email.toLowerCase()}`))
    .sort((a, b) => b.at - a.at);
  for (const mail of mails) {
    const token = /#token=([A-Za-z0-9._~%-]+)/.exec(mail.text)?.[1];
    if (token !== undefined) return decodeURIComponent(token);
  }
  return undefined;
}

/** Signs `email` in through the console: the form, the e-mailed link, the queue. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/signin');
  await page.getByRole('textbox', { name: 'Your e-mail address' }).fill(email);
  await page.getByRole('button', { name: 'E-mail me a link' }).click();
  await expect(page.getByRole('alert')).toContainText(`If ${email} may sign in, a link is on its way.`);
  let token: string | undefined;
  await expect
    .poll(() => {
      token = signInToken(email);
      return token;
    })
    .toBeDefined();
  await page.goto(`/auth/email#token=${encodeURIComponent(token ?? '')}`);
  await expect(page).toHaveURL(/\/yes$/);
}

/** Whether the server serves `path` at all: anything but 404 and 405, signed out. */
export async function served(page: Page, method: string, path: string): Promise<boolean> {
  const response = await page.request.fetch(path, { method, failOnStatusCode: false });
  return response.status() !== 404 && response.status() !== 405;
}

/** Calls the API from the page, as the console does: same origin, the session cookie and its CSRF token. */
export async function callFromPage(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const csrf = (await page.context().cookies()).find((cookie) =>
    /^(?:__Host-)?ostrom_csrf$/.test(cookie.name),
  )?.value;
  return page.evaluate(
    async ({ method, path, body, csrf }) => {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (csrf !== undefined) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(path, {
        method,
        headers,
        credentials: 'include',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
    },
    { method, path, body, csrf },
  );
}
