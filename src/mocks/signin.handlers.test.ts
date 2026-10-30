// SPDX-License-Identifier: AGPL-3.0-only
import { exchangeSignInLink, getMe, logout, requestSignInEmail, verifySignInEmail } from '@gen/api/sdk.gen';
import { configureApiClient } from '@/shared/api/apiClient';
import { DEMO_EMAIL_TOKEN, resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

const post = async (path: string, body: string): Promise<number> =>
  (await fetch(`http://ostrom.test/api/v1${path}`, { method: 'POST', body })).status;

describe('mock e-mail sign-in', () => {
  it('accepts any address, and refuses a body without one', async () => {
    const sent = await requestSignInEmail({ body: { email: 'nobody@acme.dev' }, throwOnError: true });
    expect(sent.response.status).toBe(202);
    expect(await post('/auth/email', '{}')).toBe(400);
  });

  it('signs in with the demo token only, the session in a cookie and nothing secret in the body', async () => {
    const signed = await verifySignInEmail({ body: { token: DEMO_EMAIL_TOKEN }, throwOnError: true });
    expect(signed.data).toEqual({ redirect: '/yes', csrfToken: 'csrf-demo' });
    expect(await post('/auth/email/verify', JSON.stringify({ token: 'ml_other' }))).toBe(401);
    expect(await post('/auth/email/verify', '{"token":7}')).toBe(401);
  });
});

describe('mock session cookie', () => {
  it('signs out, then an approver link signs in once', async () => {
    await logout({ throwOnError: true });
    expect((await getMe()).response.status).toBe(401);
    const signed = await exchangeSignInLink({ body: { token: 'opk_demo_12345678' }, throwOnError: true });
    expect(signed.data).toEqual({ redirect: '/yes', csrfToken: 'csrf-demo' });
    expect((await getMe()).response.status).toBe(200);
    expect(await post('/auth/link', JSON.stringify({ token: 'opk_demo_12345678' }))).toBe(401);
    expect(await post('/auth/link', JSON.stringify({ token: 'ml_demo_12345678' }))).toBe(401);
    expect(await post('/auth/link', '{}')).toBe(401);
  });

  it('signs in again with the e-mailed link after a sign-out', async () => {
    await logout({ throwOnError: true });
    await verifySignInEmail({ body: { token: DEMO_EMAIL_TOKEN }, throwOnError: true });
    expect(db.signedIn).toBe(true);
  });
});
