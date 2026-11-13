// SPDX-License-Identifier: Apache-2.0
import {
  createServiceKey,
  deleteDevice,
  deleteServiceKey,
  listDevices,
  listServiceKeys,
} from '@gen/api/sdk.gen';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
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

async function failure(
  call: () => Promise<unknown>,
): Promise<{ status: number | undefined; code: string | undefined }> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error('the call did not fail');
}

async function post(body: string): Promise<number> {
  const response = await fetch(`${API}/api/v1/service-keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  return response.status;
}

describe('mock workstations', () => {
  it('lists where the CLI is signed in, and signs one out once', async () => {
    expect((await listDevices({ throwOnError: true })).data.items.map((device) => device.id)).toEqual([
      'dev-2',
      'dev-1',
    ]);
    await deleteDevice({ path: { id: 'dev-2' }, throwOnError: true });
    expect(db.devices.map((device) => device.id)).toEqual(['dev-1']);
    expect(
      await failure(async () => deleteDevice({ path: { id: 'dev-2' }, throwOnError: true })),
    ).toMatchObject({
      status: 404,
    });
  });
});

describe('mock service keys', () => {
  it('creates a key with its secret once, sorted scopes, listed without it, then deletes it', async () => {
    const made = await createServiceKey({
      body: { name: '  Nightly ', scopes: ['sessions:write', 'rules:read', 'rules:read'] },
      throwOnError: true,
    });
    expect(made.data).toMatchObject({ name: 'Nightly', scopes: ['rules:read', 'sessions:write'] });
    expect(made.data.expiresAt).toBeUndefined();
    expect(made.data.secret).toMatch(/^osk_demo/);
    const listed = (await listServiceKeys({ throwOnError: true })).data.items;
    expect(listed.map((key) => key.name)).toEqual(['Nightly', 'GitHub Actions']);
    expect(JSON.stringify(listed)).not.toContain('osk_');
    await deleteServiceKey({ path: { id: made.data.id }, throwOnError: true });
    expect(
      await failure(async () => deleteServiceKey({ path: { id: made.data.id }, throwOnError: true })),
    ).toMatchObject({ status: 404 });
  });

  it('refuses a key without a name, too long a name, no scope, a scope a CI does not need, or no JSON', async () => {
    expect(await post(JSON.stringify({ name: ' ', scopes: ['rules:read'] }))).toBe(400);
    expect(await post(JSON.stringify({ name: 'x'.repeat(101), scopes: ['rules:read'] }))).toBe(400);
    expect(await post(JSON.stringify({ name: 'CI', scopes: [] }))).toBe(400);
    expect(await post(JSON.stringify({ name: 'CI', scopes: ['orgs:read'] }))).toBe(400);
    expect(await post('not json')).toBe(400);
    expect(await post(JSON.stringify({ name: 'CI', scopes: ['rules:read'], expiresInDays: 0 }))).toBe(400);
    expect(await post(JSON.stringify({ name: 'CI', scopes: ['rules:read'], expiresInDays: 367 }))).toBe(400);
  });

  it('gives a key the life asked for', async () => {
    const before = Date.now();
    const made = await createServiceKey({
      body: { name: 'CI', scopes: ['rules:read'], expiresInDays: 30 },
      throwOnError: true,
    });
    const left = Date.parse(made.data.expiresAt ?? '') - before;
    expect(left).toBeGreaterThanOrEqual(30 * 86_400_000 - 1_000);
    expect(left).toBeLessThanOrEqual(30 * 86_400_000 + 60_000);
  });

  it('asks for a fresh sign-in to create one', async () => {
    db.signedInAt = 0;
    expect(await post(JSON.stringify({ name: 'CI', scopes: ['rules:read'] }))).toBe(403);
    expect(db.serviceKeys).toHaveLength(1);
  });

  it('is for owners and admins only', async () => {
    setDemoRole(db, 'member');
    expect(await failure(async () => listServiceKeys({ throwOnError: true }))).toMatchObject({ status: 403 });
    expect(await post(JSON.stringify({ name: 'CI', scopes: ['rules:read'] }))).toBe(403);
    expect(
      await failure(async () => deleteServiceKey({ path: { id: 'key-1' }, throwOnError: true })),
    ).toMatchObject({ status: 403 });
    expect(db.serviceKeys).toHaveLength(1);
  });
});
