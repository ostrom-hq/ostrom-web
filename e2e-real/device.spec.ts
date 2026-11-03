// SPDX-License-Identifier: AGPL-3.0-only
// Line 5.1 of the journey (demo/PARCOURS.md), console side, against the real server: `ostrom login` (RFC 8628). The CLI
// is played here by plain API calls with no cookie nor token, as the CLI makes them; the person answers on `/device`,
// where the server's link sends them.
import { expect, type Page, request, test } from '@playwright/test';
import { z } from 'zod';
import { zApiError, zAuthToken, zDeviceAuthorization, zDeviceCode } from '../gen/api/zod.gen';
import { addressOfAPerson, bodyOf, callFromPage, freshEmail, signIn } from './real';

/**
 * The server answers `verificationUriComplete` too (`IdentityRoutes`, the page with the code filled in), which the
 * contract's `DeviceCode` does not list yet: read here as the server sends it, until core adds it.
 */
const zStartedLogin = zDeviceCode.extend({ verificationUriComplete: z.string() });

/**
 * Calls the API as the CLI does, through the console's own origin (the preview proxies /api to the server): a
 * context of its own, without the browser's session cookie; a bearer token only once the CLI holds one.
 */
/**
 * The CLI's network, one per test: the server lets one address start ten logins per ten minutes, and every journey
 * reaches it from the same machine.
 */
let cliAddress = addressOfAPerson();

test.beforeEach(() => {
  cliAddress = addressOfAPerson();
});

async function asTheCli(
  method: 'GET' | 'POST',
  path: string,
  options: { readonly body?: unknown; readonly token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const { baseURL } = test.info().project.use;
  const context = await request.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    const response = await context.fetch(path, {
      method,
      headers: {
        accept: 'application/json',
        'X-Forwarded-For': cliAddress,
        ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
      },
      ...(options.body === undefined ? {} : { data: options.body }),
      failOnStatusCode: false,
    });
    return {
      status: response.status(),
      body: bodyOf(`${method} ${path}`, response.status(), await response.text()),
    };
  } finally {
    await context.dispose();
  }
}

/** `ostrom login` starts: no body, the ordinary sign-in (the contract's `DeviceLoginStart` names no client). */
async function startLogin(): Promise<{ deviceCode: string; userCode: string; page: string }> {
  const started = await asTheCli('POST', '/api/v1/auth/device');
  expect(started.status).toBe(200);
  const login = zStartedLogin.parse(started.body);
  // The console the server names may not be this one's host: its path and query are what the person opens.
  const link = new URL(login.verificationUriComplete);
  expect(link.pathname).toBe(new URL(login.verificationUri).pathname);
  expect(link.pathname).toBe('/device');
  expect(link.searchParams.get('code')).toBe(login.userCode);
  return { deviceCode: login.deviceCode, userCode: login.userCode, page: `${link.pathname}${link.search}` };
}

/** The CLI asks for its token once. */
async function poll(deviceCode: string): Promise<{ status: number; body: unknown }> {
  return asTheCli('POST', '/api/v1/auth/device/token', { body: { deviceCode } });
}

/** What the server says asks to sign in, as the page should show it. */
async function clientNameOf(page: Page, userCode: string): Promise<string> {
  const read = await callFromPage(
    page,
    'GET',
    `/api/v1/auth/device?userCode=${encodeURIComponent(userCode)}`,
  );
  expect(read.status).toBe(200);
  return zDeviceAuthorization.parse(read.body).clientName;
}

/** The pending login on the page: its code to compare with the terminal's, and what asks. */
async function seesTheLogin(page: Page, userCode: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in a terminal' })).toBeVisible();
  await expect(page.getByText(userCode, { exact: true })).toBeVisible();
  await expect(page.getByText(await clientNameOf(page, userCode), { exact: true })).toBeVisible();
}

test('5.1 `ostrom login`: the person approves the terminal on /device and the CLI gets its token', async ({
  page,
}) => {
  const login = await startLogin();
  // Nobody answered yet: the CLI is told to wait.
  expect((await poll(login.deviceCode)).status).toBe(428);

  await signIn(page, freshEmail('dev'));
  await page.goto(login.page);
  await seesTheLogin(page, login.userCode);
  await page.getByRole('button', { name: 'Sign in this terminal' }).click();
  await expect(page.getByText('Terminal signed in')).toBeVisible();

  const answered = await poll(login.deviceCode);
  expect(answered.status).toBe(200);
  const { token } = zAuthToken.parse(answered.body);
  expect((await asTheCli('GET', '/api/v1/auth/me', { token })).status).toBe(200);
});

test('5.1 `ostrom login`: the person denies the terminal on /device and the CLI is refused', async ({
  page,
}) => {
  const login = await startLogin();
  await signIn(page, freshEmail('dev'));
  await page.goto(login.page);
  await seesTheLogin(page, login.userCode);
  await page.getByRole('button', { name: 'Deny' }).click();
  await expect(page.getByText('Terminal refused')).toBeVisible();

  const answered = await poll(login.deviceCode);
  expect(answered.status).toBe(400);
  expect(zApiError.parse(answered.body).error.type).toBe('access_denied');
});

test('5.1 `ostrom login`: a code typed by hand on /device leads to the same pending login', async ({
  page,
}) => {
  const login = await startLogin();
  await signIn(page, freshEmail('dev'));
  await page.goto('/device');
  // Typed as a person might: in small letters, with spaces around.
  await page
    .getByRole('textbox', { name: 'Code shown by the terminal' })
    .fill(` ${login.userCode.toLowerCase()} `);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('code')).toBe(login.userCode);
  await seesTheLogin(page, login.userCode);
  await expect(page.getByRole('button', { name: 'Sign in this terminal' })).toBeEnabled();
});
