// SPDX-License-Identifier: AGPL-3.0-only
import {
  createMcpArgumentPolicy,
  deleteMcpArgumentPolicy,
  importTeamCode,
  listMcpArgumentPolicies,
  listMcpAssignments,
  putMcpSettings,
  unassignMcpServer,
} from '@gen/api/sdk.gen';
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
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

describe('the mock relay access, as the server refuses', () => {
  it('lets only owners and admins read and change who reaches a server', async () => {
    setDemoRole(db, 'member');
    const refused = await Promise.all([
      statusOf(async () => listMcpAssignments({ path: { name: 'linear' }, throwOnError: true })),
      statusOf(async () => listMcpArgumentPolicies({ path: { name: 'linear' }, throwOnError: true })),
      statusOf(async () => putMcpSettings({ body: { agentPrefix: 'acme' }, throwOnError: true })),
    ]);
    expect(refused).toEqual([403, 403, 403]);
    const write = async (method: string, path: string, body?: string): Promise<number> =>
      (await fetch(`http://ostrom.test/api/v1${path}`, body === undefined ? { method } : { method, body }))
        .status;
    const writes = [
      await write('PUT', '/mcp/servers/linear/assignments/all', '{}'),
      await write('DELETE', '/mcp/servers/linear/assignments/all'),
      await write('POST', '/mcp/servers/linear/policies', '{"tool":"x","effect":"DENY","message":"no"}'),
      await write('DELETE', '/mcp/servers/linear/policies/pol-1'),
    ];
    expect(writes).toEqual([403, 403, 403, 403]);
  });

  it('knows no server of another organization, nor one that does not exist', async () => {
    expect(
      await statusOf(async () => listMcpAssignments({ path: { name: 'nope' }, throwOnError: true })),
    ).toBe(404);
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    db.orgMembers[globex.id] = [
      {
        id: MEMBER_IDS.maya,
        login: 'maya',
        name: '',
        avatarUrl: '',
        email: null,
        role: 'owner',
        joinedAt: '2026-09-01T09:00:00.000Z',
      },
    ];
    expect(
      await statusOf(async () =>
        listMcpArgumentPolicies({
          path: { name: 'linear' },
          headers: { 'Ostrom-Org': globex.id },
          throwOnError: true,
        }),
      ),
    ).toBe(404);
  });

  it('refuses a prefix, a credential for everyone, a broken body and what is not there', async () => {
    const raw = async (method: string, path: string, body: string): Promise<number> =>
      (await fetch(`http://ostrom.test/api/v1${path}`, { method, body })).status;
    expect(await raw('PUT', '/mcp/settings', '{"agentPrefix":"-bad"}')).toBe(400);
    expect(await raw('PUT', '/mcp/servers/linear/assignments/all', '{"credentialSecret":"X"}')).toBe(400);
    expect(await raw('PUT', '/mcp/servers/linear/assignments/all', '{"tools":1}')).toBe(400);
    expect(await raw('POST', '/mcp/servers/linear/policies', '{"tool":1}')).toBe(400);
    expect(
      await statusOf(async () =>
        unassignMcpServer({ path: { name: 'sentry', member: 'all' }, throwOnError: true }),
      ),
    ).toBe(404);
    expect(
      await statusOf(async () =>
        deleteMcpArgumentPolicy({ path: { name: 'sentry', policyId: 'pol-9' }, throwOnError: true }),
      ),
    ).toBe(404);
  });

  it('refuses a policy without a message, a bad tool, or a test without its value', async () => {
    const create = async (
      body: Parameters<typeof createMcpArgumentPolicy>[0]['body'],
    ): Promise<number | undefined> =>
      statusOf(async () => createMcpArgumentPolicy({ path: { name: 'linear' }, body, throwOnError: true }));
    expect(await create({ tool: 'a b', effect: 'DENY', message: 'no' })).toBe(400);
    expect(await create({ tool: 'x', effect: 'DENY', message: ' ' })).toBe(400);
    expect(
      await create({
        tool: 'x',
        effect: 'DENY',
        message: 'no',
        conditions: [{ path: 'q', operator: 'EQUALS' }],
      }),
    ).toBe(400);
    expect(await create({ tool: 'x', effect: 'DENY', message: 'no' })).toBe(200);
    expect(db.mcpPolicies['linear']?.at(-1)).toMatchObject({ tool: 'x', conditions: [] });
  });
});

describe('the mock TeamCode import, as the server refuses', () => {
  it('refuses a member, and a body that is not an export', async () => {
    setDemoRole(db, 'member');
    expect(await statusOf(async () => importTeamCode({ body: {}, throwOnError: true }))).toBe(403);
    setDemoRole(db, 'admin');
    const response = await fetch('http://ostrom.test/api/v1/import/teamcode', {
      method: 'POST',
      body: 'nope',
    });
    expect(response.status).toBe(400);
  });

  it('names an assignment of a member the file does not list by their TeamCode id', async () => {
    const { data } = await importTeamCode({
      body: {
        mcpServers: [{ id: 'v-1', target: 'linear', variant: 'default' }],
        assignments: [{ memberId: 'tc-x', serverId: 'v-1' }],
      },
      query: { dryRun: true },
      throwOnError: true,
    });
    expect(data.items[1]).toEqual({
      kind: 'assignment',
      name: 'linear/tc-x',
      action: 'skipped',
      reason: 'tc-x has no Ostrom member.',
    });
  });
});
