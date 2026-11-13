// SPDX-License-Identifier: Apache-2.0
// Journeys against the REAL Ostrom server (CI job `ci`, after the mock journeys): the console is served by `vite
// preview`, which proxies /api to the server, so the session cookie and its CSRF token are first-party, as behind the
// console image. Sign-in links are read from the directory the server writes its mails to (OSTROM_MAIL_DIR).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  request,
  test,
} from '@playwright/test';
import { z } from 'zod';

const mailDir = process.env['OSTROM_E2E_MAIL_DIR'] ?? '';

/** A fresh address per journey: no two journeys share a person. */
export function freshEmail(who: string): string {
  // A domain of its own: the server gives one free organization per company domain (`freeClaimOf`), so people of one
  // shared domain could not each create theirs.
  const run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${who}-${run}@${run}.e2e.ostrom.test`;
}

/** The token of the newest sign-in mail to `email`, if the server wrote one. */
export function signInToken(email: string): string | undefined {
  const mails = readdirSync(mailDir)
    .map((name) => join(mailDir, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => ({ at: statSync(path).mtimeMs, text: readFileSync(path, 'utf8') }))
    // The server writes `To: …`, `Subject: …`, a blank line, the text.
    .filter((mail) =>
      (mail.text.split('\n\n')[0] ?? '').toLowerCase().split('\n').includes(`to: ${email.toLowerCase()}`),
    )
    .sort((a, b) => b.at - a.at);
  for (const mail of mails) {
    // Followed by the end of its line: a mail still being written is not read with half a token.
    const token = /#token=([A-Za-z0-9._~%-]+)\s/.exec(mail.text)?.[1];
    if (token !== undefined) return decodeURIComponent(token);
  }
  return undefined;
}

// The people of this run so far: each gets the next address.
let people = 0;

/**
 * An address of its own for one person, in 10.0.0.0/8: unique in the run and the same from one run to the next. The
 * server limits e-mailed sign-in links per source address (10 every 15 minutes, `RequestMagicLinkUseCaseImpl`), and
 * every journey reaches it from the same machine: each person then reads as their own network, as people do. The
 * server believes `X-Forwarded-For` only from a trusted proxy (`OSTROM_TRUSTED_PROXIES`: the runner's loopback, from
 * which `vite preview` proxies /api, in ostrom-server's `console-journey.yml`); elsewhere it is ignored.
 */
export function addressOfAPerson(): string {
  people += 1;
  return `10.${String((people >> 16) & 255)}.${String((people >> 8) & 255)}.${String(people & 255)}`;
}

/**
 * Signs `email` in through the console: the form, the e-mailed link, then the screen it was asked from (`back`, the
 * queue by default), as a person signing in again from a screen that asked them to comes back to it.
 */
export async function signIn(page: Page, email: string, back = '/yes'): Promise<void> {
  // Every request of this person's browser, the console's calls through the proxy and `page.request` included, comes
  // from their own address.
  await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': addressOfAPerson() });
  // The screen asked for: the server sends a sign-in without a path to `/` (`safeRedirectPath`).
  await page.goto(`/signin?redirect=${encodeURIComponent(back)}`);
  await page.getByRole('textbox', { name: 'Your e-mail address' }).fill(email);
  await page.getByRole('button', { name: 'E-mail me a link' }).click();
  const said = page.getByRole('alert');
  await expect(said).not.toHaveText('');
  // The server counts every journey as one source: its trusted proxies do not include this runner's loopback.
  if ((await said.textContent())?.includes('Too many attempts') === true)
    throw new Error(
      'The server limits sign-ins from this runner: give its loopback to OSTROM_TRUSTED_PROXIES (console-journey.yml).',
    );
  await expect(said).toContainText(`If ${email} may sign in, a link is on its way.`);
  let token: string | undefined;
  await expect
    .poll(() => {
      token = signInToken(email);
      return token;
    })
    .toBeDefined();
  await page.goto(`/auth/email#token=${encodeURIComponent(token ?? '')}`);
  // A page already signed in is asked before the link replaces its session (login CSRF): say yes.
  const ask = page.getByRole('button', { name: 'Sign in with the link' });
  const arrived = (): boolean => new URL(page.url()).pathname === back;
  await expect.poll(async () => arrived() || (await ask.isVisible())).toBe(true);
  if (!arrived()) await ask.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(back);
}

/** Whether the server serves `path` at all: anything but 404 and 405, signed out. */
export async function served(page: Page, method: string, path: string): Promise<boolean> {
  const response = await page.request.fetch(path, { method, failOnStatusCode: false });
  return response.status() !== 404 && response.status() !== 405;
}

/**
 * A value as JSON, for a failure's message. What a generated zod schema parsed may hold a `bigint` (an `int64` such as
 * `AuditEvent.sequence`), which `JSON.stringify` refuses with a TypeError that would hide the real failure: it is
 * written as its digits.
 */
export function shown(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item));
}

/**
 * Calls the API from the page, as the console does: same origin, the session cookie and its CSRF token, and the
 * organization it acts in (`Ostrom-Org`) when one is named.
 */
export async function callFromPage(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  org?: string,
): Promise<{ status: number; body: unknown }> {
  const csrf = (await page.context().cookies()).find((cookie) =>
    /^(?:__Host-)?ostrom_csrf$/.test(cookie.name),
  )?.value;
  const answer = await page.evaluate(
    async ({ method, path, body, csrf, org }) => {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (org !== undefined) headers['Ostrom-Org'] = org;
      if (csrf !== undefined) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(path, {
        method,
        headers,
        credentials: 'include',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, text: await response.text() };
    },
    { method, path, body, csrf, org },
  );
  return { status: answer.status, body: bodyOf(`${method} ${path}`, answer.status, answer.text) };
}

/**
 * An answer's body, read in Node. A success (2xx but 204) must be JSON: the callers read fields from it, so a page of
 * text or an empty body fails here, at its cause. A refusal may be a proxy's page of text: it is kept, cut short, so
 * its status and words show in the failure.
 */
export function bodyOf(call: string, status: number, text: string): unknown {
  const shown = text.length > 300 ? `${text.slice(0, 300)}…` : text;
  let parsed: { json: unknown } | undefined;
  try {
    parsed = text === '' ? undefined : { json: JSON.parse(text) };
  } catch {
    parsed = undefined;
  }
  const success = status >= 200 && status < 300 && status !== 204;
  if (success && parsed === undefined) {
    throw new Error(
      `${call} answered ${String(status)} without a JSON body: ${shown === '' ? '(empty)' : shown}`,
    );
  }
  if (parsed !== undefined) return parsed.json;
  return shown === '' ? undefined : shown;
}

const others: BrowserContext[] = [];

/**
 * A second person's browser: its own cookies, the same console on the same device as the project (a Pixel 7 in
 * `mobile`). Playwright traces it with the test's own page (`trace` of the config, which it starts on every context
 * of the `browser` fixture: starting it here again fails). A spec that uses it calls `closeOthers` after each test.
 */
export async function anotherPerson(browser: Browser): Promise<Page> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale } =
    test.info().project.use;
  const context = await browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(viewport === undefined ? {} : { viewport }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
    ...(isMobile === undefined ? {} : { isMobile }),
    ...(hasTouch === undefined ? {} : { hasTouch }),
    ...(locale === undefined ? {} : { locale }),
  });
  others.push(context);
  return context.newPage();
}

/** Closes the other people's browsers; Playwright keeps their traces with the test's when it failed. */
export async function closeOthers(): Promise<void> {
  for (const context of others.splice(0)) await context.close();
}

/**
 * A new person signed in with an organization of their own, which they own; returns its id and short name, and the
 * address the person signed in with (verified by the sign-in link).
 */
export async function ownerOfNewOrganization(
  page: Page,
  who: string,
): Promise<{ id: string; slug: string; email: string }> {
  const email = freshEmail(who);
  await signIn(page, email);
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `${who} ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
  const { id, slug } = created.body as { id: string; slug: string };
  return { id, slug, email };
}

/**
 * Brings a new person into `org` with `role`, as an owner does: an invitation link, then its token accepted by the
 * new person, signed in in `joiner`.
 */
export async function joinAs(
  owner: Page,
  org: string,
  joiner: Page,
  who: string,
  role: string,
): Promise<void> {
  const token = await invitationTo(owner, org, role);
  await signIn(joiner, freshEmail(who));
  await accept(joiner, token);
}

/** An invitation link to `org` with `role`, made by an owner: its token. */
export async function invitationTo(owner: Page, org: string, role: string): Promise<string> {
  const link = await callFromPage(owner, 'POST', `/api/v1/orgs/${org}/invitations/links`, {
    role,
    maxUses: 1,
  });
  expect(link.status).toBe(201);
  const token = /token=([^&#\s]+)/.exec((link.body as { url: string }).url)?.[1];
  expect(token).toBeDefined();
  return decodeURIComponent(token ?? '');
}

/** The person signed in in `joiner` joins with an invitation's token. */
export async function accept(joiner: Page, token: string): Promise<void> {
  const accepted = await callFromPage(joiner, 'POST', '/api/v1/invitations/accept', { token });
  expect(accepted.status).toBe(200);
}

/** What the journeys read of the device flow's answers (core `DeviceCode`, `AuthToken`). */
const DEVICE_CODE = z.object({ deviceCode: z.string(), userCode: z.string() });
const AUTH_TOKEN = z.object({ token: z.string() });

/** The governance write scopes of `ostrom login --admin` (core `DeviceLoginStart`). */
/** The scopes `ostrom login --admin` asks for. */
export const ADMIN_SCOPES = ['policy:write', 'harness:write', 'gates:policy'];

/**
 * A CLI token, obtained as `ostrom login` does: the device flow started without a session, approved by the person
 * signed in in `page` (in `org`), then exchanged for the token. `admin` asks for the governance scopes, as
 * `ostrom login --admin`. Undefined when the server refuses the start (a server without the admin login yet).
 */
export async function cliToken(
  page: Page,
  org: string,
  kind: 'admin' | 'device',
): Promise<string | undefined> {
  const cli = await cliContext();
  try {
    const start = await cli.post('/api/v1/auth/device', {
      data: kind === 'admin' ? { scopes: ADMIN_SCOPES } : {},
      failOnStatusCode: false,
    });
    if (start.status() !== 200) return undefined;
    const { deviceCode, userCode } = DEVICE_CODE.parse(await start.json());
    const answered = await callFromPage(
      page,
      'POST',
      '/api/v1/auth/device/answer',
      { userCode, approve: true },
      org,
    );
    expect(answered.status).toBe(204);
    const token = await cli.post('/api/v1/auth/device/token', { data: { deviceCode } });
    expect(token.status()).toBe(200);
    return AUTH_TOKEN.parse(await token.json()).token;
  } finally {
    await cli.dispose();
  }
}

/** A client of its own, as the CLI is: no cookie of the browser, only `Authorization: Bearer`. */
async function cliContext(): Promise<APIRequestContext> {
  const { baseURL } = test.info().project.use;
  return request.newContext(baseURL === undefined ? {} : { baseURL });
}

/** Calls the API as the CLI does with `token`, in `org`. */
export async function callAsCli(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  org?: string,
): Promise<{ status: number; body: unknown }> {
  const cli = await cliContext();
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: 'application/json' };
    if (org !== undefined) headers['Ostrom-Org'] = org;
    const response = await cli.fetch(path, {
      method,
      headers,
      ...(body === undefined ? {} : { data: body }),
      failOnStatusCode: false,
    });
    const text = await response.text();
    const parsed: unknown = text === '' ? undefined : JSON.parse(text);
    return { status: response.status(), body: parsed };
  } finally {
    await cli.dispose();
  }
}
