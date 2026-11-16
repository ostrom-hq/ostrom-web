// SPDX-License-Identifier: Apache-2.0
import { createCloudSession, listDeviceFolders, listResumableSessions } from '@gen/api/sdk.gen';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();
const API = 'http://ostrom.test';
const AT = '2026-11-16T09:00:00.000Z';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: API });
});
beforeEach(() => {
  db.devices = [
    { id: 'dev-on', name: 'On', daemon: { online: true, lastSeenAt: AT, features: ['resume.v1'] } },
    { id: 'dev-old', name: 'Old', daemon: { online: true, lastSeenAt: AT } },
    { id: 'dev-off', name: 'Off', daemon: { online: false, lastSeenAt: AT } },
    { id: 'dev-never', name: 'Never' },
  ];
  db.deviceFolders = { 'dev-on': [{ id: 'f1', name: 'web' }] };
  db.resumable = {
    'dev-on/f1': [
      { id: 'r1', title: 'One', lastActiveAt: '2026-11-16T08:00:00Z', turns: 1 },
      { id: 'r2', title: 'Two', lastActiveAt: '2026-11-16T07:00:00Z', turns: 2 },
    ],
  };
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function failure(call: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return error.code;
    throw error;
  }
  throw new Error('the call did not fail');
}

describe('a device’s folders and conversations (DevicesApi)', () => {
  it('lists the folders of a device, none for a device that never published, and refuses another', async () => {
    const on = await listDeviceFolders({ path: { id: 'dev-on' }, throwOnError: true });
    expect(on.data.folders).toEqual([{ id: 'f1', name: 'web' }]);
    const never = await listDeviceFolders({ path: { id: 'dev-never' }, throwOnError: true });
    expect(never.data).toEqual({ deviceId: 'dev-never', daemon: null, folders: [] });
    expect(await failure(async () => listDeviceFolders({ path: { id: 'nope' }, throwOnError: true }))).toBe(
      'device_not_found',
    );
  });

  it('pages a folder’s conversations, and refuses an unknown, offline or older device', async () => {
    const path = { id: 'dev-on', folderId: 'f1' };
    const all = await listResumableSessions({ path, throwOnError: true });
    expect(all.data).toEqual({ items: db.resumable['dev-on/f1'], next: null });
    const first = await listResumableSessions({ path, query: { limit: 1 }, throwOnError: true });
    expect(first.data.next).toBe('2026-11-16T07:00:00Z');
    const older = await listResumableSessions({
      path,
      query: { before: '2026-11-16T07:00:00Z' },
      throwOnError: true,
    });
    expect(older.data.items.map((item) => item.id)).toEqual(['r2']);
    const empty = await listResumableSessions({ path: { id: 'dev-on', folderId: 'f9' }, throwOnError: true });
    expect(empty.data.items).toEqual([]);
    const refused = async (id: string) =>
      failure(async () => listResumableSessions({ path: { id, folderId: 'f1' }, throwOnError: true }));
    expect(await refused('nope')).toBe('device_not_found');
    expect(await refused('dev-off')).toBe('device_offline');
    expect(await refused('dev-never')).toBe('device_offline');
    expect(await refused('dev-old')).toBe('daemon_resume_unsupported');
  });
});

describe('a session started on a device', () => {
  const create = async (body: Record<string, unknown>) =>
    createCloudSession({ body: { agent: 'claude', kind: 'remote', ...body }, throwOnError: true });

  it('waits for its device, named after its folder unless named, asking by default', async () => {
    const { data } = await create({ deviceId: 'dev-on', folderId: 'f1' });
    expect(data).toMatchObject({
      name: 'web',
      kind: 'remote',
      phase: 'waiting_host',
      mode: 'conversation',
      host: {
        deviceId: 'dev-on',
        platform: null,
        osVersion: null,
        directoryName: 'web',
        permissionMode: 'ask',
      },
    });
    expect(data.model).toBeUndefined();
    db.devices[0] = { ...db.devices[0], id: 'dev-on', name: 'On', platform: 'macos', osVersion: '26' };
    const named = await create({
      deviceId: 'dev-on',
      folderId: 'f1',
      name: 'Fix',
      model: 'opus',
      permissionMode: 'bypass',
    });
    expect(named.data).toMatchObject({
      name: 'Fix',
      model: 'opus',
      host: { platform: 'macos', osVersion: '26', permissionMode: 'bypass' },
    });
  });

  it('refuses a device that is not the person’s, offline, or a folder it does not offer', async () => {
    expect(await failure(async () => create({ folderId: 'f1' }))).toBe('device_not_found');
    expect(await failure(async () => create({ deviceId: 'dev-off', folderId: 'f1' }))).toBe('device_offline');
    expect(await failure(async () => create({ deviceId: 'dev-on', folderId: 'f9' }))).toBe(
      'folder_not_published',
    );
    expect(await failure(async () => create({ deviceId: 'dev-old', folderId: 'f1' }))).toBe(
      'folder_not_published',
    );
  });
});
