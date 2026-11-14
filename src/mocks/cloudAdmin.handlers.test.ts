// SPDX-License-Identifier: Apache-2.0
import { CLUSTER_ID, PROFILE_ID } from '@/mocks/cloudAdmin';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`http://ostrom.test/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: await response.json() };
}

const runtime = (extra: object = {}) => ({
  enabled: true,
  runnerBinary: '/bin/o',
  workspaceAccessMode: 'ReadWriteOncePod',
  failedWorkspaceRetentionDays: 7,
  maxRunningSessionsPerMember: 3,
  maxRetainedSessionsPerMember: 20,
  memberTransfers: 'offer',
  updatedAt: '2026-11-01T09:00:00Z',
  ...extra,
});
const cluster = (extra: object = {}) => ({
  name: 'c',
  apiUrl: 'https://k8s.acme.test',
  allowedNamespaces: ['ostrom'],
  maxRunningPods: 5,
  version: 0,
  ...extra,
});
const profile = (extra: object = {}, spec: object = {}) => ({
  name: 'p',
  version: 0,
  spec: { clusterId: CLUSTER_ID, namespace: 'ostrom', image: 'img', ...spec },
  ...extra,
});

describe('the mock cloud administration, as the server keeps it', () => {
  it('keeps the runtime and the clusters to an administrator of the instance', async () => {
    const statuses = [
      (await call('GET', '/cloud/runtime')).status,
      (await call('PUT', '/cloud/runtime', runtime())).status,
      (await call('GET', '/cloud/clusters')).status,
      (await call('POST', '/cloud/clusters', cluster())).status,
      (await call('PUT', `/cloud/clusters/${CLUSTER_ID}`, cluster())).status,
    ];
    expect(statuses).toEqual([403, 403, 403, 403, 403]);
  });

  it('refuses a runtime that is not valid, that points to a private address, or that is out of date', async () => {
    db.instanceAdmin = true;
    expect((await call('PUT', '/cloud/runtime', {})).status).toBe(400);
    expect((await call('PUT', '/cloud/runtime', runtime({ serverUrl: 'https://localhost' }))).status).toBe(
      400,
    );
    expect((await call('PUT', '/cloud/runtime', runtime({ updatedAt: '2020-01-01T00:00:00Z' }))).status).toBe(
      409,
    );
    const saved = await call('PUT', '/cloud/runtime', runtime({ serverUrl: 'https://pods.acme.test' }));
    expect(saved.status).toBe(200);
    expect(db.cloudRuntime.effectiveServerUrl).toBe('https://pods.acme.test');
    expect((await call('GET', '/cloud/runtime')).status).toBe(200);
    const again = await call('PUT', '/cloud/runtime', runtime({ updatedAt: db.cloudRuntime.updatedAt }));
    expect(again.status).toBe(200);
    expect(db.cloudRuntime.effectiveServerUrl).toBe('https://ostrom.acme.test');
  });

  it('creates and updates a cluster, and refuses what the server refuses', async () => {
    db.instanceAdmin = true;
    expect((await call('GET', '/cloud/clusters')).status).toBe(200);
    expect((await call('POST', '/cloud/clusters', {})).status).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/cloud/clusters',
          cluster({ apiUrl: 'https://localhost', caCertificate: 'a', serviceAccountToken: 'b' }),
        )
      ).status,
    ).toBe(400);
    expect((await call('POST', '/cloud/clusters', cluster())).status).toBe(400);
    const created = await call(
      'POST',
      '/cloud/clusters',
      cluster({ caCertificate: 'a', serviceAccountToken: 'b', defaultStorageClass: 'fast' }),
    );
    expect(created.status).toBe(201);
    expect(
      (await call('POST', '/cloud/clusters', cluster({ caCertificate: 'a', serviceAccountToken: 'b' })))
        .status,
    ).toBe(201);
    const missing = '00000000-0000-4000-8000-0000000000ff';
    expect((await call('PUT', `/cloud/clusters/${missing}`, cluster({ version: 1 }))).status).toBe(404);
    expect((await call('PUT', `/cloud/clusters/${CLUSTER_ID}`, {})).status).toBe(400);
    expect((await call('PUT', `/cloud/clusters/${CLUSTER_ID}`, cluster({ version: 9 }))).status).toBe(409);
    expect(
      (
        await call(
          'PUT',
          `/cloud/clusters/${CLUSTER_ID}`,
          cluster({ version: 1, apiUrl: 'https://other.test' }),
        )
      ).status,
    ).toBe(400);
    const half = cluster({ version: 1, apiUrl: 'https://other.test', caCertificate: 'a' });
    expect((await call('PUT', `/cloud/clusters/${CLUSTER_ID}`, half)).status).toBe(400);
    expect((await call('PUT', `/cloud/clusters/${CLUSTER_ID}`, cluster({ version: 1 }))).status).toBe(200);
  });

  it('keeps writing profiles to the owners and the admins, and shows a member the ones assigned', async () => {
    db.cloudProfiles = db.cloudProfiles.map((item) => ({ ...item, assignedMemberIds: [MEMBER_IDS.maya] }));
    setDemoRole(db, 'member');
    expect((await call('PUT', '/cloud/settings', { backgroundWorkMaxMinutes: 5 })).status).toBe(403);
    expect((await call('POST', '/cloud/profiles', profile())).status).toBe(403);
    expect((await call('PUT', `/cloud/profiles/${PROFILE_ID}`, profile({ version: 2 }))).status).toBe(403);
    const mine = await call('GET', '/cloud/profiles');
    expect(mine.json).toMatchObject({ profiles: [{ id: PROFILE_ID }] });
    db.cloudProfiles = db.cloudProfiles.map((item) => ({ ...item, assignedMemberIds: [] }));
    expect((await call('GET', '/cloud/profiles')).json).toEqual({ profiles: [] });
  });

  it('refuses a profile for a cluster or a namespace that is not there, and one out of date', async () => {
    expect((await call('POST', '/cloud/profiles', {})).status).toBe(400);
    const none = '00000000-0000-4000-8000-0000000000ff';
    expect((await call('POST', '/cloud/profiles', profile({}, { clusterId: none }))).status).toBe(400);
    expect((await call('POST', '/cloud/profiles', profile({}, { namespace: 'other' }))).status).toBe(400);
    const created = await call('POST', '/cloud/profiles', profile({ assignedMemberIds: [MEMBER_IDS.theo] }));
    expect(created.status).toBe(201);
    expect((await call('POST', '/cloud/profiles', profile())).status).toBe(201);
    expect((await call('PUT', `/cloud/profiles/${none}`, profile({ version: 1 }))).status).toBe(404);
    expect((await call('PUT', `/cloud/profiles/${PROFILE_ID}`, {})).status).toBe(400);
    expect((await call('PUT', `/cloud/profiles/${PROFILE_ID}`, profile({ version: 9 }))).status).toBe(409);
    expect(
      (await call('PUT', `/cloud/profiles/${PROFILE_ID}`, profile({ version: 2 }, { clusterId: none })))
        .status,
    ).toBe(400);
    expect(
      (await call('PUT', `/cloud/profiles/${PROFILE_ID}`, profile({ version: 2 }, { namespace: 'other' })))
        .status,
    ).toBe(400);
    expect((await call('PUT', `/cloud/profiles/${PROFILE_ID}`, profile({ version: 2 }))).status).toBe(200);
  });

  it('refuses settings that are not valid or out of date', async () => {
    expect((await call('PUT', '/cloud/settings', { backgroundWorkMaxMinutes: 5000 })).status).toBe(400);
    expect(
      (
        await call('PUT', '/cloud/settings', {
          backgroundWorkMaxMinutes: 5,
          updatedAt: '2020-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(409);
    expect((await call('PUT', '/cloud/settings', { backgroundWorkMaxMinutes: 5 })).status).toBe(200);
    expect(db.cloudSettings.maxRunningAutomationsPerMember).toBe(2);
    const { maxRunningAutomationsPerMember: _cap, ...bare } = db.cloudSettings;
    expect(_cap).toBe(2);
    db.cloudSettings = bare;
    const saved = await call('PUT', '/cloud/settings', {
      backgroundWorkMaxMinutes: 5,
      updatedAt: bare.updatedAt,
    });
    expect(saved.json).toMatchObject({ maxRunningAutomationsPerMember: 2 });
    const set = await call('PUT', '/cloud/settings', {
      backgroundWorkMaxMinutes: 5,
      maxRunningAutomationsPerMember: 7,
      updatedAt: db.cloudSettings.updatedAt,
    });
    expect(set.json).toMatchObject({ maxRunningAutomationsPerMember: 7 });
  });
});
