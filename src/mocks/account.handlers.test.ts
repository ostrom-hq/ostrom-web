// SPDX-License-Identifier: Apache-2.0
import { deleteDevice, getMyAccount, linkSignInProvider, listDevices } from '@gen/api/sdk.gen';
import { DEMO_GITHUB_CONSENT } from '@/mocks/account';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { freshAccount, resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();
const API = 'http://ostrom.test';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: API });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function status(call: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return error.status;
    throw error;
  }
  throw new Error('the call did not fail');
}

describe('mock account', () => {
  it('reads the signed-in person’s account and how they sign in', async () => {
    const { data } = await getMyAccount({ throwOnError: true });
    expect(data).toMatchObject({ login: 'maya', displayName: 'Maya Lind', providers: ['github'] });
    expect(data.emails).toEqual([{ email: 'maya@acme.dev', verified: true }]);
    db.providers = ['email'];
    expect((await getMyAccount({ throwOnError: true })).data.providers).toEqual(['email']);
  });

  it('starts linking GitHub or Google, never another provider', async () => {
    const { data } = await linkSignInProvider({
      path: { provider: 'github' },
      query: { redirect: '/account' },
      throwOnError: true,
    });
    expect(data.authorizationUrl).toBe(DEMO_GITHUB_CONSENT);
    expect(
      await status(async () => linkSignInProvider({ path: { provider: 'gitlab' }, throwOnError: true })),
    ).toBe(404);
  });

  it('answers nobody signed out', async () => {
    db.signedIn = false;
    expect(await status(async () => getMyAccount({ throwOnError: true }))).toBe(401);
    expect(
      await status(async () => linkSignInProvider({ path: { provider: 'github' }, throwOnError: true })),
    ).toBe(401);
  });
});

describe('mock workstations outside an organization', () => {
  it('lists and signs out a person’s workstations when the call names no organization, as the server does', async () => {
    freshAccount(db);
    const { data } = await listDevices({ throwOnError: true });
    expect(data.items.map((device) => device.id)).toEqual(['dev-2', 'dev-1']);
    await deleteDevice({ path: { id: 'dev-2' }, throwOnError: true });
    expect(db.devices.map((device) => device.id)).toEqual(['dev-1']);
  });

  it('needs no choice of organization for a person in several', async () => {
    db.otherOrganizations = [otherOrganization()];
    expect((await listDevices({ throwOnError: true })).data.items).toHaveLength(2);
  });
});
