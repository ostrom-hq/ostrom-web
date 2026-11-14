// SPDX-License-Identifier: Apache-2.0
import { otherOrganization } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { createMockServer } from '@/mocks/node';

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
  org?: string,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`http://ostrom.test/api/v1/me/mcp/servers${path}`, {
    method,
    headers: org === undefined ? {} : { 'Ostrom-Org': org },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, text: await response.text() };
}

const SERVER = {
  name: 'mine',
  url: 'https://mine.dev/mcp',
  transport: 'http',
  enabled: true,
  scope: 'shared',
};

describe('the mock personal MCP servers', () => {
  it('checks a server, refuses a hosted command and a taken name, and keeps 20 at most', async () => {
    expect((await call('POST', '', { ...SERVER, name: 'Bad' })).status).toBe(400);
    expect((await call('POST', '', { ...SERVER, url: 'http://x.dev' })).status).toBe(400);
    expect(
      (await call('POST', '', { name: 'mine', transport: 'stdio', enabled: true, scope: 'shared' })).status,
    ).toBe(400);
    expect((await call('POST', '', { ...SERVER, transport: 'stdio' })).text).toContain('hosted_not_allowed');
    expect((await call('POST', '', { ...SERVER, name: 'maya-notes' })).status).toBe(409);
    for (let index = 1; index < 20; index += 1) {
      expect((await call('POST', '', { ...SERVER, name: `mine-${String(index)}` })).status).toBe(201);
    }
    expect((await call('POST', '', SERVER)).text).toContain('mcp_server_limit');
  });

  it('saves and deletes the person’s own only, after a fresh sign-in', async () => {
    expect((await call('PUT', '/nope', SERVER)).status).toBe(404);
    expect((await call('PUT', '/maya-notes', SERVER)).status).toBe(400);
    expect((await call('PUT', '/maya-notes', { ...SERVER, name: 'maya-notes', enabled: false })).status).toBe(
      200,
    );
    expect(db.myMcpServers[0]?.enabled).toBe(false);
    expect((await call('DELETE', '/nope')).status).toBe(404);
    db.signedInAt = 0;
    expect((await call('PUT', '/maya-notes', SERVER)).text).toContain('step_up_required');
    expect((await call('DELETE', '/maya-notes')).text).toContain('step_up_required');
    db.signedInAt = Date.now();
    expect((await call('DELETE', '/maya-notes')).status).toBe(204);
  });

  it('keeps them out of another organization', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    expect((await call('GET', '', undefined, globex.id)).text).not.toContain('maya-notes');
    expect((await call('POST', '', SERVER, globex.id)).status).toBe(403);
    expect((await call('DELETE', '/maya-notes', undefined, globex.id)).status).toBe(404);
  });

  it('lists the members’ own servers for review and promotes one to the team', async () => {
    const team = async (path: string, method = 'GET', org?: string): Promise<Response> =>
      fetch(`http://ostrom.test/api/v1/mcp/servers${path}`, {
        method,
        headers: org === undefined ? {} : { 'Ostrom-Org': org },
      });
    expect(await (await team('?personal=true')).text()).toContain('maya-notes');
    const teamName = db.mcpServers[0]?.name ?? '';
    expect((await team(`/${teamName}/promote`, 'POST')).status).toBe(200);
    expect((await team('/nope/promote', 'POST')).status).toBe(404);
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    expect((await team('/maya-notes/promote', 'POST', globex.id)).status).toBe(404);
    db.otherOrganizations = [];
    db.signedInAt = 0;
    expect((await team('/maya-notes/promote', 'POST')).status).toBe(403);
    db.signedInAt = Date.now();
    expect((await team('/maya-notes/promote', 'POST')).status).toBe(200);
    expect(db.myMcpServers.some((server) => server.name === 'maya-notes')).toBe(false);
    const promoted = db.mcpServers.find((server) => server.name === 'maya-notes');
    expect(promoted?.owner).toBeUndefined();
    setDemoRole(db, 'member');
    expect((await team('/maya-notes/promote', 'POST')).status).toBe(403);
  });
});
