// SPDX-License-Identifier: Apache-2.0
import { listMcpHostedProcesses, restartMcpHostedProcess } from '@gen/api/sdk.gen';
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

async function statusOf(call: () => Promise<unknown>): Promise<number> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error) && error.status !== undefined) return error.status;
    throw error;
  }
  return 200;
}

describe('the mock MCP host, as the server answers', () => {
  it('lets only owners and admins read the host and restart a process', async () => {
    setDemoRole(db, 'member');
    expect(await statusOf(async () => listMcpHostedProcesses({ throwOnError: true }))).toBe(403);
    expect(
      await statusOf(async () =>
        restartMcpHostedProcess({ body: { server: 'filesystem' }, throwOnError: true }),
      ),
    ).toBe(403);
  });

  it('shows another organization no process of this one', async () => {
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
    const answer = await listMcpHostedProcesses({
      headers: { 'Ostrom-Org': globex.id },
      throwOnError: true,
    });
    expect(answer.data.items).toEqual([]);
  });

  it('refuses a body without a server, and a process that does not exist', async () => {
    const post = async (body: string): Promise<number> =>
      (await fetch('http://ostrom.test/api/v1/mcp/hosted/restart', { method: 'POST', body })).status;
    expect(await post('{}')).toBe(400);
    expect(await post(JSON.stringify({ server: 'nope' }))).toBe(404);
    expect(await post(JSON.stringify({ server: 'filesystem', member: MEMBER_IDS.theo }))).toBe(404);
  });

  it('restarts a shared process and a member’s, lifting the failure', async () => {
    expect(
      await statusOf(async () =>
        restartMcpHostedProcess({ body: { server: 'filesystem' }, throwOnError: true }),
      ),
    ).toBe(200);
    expect(
      await statusOf(async () =>
        restartMcpHostedProcess({
          body: { server: 'notes', member: MEMBER_IDS.theo },
          throwOnError: true,
        }),
      ),
    ).toBe(200);
    expect(db.mcpHosted.map((process) => [process.server, process.state, process.failure])).toEqual([
      ['filesystem', 'idle', undefined],
      ['notes', 'idle', undefined],
    ]);
  });
});
