// SPDX-License-Identifier: AGPL-3.0-only
import {
  checkAgentPolicy,
  getInferenceSettings,
  getModelPolicy,
  setInferenceSettings,
  setModelPolicy,
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

const raw = async (method: string, path: string, body: string): Promise<number> =>
  (await fetch(`http://ostrom.test/api/v1${path}`, { method, body })).status;

async function verdict(query: {
  agent?: string;
  model?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  return (await checkAgentPolicy({ query, throwOnError: true })).data;
}

describe('the mock agent policy, as the gateway keeps it', () => {
  it('reads the policy for every member, and lets only owners and admins change it or read the keys', async () => {
    expect((await getModelPolicy({ throwOnError: true })).data).toMatchObject({
      default: 'claude-sonnet-4-5',
    });
    expect((await getInferenceSettings({ throwOnError: true })).data).toEqual({
      anthropicKeySecret: 'ANTHROPIC_API_KEY',
      useSharedAccounts: true,
    });
    setDemoRole(db, 'member');
    expect((await getModelPolicy({ throwOnError: true })).data.allowed).toEqual(['claude-', 'gpt-5']);
    const refused = [
      await statusOf(async () => getInferenceSettings({ throwOnError: true })),
      await statusOf(async () =>
        setModelPolicy({ body: { allowed: [], default: 'claude-sonnet-4-5' }, throwOnError: true }),
      ),
      await statusOf(async () =>
        setInferenceSettings({ body: { useSharedAccounts: false }, throwOnError: true }),
      ),
    ];
    expect(refused).toEqual([403, 403, 403]);
  });

  it('saves a policy and the keys, and refuses what the gateway refuses', async () => {
    const saved = await setModelPolicy({
      body: { allowed: ['claude-'], default: 'claude-opus-4-1', byMember: { [MEMBER_IDS.lena]: ['gpt-5'] } },
      throwOnError: true,
    });
    expect(saved.data.byMember).toEqual({ [MEMBER_IDS.lena]: ['gpt-5'] });
    expect((await setModelPolicy({ body: { allowed: [], default: 'x' }, throwOnError: true })).data).toEqual({
      allowed: [],
      default: 'x',
    });
    expect(await raw('PUT', '/policy/models', '{"allowed":[],"default":"x","byMember":{"maya":["x"]}}')).toBe(
      400,
    );
    expect(
      await raw('PUT', '/policy/models', `{"allowed":[],"default":"x","byMember":{"${MEMBER_IDS.lena}":[]}}`),
    ).toBe(400);
    expect(await raw('PUT', '/policy/models', '{"allowed":["claude opus"],"default":"x"}')).toBe(400);
    expect(await raw('PUT', '/policy/models', '{"allowed":[],"default":""}')).toBe(400);
    expect(await raw('PUT', '/policy/models', '{"allowed":1}')).toBe(400);
    const keys = await setInferenceSettings({
      body: { openaiKeySecret: 'OPENAI_KEY', openrouterKeySecret: 'ROUTER', useSharedAccounts: false },
      throwOnError: true,
    });
    expect(keys.data).toEqual({
      openaiKeySecret: 'OPENAI_KEY',
      openrouterKeySecret: 'ROUTER',
      useSharedAccounts: false,
    });
    expect(
      (await setInferenceSettings({ body: { anthropicKeySecret: 'A' }, throwOnError: true })).data,
    ).toEqual({
      anthropicKeySecret: 'A',
      useSharedAccounts: true,
    });
    expect(await raw('PUT', '/inference/settings', '{"anthropicKeySecret":"not a name"}')).toBe(400);
    expect(await raw('PUT', '/inference/settings', '{"useSharedAccounts":"yes"}')).toBe(400);
  });

  it('answers whether a launch would pass, as the CLI asks it', async () => {
    expect(await verdict({ agent: 'claude' })).toEqual({ allowed: true });
    expect(await verdict({ agent: 'codex', model: 'gpt-5.1-codex' })).toEqual({ allowed: true });
    expect(await verdict({ agent: 'claude', model: 'gemini-2.5-pro' })).toEqual({
      allowed: false,
      reason: 'The organization does not allow gemini-2.5-pro.',
    });
    expect((await verdict({ agent: 'Claude Code' })).reason).toBe('The agent name is not valid.');
    expect((await verdict({ agent: 'claude', model: 'claude opus' })).reason).toBe(
      'The model name is not valid.',
    );
    // A member's own list replaces the organization's.
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, id: MEMBER_IDS.theo } : member,
    );
    expect((await verdict({ agent: 'claude', model: 'claude-sonnet-4-5' })).allowed).toBe(false);
    expect((await verdict({ agent: 'claude', model: 'claude-haiku-4-5' })).allowed).toBe(true);
    // Without an id in the members, the organization's list applies.
    db.members = [];
    expect((await verdict({ agent: 'claude', model: 'claude-sonnet-4-5' })).allowed).toBe(true);
    setDemoRole(db, 'billing');
    expect(await verdict({ agent: 'claude' })).toEqual({
      allowed: false,
      reason: 'A billing member does not run agents.',
    });
  });

  it('keeps each organization its own policy: a new one has no list and no key', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    db.orgMembers[globex.id] = [
      {
        login: 'maya',
        name: '',
        avatarUrl: '',
        email: null,
        role: 'owner',
        joinedAt: '2026-09-01T09:00:00.000Z',
      },
    ];
    const headers = { 'Ostrom-Org': globex.id };
    expect((await getModelPolicy({ headers, throwOnError: true })).data).toEqual({
      allowed: [],
      default: '',
    });
    expect((await getInferenceSettings({ headers, throwOnError: true })).data).toEqual({
      useSharedAccounts: true,
    });
    expect(
      (await checkAgentPolicy({ headers, query: { agent: 'claude', model: 'anything' }, throwOnError: true }))
        .data,
    ).toEqual({ allowed: true });
  });
});
