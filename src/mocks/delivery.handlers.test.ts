// SPDX-License-Identifier: Apache-2.0
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
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

/** The status the mock answers, and its body. */
async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`http://ostrom.test/api/v1${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === '' ? undefined : (JSON.parse(text) as unknown) };
}

async function status(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return (await call(method, path, body, headers)).status;
}

/** The writes and reads of the catalog, each with a body that is right. */
const CATALOG: readonly (readonly [string, string, unknown])[] = [
  ['GET', '/skills', undefined],
  ['GET', '/skills/review-pr/versions', undefined],
  ['PUT', '/skills/review-pr/pin', { version: '1.1.0' }],
  ['DELETE', '/skills/review-pr/pin', undefined],
  ['PUT', '/skills/review-pr/audience', { allMembers: true }],
  ['GET', '/skills/review-pr/assignments', undefined],
  ['PUT', `/skills/review-pr/assignments/${MEMBER_IDS.theo}`, { decision: 'allow' }],
  ['DELETE', `/skills/review-pr/assignments/${MEMBER_IDS.theo}`, undefined],
  ['DELETE', '/skills/review-pr', undefined],
  ['POST', '/skills/review-pr/restore', undefined],
  ['DELETE', '/skills/review-pr/versions/1.1.0', undefined],
  ['POST', '/skills/maya-notes/promote', undefined],
  ['GET', `/members/${MEMBER_IDS.theo}/skill-installations`, undefined],
  ['GET', '/hooks', undefined],
  ['GET', '/hooks/require-status/versions', undefined],
  ['GET', '/hooks/require-status/versions/1.0.0', undefined],
  ['PUT', '/hooks/require-status/pin', { version: '0.9.0' }],
  ['DELETE', '/hooks/require-status/pin', undefined],
  ['PUT', '/hooks/require-status/audience', { allMembers: true }],
  ['GET', '/hooks/require-status/assignments', undefined],
  ['PUT', `/hooks/require-status/assignments/${MEMBER_IDS.theo}`, { decision: 'deny' }],
  ['DELETE', `/hooks/require-status/assignments/${MEMBER_IDS.theo}`, undefined],
  ['GET', `/members/${MEMBER_IDS.theo}/hook-delivery`, undefined],
  ['GET', `/members/${MEMBER_IDS.theo}/skill-delivery`, undefined],
];

describe('the mock catalog, as the server refuses', () => {
  it('serves every operation to an administrator', async () => {
    for (const [method, path, body] of CATALOG) {
      expect(await status(method, path, body), `${method} ${path}`).toBeLessThan(300);
    }
  });

  it('lets only owners and admins through, whatever the operation', async () => {
    setDemoRole(db, 'member');
    for (const [method, path, body] of CATALOG) {
      expect(await status(method, path, body), `${method} ${path}`).toBe(403);
    }
  });

  it('knows nothing of another organization’s skills, hooks and members', async () => {
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
    const there = { 'Ostrom-Org': globex.id };
    expect((await call('GET', '/skills', undefined, there)).json).toEqual({ items: [] });
    expect((await call('GET', '/hooks', undefined, there)).json).toEqual({ items: [] });
    expect((await call('GET', '/me/skills', undefined, there)).json).toEqual({ items: [] });
    for (const [method, path, body] of CATALOG.filter(
      ([, path]) => path.length > '/skills'.length && !path.startsWith('/members'),
    )) {
      expect(await status(method, path, body, there), `${method} ${path}`).toBe(404);
    }
    expect(await status('GET', `/members/${MEMBER_IDS.theo}/skill-delivery`, undefined, there)).toBe(404);
    expect(await status('GET', '/me/skills/maya-notes/versions', undefined, there)).toBe(404);
  });

  it('refuses what is not there: a skill, a hook, a version, a member', async () => {
    expect(await status('GET', '/skills/nope/versions')).toBe(404);
    expect(await status('PUT', '/skills/review-pr/pin', { version: '9.9.9' })).toBe(404);
    expect(await status('PUT', '/hooks/nope/pin', { version: '1' })).toBe(404);
    expect(await status('GET', '/hooks/require-status/versions/9.9.9')).toBe(404);
    expect(await status('GET', '/hooks/nope/versions/1.0.0')).toBe(404);
    expect(await status('GET', '/hooks/nope/versions')).toBe(404);
    expect(await status('PUT', '/skills/review-pr/assignments/nobody', { decision: 'allow' })).toBe(404);
    expect(await status('DELETE', '/skills/nope')).toBe(404);
    expect(await status('POST', '/skills/nope/restore')).toBe(404);
    expect(await status('POST', '/skills/nope/promote')).toBe(404);
    expect(await status('DELETE', '/skills/review-pr/versions/9.9.9')).toBe(404);
    expect(await status('GET', '/members/nobody/skill-delivery')).toBe(404);
    expect(await status('GET', '/members/nobody/hook-delivery')).toBe(404);
    expect(await status('GET', '/members/nobody/skill-installations')).toBe(404);
  });

  it('refuses a body that is not what the operation takes', async () => {
    expect(await status('PUT', '/skills/review-pr/pin', {})).toBe(400);
    expect(await status('PUT', '/skills/review-pr/audience', {})).toBe(400);
    expect(await status('PUT', `/skills/review-pr/assignments/${MEMBER_IDS.theo}`, {})).toBe(400);
    expect(
      await status('PUT', `/skills/review-pr/assignments/${MEMBER_IDS.theo}`, { decision: 'maybe' }),
    ).toBe(400);
    expect(await status('PUT', '/me/skills/maya-notes/pin', {})).toBe(400);
  });

  it('closes a retired skill and a retired version to pinning, and the pinned version to retirement', async () => {
    expect(await status('PUT', '/skills/old-lint/pin', { version: '2.0.0' })).toBe(409);
    expect(await status('PUT', '/skills/review-pr/pin', { version: '1.0.0' })).toBe(409);
    expect(await status('DELETE', '/skills/review-pr/versions/1.2.0')).toBe(409);
  });

  it('writes and clears a decision on a skill nobody has decided on yet', async () => {
    expect(await status('PUT', `/skills/old-lint/assignments/${MEMBER_IDS.theo}`, { decision: 'deny' })).toBe(
      200,
    );
    expect(await status('DELETE', `/hooks/audit-tools/assignments/${MEMBER_IDS.theo}`)).toBe(204);
  });

  it('lists no version for a skill whose versions are gone', async () => {
    delete db.skillVersions['old-lint'];
    expect(await call('GET', '/skills/old-lint/versions')).toMatchObject({
      status: 200,
      json: { versions: [] },
    });
  });

  it('sends a member’s personal skill to its promotion, and a team skill away from it', async () => {
    expect(await status('PUT', '/skills/maya-notes/pin', { version: '0.1.0' })).toBe(409);
    expect(await status('DELETE', '/skills/maya-notes/pin')).toBe(409);
    expect(await status('PUT', '/skills/maya-notes/audience', { allMembers: true })).toBe(409);
    expect(await status('GET', '/skills/maya-notes/assignments')).toBe(409);
    expect(await status('POST', '/skills/review-pr/promote')).toBe(409);
  });

  it('keeps a retired skill out of what is delivered, and a personal one for its owner', async () => {
    const delivered = async (member: string): Promise<string[]> => {
      const { json } = await call('GET', `/members/${member}/skill-delivery`);
      return (json as { skills: { name: string }[] }).skills.map((skill) => skill.name);
    };
    expect(await delivered(MEMBER_IDS.samir)).toEqual(['review-pr']);
    expect(await delivered(MEMBER_IDS.maya)).toEqual(['maya-notes', 'review-pr']);
    // An explicit Yes delivers without the audience; a retired version delivers nothing.
    const skill = db.skills.find((item) => item.name === 'review-pr');
    if (skill === undefined) throw new Error('no review-pr');
    skill.allMembers = false;
    await status('PUT', `/skills/review-pr/assignments/${MEMBER_IDS.samir}`, { decision: 'allow' });
    expect(await delivered(MEMBER_IDS.samir)).toEqual(['review-pr']);
    expect(await delivered(MEMBER_IDS.lena)).toEqual([]);
    await status('DELETE', '/skills/review-pr');
    expect(await delivered(MEMBER_IDS.samir)).toEqual([]);
    skill.retired = false;
    skill.pinnedVersion = '1.0.0';
    expect(await delivered(MEMBER_IDS.samir)).toEqual([]);
    skill.pinnedVersion = '9.9.9';
    expect(await delivered(MEMBER_IDS.samir)).toEqual([]);
  });

  it('answers a member’s own personal skills, and refuses another member’s', async () => {
    expect(await status('GET', '/me/skills/theo-sql/versions')).toBe(404);
    expect(await status('PUT', '/me/skills/maya-notes/pin', { version: '9.9.9' })).toBe(404);
    expect(await status('DELETE', '/me/skills/maya-notes')).toBe(200);
    expect(await status('PUT', '/me/skills/maya-notes/pin', { version: '0.1.0' })).toBe(409);
    expect(await status('POST', '/me/skills/maya-notes/restore')).toBe(200);
    const maya = db.skillVersions['maya-notes'];
    if (maya === undefined) throw new Error('no versions');
    for (const version of maya) version.retired = true;
    expect(await status('PUT', '/me/skills/maya-notes/pin', { version: '0.1.0' })).toBe(409);
  });

  it('hands a hook’s code, its members’ decisions and what a member receives to whoever may read them', async () => {
    const files = (await call('GET', '/hooks/require-status/versions/1.0.0')).json as { files: unknown[] };
    expect(files.files).toHaveLength(2);
    delete db.hookFiles['require-status@0.9.0'];
    const empty = (await call('GET', '/hooks/require-status/versions/0.9.0')).json as { files: unknown[] };
    expect(empty.files).toEqual([]);
    const lena = (await call('GET', `/members/${MEMBER_IDS.lena}/hook-delivery`)).json as {
      hooks: { name: string }[];
    };
    expect(lena.hooks.map((hook) => hook.name)).toEqual(['require-status']);
    const own = (await call('GET', '/hook-delivery')).json as { hooks: unknown[] };
    expect(own.hooks).toEqual([]);
    // Two pinned hooks are delivered sorted by name.
    await status('PUT', '/hooks/audit-tools/pin', { version: '0.1.0' });
    const both = (await call('GET', `/members/${MEMBER_IDS.lena}/hook-delivery`)).json as {
      hooks: { name: string }[];
    };
    expect(both.hooks.map((hook) => hook.name)).toEqual(['audit-tools', 'require-status']);
  });

  it('keeps no installation of a member who has none, nor of one who is not the caller’s to read', async () => {
    expect((await call('GET', `/members/${MEMBER_IDS.samir}/skill-installations`)).json).toEqual({
      items: [],
    });
    db.skillInstallations = {};
    expect((await call('GET', '/skill-delivery/installations')).json).toEqual({ items: [] });
  });
});
