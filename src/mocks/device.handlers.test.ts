// SPDX-License-Identifier: Apache-2.0
import { answerDeviceLogin, getDeviceLogin } from '@gen/api/sdk.gen';
import { ADMIN_TOKEN_SCOPES, DEMO_ADMIN_DEVICE_CODE, DEMO_DEVICE_CODE } from '@/mocks/fixtures/device';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { FRESH_SIGN_IN_MS, resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { configureApiClient } from '@/shared/api/apiClient';

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

const read = async (query: string): Promise<number> =>
  (await fetch(`http://ostrom.test/api/v1/auth/device${query}`)).status;
const answer = async (body: unknown): Promise<number> =>
  (
    await fetch('http://ostrom.test/api/v1/auth/device/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  ).status;

describe('mock ostrom login', () => {
  it('shows a waiting login to someone signed in, the code read as the server reads it', async () => {
    const login = await getDeviceLogin({ query: { userCode: 'wdjb mjht' }, throwOnError: true });
    expect(login.data).toMatchObject({ userCode: DEMO_DEVICE_CODE, clientName: 'ostrom CLI on ada-laptop' });
    expect(login.data.scopes).toBeUndefined();
    const admin = await getDeviceLogin({ query: { userCode: DEMO_ADMIN_DEVICE_CODE }, throwOnError: true });
    expect(admin.data.scopes).toEqual(ADMIN_TOKEN_SCOPES);
  });

  it('refuses someone signed out, a missing code, and an unknown or expired one', async () => {
    expect(await read('?userCode=BBBB-CCCC')).toBe(404);
    expect(await read('')).toBe(400);
    db.deviceLogins = db.deviceLogins.map((login) => ({
      ...login,
      authorization: { ...login.authorization, expiresAt: new Date(Date.now() - 1).toISOString() },
    }));
    expect(await read(`?userCode=${DEMO_DEVICE_CODE}`)).toBe(404);
    db.signedIn = false;
    expect(await read(`?userCode=${DEMO_DEVICE_CODE}`)).toBe(401);
    expect(await answer({ userCode: DEMO_DEVICE_CODE, approve: true })).toBe(401);
  });

  it('approves a login once: the code then no longer reads', async () => {
    await answerDeviceLogin({ body: { userCode: DEMO_DEVICE_CODE, approve: true }, throwOnError: true });
    expect(db.deviceLogins[0]?.status).toBe('approved');
    expect(await read(`?userCode=${DEMO_DEVICE_CODE}`)).toBe(404);
    expect(await answer({ userCode: DEMO_DEVICE_CODE, approve: false })).toBe(404);
  });

  it('denies a login, an admin one included, whoever the person is', async () => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    expect(await answer({ userCode: DEMO_ADMIN_DEVICE_CODE, approve: false })).toBe(204);
    expect(db.deviceLogins[1]?.status).toBe('denied');
  });

  it('lets only an owner or an admin, recently signed in, approve an admin login', async () => {
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1;
    expect(await answer({ userCode: DEMO_ADMIN_DEVICE_CODE, approve: true })).toBe(403);
    db.signedInAt = Date.now();
    setDemoRole(db, 'member');
    expect(await answer({ userCode: DEMO_ADMIN_DEVICE_CODE, approve: true })).toBe(403);
    expect(db.deviceLogins[1]?.status).toBe('pending');
    resetMockDb(db);
    expect(await answer({ userCode: DEMO_ADMIN_DEVICE_CODE, approve: true })).toBe(204);
    expect(db.deviceLogins[1]?.status).toBe('approved');
  });

  it('binds an admin approval to the organization named: 409 for a person in several who names none, else 403', async () => {
    const approve = async (headers: Record<string, string>): Promise<number> =>
      (
        await fetch('http://ostrom.test/api/v1/auth/device/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ userCode: DEMO_ADMIN_DEVICE_CODE, approve: true }),
        })
      ).status;
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    expect(await approve({})).toBe(409);
    expect(await approve({ 'Ostrom-Org': 'not-an-organization' })).toBe(403);
    expect(db.deviceLogins[1]?.status).toBe('pending');
    expect(await approve({ 'Ostrom-Org': globex.id })).toBe(204);
    expect(db.deviceLogins[1]?.orgId).toBe(globex.id);
  });

  it('refuses an answer that is not one', async () => {
    expect(await answer({ userCode: DEMO_DEVICE_CODE })).toBe(400);
  });
});
