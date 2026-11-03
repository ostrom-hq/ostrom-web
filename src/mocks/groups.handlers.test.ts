// SPDX-License-Identifier: AGPL-3.0-only
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  pauseGroupMember,
  removeGroupMember,
  updateGroup,
} from '@gen/api/sdk.gen';
import type { Group } from '@gen/api/types.gen';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { LEFT_MEMBER } from '@/mocks/fixtures/sharing';
import { groupId } from '@/mocks/groups';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
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

/** A body the console would never send: the generated client checks its own. */
async function raw(method: string, path: string, body: string): Promise<number> {
  return (await fetch(`http://ostrom.test/api/v1${path}`, { method, body })).status;
}

const platform = groupId(1);
const billing = groupId(2);

async function platformNow(): Promise<Group> {
  return (await getGroup({ path: { id: platform }, throwOnError: true })).data;
}

describe('the mock groups, as the server serves them', () => {
  it('lists the groups by name, with the members paused now only', async () => {
    const platformGroup = db.groups.find((group) => group.id === platform);
    platformGroup?.pauses.push({ login: 'theo', until: '2020-01-01T00:00:00.000Z' });
    const { items } = (await listGroups({ throwOnError: true })).data;
    expect(items.map((group) => group.name)).toEqual(['Billing', 'Platform']);
    expect(items[1]?.members).toEqual(['theo', 'samir', LEFT_MEMBER]);
    expect(items[1]?.paused?.map((pause) => pause.login)).toEqual(['samir']);
  });

  it('lets a member read the groups, and refuses them every change', async () => {
    setDemoRole(db, 'member');
    expect((await listGroups({ throwOnError: true })).data.items).toHaveLength(2);
    const refused = await Promise.all([
      statusOf(async () => createGroup({ body: { name: 'Ops' }, throwOnError: true })),
      statusOf(async () => updateGroup({ path: { id: platform }, body: { name: 'X' }, throwOnError: true })),
      statusOf(async () => deleteGroup({ path: { id: platform }, throwOnError: true })),
      statusOf(async () => addGroupMember({ path: { id: platform, login: 'lena' }, throwOnError: true })),
      statusOf(async () => removeGroupMember({ path: { id: platform, login: 'theo' }, throwOnError: true })),
      statusOf(async () =>
        pauseGroupMember({
          path: { id: platform, login: 'theo' },
          body: { until: '2030-01-01T00:00:00Z' },
          throwOnError: true,
        }),
      ),
    ]);
    expect(refused).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it('keeps another organization’s groups apart: none listed, each a 404, and nothing to change there', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    const headers = { 'Ostrom-Org': globex.id };
    expect((await listGroups({ headers, throwOnError: true })).data.items).toEqual([]);
    const read = await statusOf(async () =>
      getGroup({ path: { id: platform }, headers, throwOnError: true }),
    );
    expect(read).toBe(404);
    // Nobody of that organization is known to the demo: no role there, so no change either.
    const write = await statusOf(async () =>
      createGroup({ body: { name: 'Ops' }, headers, throwOnError: true }),
    );
    expect(write).toBe(403);
  });

  it('creates a group with its members and subscriptions, each once', async () => {
    const created = await createGroup({
      body: { name: '  Ops  ', members: ['theo', 'theo'], accounts: ['acc-1', 'acc-1'] },
      throwOnError: true,
    });
    expect(created.response.status).toBe(201);
    expect(created.data).toEqual({
      id: groupId(3),
      name: 'Ops',
      members: ['theo'],
      accounts: ['acc-1'],
      paused: [],
    });
    const bare = await createGroup({ body: { name: 'Bare' }, throwOnError: true });
    expect(bare.data).toEqual(expect.objectContaining({ id: groupId(4), members: [], accounts: [] }));
  });

  it('refuses a group with no name, a long one, one taken, someone or something unknown, and the 101st', async () => {
    const create = async (body: { name: string; members?: string[]; accounts?: string[] }) =>
      statusOf(async () => createGroup({ body, throwOnError: true }));
    expect(await raw('POST', '/groups', '{"name":1}')).toBe(400);
    expect(await create({ name: '   ' })).toBe(400);
    expect(await create({ name: 'x'.repeat(121) })).toBe(400);
    expect(await create({ name: 'platform' })).toBe(409);
    expect(await create({ name: 'Ops', members: ['nobody'] })).toBe(400);
    expect(await create({ name: 'Ops', accounts: ['acc-404'] })).toBe(400);
    for (let number = 3; number <= 100; number += 1) {
      db.groups.push({
        id: groupId(number),
        orgId: db.organization.id,
        name: `G${String(number)}`,
        members: [],
        accounts: [],
        pauses: [],
      });
    }
    expect(await create({ name: 'Ops' })).toBe(409);
  });

  it('renames a group and changes what it lends, keeps its own name, and refuses a taken one', async () => {
    const id = platform;
    const renamed = await updateGroup({ path: { id }, body: { name: 'PLATFORM' }, throwOnError: true });
    expect(renamed.data.name).toBe('PLATFORM');
    const lent = await updateGroup({ path: { id }, body: { accounts: ['acc-2'] }, throwOnError: true });
    expect(lent.data).toEqual(expect.objectContaining({ name: 'PLATFORM', accounts: ['acc-2'] }));
    const untouched = await updateGroup({ path: { id }, body: {}, throwOnError: true });
    expect(untouched.data.accounts).toEqual(['acc-2']);
    const update = async (body: { name?: string; accounts?: string[] }) =>
      statusOf(async () => updateGroup({ path: { id }, body, throwOnError: true }));
    expect(await update({ name: 'billing' })).toBe(409);
    expect(await update({ accounts: ['acc-404'] })).toBe(400);
    expect(await raw('PATCH', `/groups/${id}`, '{"name":1}')).toBe(400);
    expect(
      await statusOf(async () => updateGroup({ path: { id: groupId(99) }, body: {}, throwOnError: true })),
    ).toBe(404);
  });

  it('deletes a group, once', async () => {
    expect((await deleteGroup({ path: { id: billing }, throwOnError: true })).response.status).toBe(204);
    expect(await statusOf(async () => deleteGroup({ path: { id: billing }, throwOnError: true }))).toBe(404);
    expect(await statusOf(async () => getGroup({ path: { id: billing }, throwOnError: true }))).toBe(404);
  });

  it('adds a member once, and refuses a login nobody of the organization has', async () => {
    const add = async (id: string, login: string) =>
      statusOf(async () => addGroupMember({ path: { id, login }, throwOnError: true }));
    expect(await add(platform, 'lena')).toBe(200);
    expect(await add(platform, 'lena')).toBe(200);
    expect((await platformNow()).members).toEqual(['theo', 'samir', LEFT_MEMBER, 'lena']);
    expect(await add(platform, 'nobody')).toBe(404);
    expect(await add(groupId(99), 'lena')).toBe(404);
  });

  it('removes a member with their pause, one who left by id, and refuses someone not in the group', async () => {
    const remove = async (id: string, login: string) =>
      statusOf(async () => removeGroupMember({ path: { id, login }, throwOnError: true }));
    expect(await remove(platform, 'samir')).toBe(200);
    expect(await remove(platform, LEFT_MEMBER)).toBe(200);
    expect(await platformNow()).toEqual(expect.objectContaining({ members: ['theo'], paused: [] }));
    expect(await remove(platform, 'samir')).toBe(404);
    expect(await remove(groupId(99), 'theo')).toBe(404);
  });

  it('pauses a member until an instant, ends the pause with one already past, and refuses what is not one', async () => {
    const pause = async (id: string, login: string, until: string) =>
      statusOf(async () => pauseGroupMember({ path: { id, login }, body: { until }, throwOnError: true }));
    expect(await pause(platform, 'theo', '2099-01-01T00:00:00+02:00')).toBe(200);
    expect((await platformNow()).paused).toEqual([
      expect.objectContaining({ login: 'samir' }),
      { login: 'theo', until: '2098-12-31T22:00:00.000Z' },
    ]);
    expect(await pause(platform, 'samir', '2020-01-01T00:00:00Z')).toBe(200);
    expect((await platformNow()).paused).toEqual([{ login: 'theo', until: '2098-12-31T22:00:00.000Z' }]);
    expect(await pause(platform, 'lena', '2099-01-01T00:00:00Z')).toBe(404);
    expect(await pause(groupId(99), 'theo', '2099-01-01T00:00:00Z')).toBe(404);
    expect(await raw('POST', `/groups/${platform}/members/theo/pause`, '{"until":"soon"}')).toBe(400);
    expect(await raw('POST', `/groups/${platform}/members/theo/pause`, '{}')).toBe(400);
    expect(await raw('POST', `/groups/${platform}/members/theo/pause`, 'not json')).toBe(400);
  });
});
