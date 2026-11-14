// SPDX-License-Identifier: Apache-2.0
import {
  addInstanceAdmin,
  getInstanceSettings,
  listInstanceAdmins,
  listInstanceSettings,
  removeInstanceAdmin,
  saveInstanceSettings,
} from '@gen/api/sdk.gen';
import { DEMO_ADMIN_ID, INSTANCE_ACCOUNTS } from '@/mocks/admin';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
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

async function statusOf(call: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return error.status;
    throw error;
  }
  return 200;
}

const raw = async (method: string, path: string, body: string): Promise<number> =>
  (await fetch(`http://ostrom.test/api/v1${path}`, { method, body })).status;

const SAM = INSTANCE_ACCOUNTS['sam@acme.test'];

describe('the mock instance administration, as the server keeps it', () => {
  it('says who administers the instance only to an administrator of it', async () => {
    const refused = [
      await statusOf(async () => listInstanceAdmins({ throwOnError: true })),
      await statusOf(async () => addInstanceAdmin({ body: { email: 'sam@acme.test' }, throwOnError: true })),
      await statusOf(async () =>
        removeInstanceAdmin({ path: { userId: DEMO_ADMIN_ID }, throwOnError: true }),
      ),
      await statusOf(async () => listInstanceSettings({ throwOnError: true })),
      await statusOf(async () => getInstanceSettings({ path: { section: 'mail' }, throwOnError: true })),
      await statusOf(async () =>
        saveInstanceSettings({ path: { section: 'mail' }, body: { version: 2 }, throwOnError: true }),
      ),
    ];
    expect(refused).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it('adds an administrator by verified address, once, and never removes the last', async () => {
    db.instanceAdmin = true;
    expect(
      (await listInstanceAdmins({ throwOnError: true })).data.admins.map((admin) => admin.login),
    ).toEqual(['maya']);
    expect(
      await statusOf(async () =>
        addInstanceAdmin({ body: { email: 'nobody@acme.test' }, throwOnError: true }),
      ),
    ).toBe(404);
    expect(await raw('POST', '/admin/instance-admins', '{}')).toBe(400);
    const added = await addInstanceAdmin({ body: { email: 'SAM@acme.test' }, throwOnError: true });
    expect(added.data.admins.map((admin) => [admin.login, admin.source])).toEqual([
      ['maya', 'setup'],
      ['sam', 'dashboard'],
    ]);
    // Adding twice changes nothing.
    expect(
      (await addInstanceAdmin({ body: { email: 'sam@acme.test' }, throwOnError: true })).data.admins,
    ).toHaveLength(2);
    expect(
      await statusOf(async () =>
        removeInstanceAdmin({ path: { userId: '00000000-0000-4000-8000-000000000000' }, throwOnError: true }),
      ),
    ).toBe(404);
    await removeInstanceAdmin({ path: { userId: SAM?.userId ?? '' }, throwOnError: true });
    expect(db.instanceAdmins.map((admin) => admin.login)).toEqual(['maya']);
    expect(
      await statusOf(async () =>
        removeInstanceAdmin({ path: { userId: DEMO_ADMIN_ID }, throwOnError: true }),
      ),
    ).toBe(409);
  });

  it('lists the sections and answers one, or says there is none', async () => {
    db.instanceAdmin = true;
    expect(
      (await listInstanceSettings({ throwOnError: true })).data.sections.map((section) => section.section),
    ).toEqual(['mail', 'push']);
    expect((await getInstanceSettings({ path: { section: 'mail' }, throwOnError: true })).data.version).toBe(
      2,
    );
    expect(
      await statusOf(async () => getInstanceSettings({ path: { section: 'nope' }, throwOnError: true })),
    ).toBe(404);
  });

  it('saves a section: a secret absent or empty is kept, a value replaces it, null removes it', async () => {
    db.instanceAdmin = true;
    const save = async (
      section: string,
      body: { version: number; values?: Record<string, string>; secrets?: Record<string, string | null> },
    ) => saveInstanceSettings({ path: { section }, body, throwOnError: true });
    // Nothing sent but the version: the plain fields are unset, the secret kept.
    const kept = (await save('mail', { version: 2 })).data;
    expect([kept.version, kept.values, kept.secrets]).toEqual([3, {}, { password: { configured: true } }]);
    const emptied = (await save('mail', { version: 3, secrets: { password: '' } })).data;
    expect(emptied.secrets).toEqual({ password: { configured: true } });
    const replaced = (
      await save('mail', {
        version: 4,
        values: { host: 'mx.acme.test', from: '' },
        secrets: { password: 'x' },
      })
    ).data;
    expect([replaced.values, replaced.secrets, replaced.importedFromEnvironment]).toEqual([
      { host: 'mx.acme.test' },
      { password: { configured: true } },
      false,
    ]);
    const removed = (await save('mail', { version: 5, secrets: { password: null } })).data;
    expect(removed.secrets).toEqual({ password: { configured: false } });
    expect(db.instanceSettings.find((section) => section.section === 'mail')?.version).toBe(6);
    // A secret never set stays not set when nothing is sent for it.
    expect((await save('push', { version: 0, values: { keyId: 'K1' } })).data.secrets).toEqual({
      privateKey: { configured: false },
    });
  });

  it('refuses a save of a stale version, an unknown field, an unknown section or a body it cannot read', async () => {
    db.instanceAdmin = true;
    expect(
      await statusOf(async () =>
        saveInstanceSettings({ path: { section: 'mail' }, body: { version: 1 }, throwOnError: true }),
      ),
    ).toBe(409);
    expect(
      await statusOf(async () =>
        saveInstanceSettings({
          path: { section: 'mail' },
          body: { version: 2, values: { colour: 'red' } },
          throwOnError: true,
        }),
      ),
    ).toBe(400);
    expect(
      await statusOf(async () =>
        saveInstanceSettings({
          path: { section: 'mail' },
          body: { version: 2, secrets: { token: 'x' } },
          throwOnError: true,
        }),
      ),
    ).toBe(400);
    expect(
      await statusOf(async () =>
        saveInstanceSettings({ path: { section: 'nope' }, body: { version: 0 }, throwOnError: true }),
      ),
    ).toBe(404);
    expect(await raw('PUT', '/admin/settings/mail', '{"version":"x"}')).toBe(400);
  });
});
