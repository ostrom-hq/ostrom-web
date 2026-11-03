// SPDX-License-Identifier: AGPL-3.0-only
import {
  createToken,
  deleteOrg,
  listAuthSessions,
  listOrgs,
  listTokens,
  logoutEverywhere,
  revokeAuthSession,
  revokeToken,
  rotateToken,
} from '@gen/api/sdk.gen';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();
const API = 'http://ostrom.test';
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

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

async function raw(method: string, path: string, body?: string): Promise<number> {
  const response = await fetch(`${API}/api/v1${path}`, body === undefined ? { method } : { method, body });
  return response.status;
}

describe('mock tokens', () => {
  it('lists the live tokens, newest first, never with a secret', async () => {
    const { data } = await listTokens({ throwOnError: true });
    expect(data.tokens.map((token) => token.name)).toEqual(['GitHub Actions', 'ostrom on maya-mbp']);
    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('creates a token that expires, or one that never does, and shows its secret once', async () => {
    const now = Date.now();
    const made = await createToken({
      body: { name: '  CI  ', scopes: ['receipts:read', 'receipts:read'], expiresInDays: 30 },
      throwOnError: true,
    });
    expect(made.data.token).toMatchObject({ name: 'CI', kind: 'personal', scopes: ['receipts:read'] });
    expect(made.data.secret).toMatch(/^osp_/);
    expect(made.data.token.hint).toBe(made.data.secret.slice(0, 8));
    const expires = Date.parse(made.data.token.expiresAt ?? '');
    expect(expires - now).toBeGreaterThanOrEqual(30 * 86_400_000 - 1_000);
    const forever = await createToken({
      body: { name: 'Forever', scopes: ['orgs:read'] },
      throwOnError: true,
    });
    expect(forever.data.token.expiresAt).toBeNull();
    const { data } = await listTokens({ throwOnError: true });
    expect(data.tokens.map((token) => token.name).slice(0, 2)).toEqual(['Forever', 'CI']);
    expect(JSON.stringify(data)).not.toContain(made.data.secret);
  });

  it('refuses a token without a name, without scopes, with one no token carries, or too long-lived', async () => {
    const bad = async (body: Parameters<typeof createToken>[0]['body']) =>
      failure(async () => createToken({ body, throwOnError: true }));
    expect(await bad({ name: ' ', scopes: ['orgs:read'] })).toMatchObject({ status: 400 });
    expect(await bad({ name: 'x'.repeat(101), scopes: ['orgs:read'] })).toMatchObject({ status: 400 });
    expect(await bad({ name: 'CI', scopes: [] })).toMatchObject({ status: 400 });
    expect(await bad({ name: 'CI', scopes: ['gates:answer'] })).toMatchObject({ status: 400 });
    expect(await bad({ name: 'CI', scopes: ['Not A Scope'] })).toMatchObject({ status: 400 });
    expect(await bad({ name: 'CI', scopes: ['orgs:read'], expiresInDays: 367 })).toMatchObject({
      status: 400,
    });
    expect(await bad({ name: 'CI', scopes: ['orgs:read'], expiresInDays: 0 })).toMatchObject({ status: 400 });
    expect(await raw('POST', '/tokens', 'not json')).toBe(400);
    const many = Array.from({ length: 33 }, (_, index) => `r${String(index)}:read`);
    expect(await bad({ name: 'CI', scopes: many })).toMatchObject({ status: 400 });
  });

  it('replaces a secret: a new token takes the old one’s place, with its name, scopes and expiry', async () => {
    const rotated = await rotateToken({ path: { id: 'tok-2' }, throwOnError: true });
    expect(rotated.data.token).toMatchObject({
      name: 'GitHub Actions',
      scopes: ['receipts:read', 'workflows:read'],
      expiresAt: '2026-11-19T09:00:00Z',
      lastUsedAt: null,
    });
    expect(rotated.data.token.id).not.toBe('tok-2');
    const ids = (await listTokens({ throwOnError: true })).data.tokens.map((token) => token.id);
    expect(ids).toEqual([rotated.data.token.id, 'tok-1']);
    expect(
      await failure(async () => rotateToken({ path: { id: 'tok-2' }, throwOnError: true })),
    ).toMatchObject({
      status: 404,
    });
  });

  it('revokes a token once', async () => {
    await revokeToken({ path: { id: 'tok-1' }, throwOnError: true });
    expect((await listTokens({ throwOnError: true })).data.tokens.map((token) => token.id)).toEqual([
      'tok-2',
    ]);
    expect(
      await failure(async () => revokeToken({ path: { id: 'tok-1' }, throwOnError: true })),
    ).toMatchObject({
      status: 404,
    });
  });
});

describe('mock sessions', () => {
  it('lists the sessions, ends another one, and ending this one signs out', async () => {
    const { data } = await listAuthSessions({ throwOnError: true });
    expect(data.items.map((session) => session.id)).toEqual(['ses-browser', 'ses-phone', 'ses-laptop']);
    await revokeAuthSession({ path: { id: 'ses-phone' }, throwOnError: true });
    expect(db.signedIn).toBe(true);
    expect(
      await failure(async () => revokeAuthSession({ path: { id: 'ses-phone' }, throwOnError: true })),
    ).toMatchObject({ status: 404 });
    await revokeAuthSession({ path: { id: 'ses-browser' }, throwOnError: true });
    expect(db.signedIn).toBe(false);
    expect(await failure(async () => listAuthSessions({ throwOnError: true }))).toMatchObject({
      status: 401,
    });
  });

  it('signs out everywhere; the next sign-in is this browser’s new session', async () => {
    await logoutEverywhere({ throwOnError: true });
    expect(db.signedIn).toBe(false);
    expect(db.authSessions).toEqual([]);
    db.signedIn = true;
    const { data } = await listAuthSessions({ throwOnError: true });
    expect(data.items).toMatchObject([{ current: true, device: 'This browser' }]);
  });
});

describe('mock organization deletion', () => {
  it('lets only the owner delete, with the short name typed again', async () => {
    expect(
      await failure(async () =>
        deleteOrg({ path: { org: ACME }, body: { confirm: 'acme' }, throwOnError: true }),
      ),
    ).toMatchObject({ status: 403, code: 'forbidden' });
    setDemoRole(db, 'owner');
    expect(
      await failure(async () =>
        deleteOrg({ path: { org: ACME }, body: { confirm: 'Acme' }, throwOnError: true }),
      ),
    ).toMatchObject({ status: 400, code: 'invalid_request' });
    expect(await raw('DELETE', `/orgs/${ACME}`, 'not json')).toBe(400);
    expect(
      await failure(async () =>
        deleteOrg({ path: { org: 'initech' }, body: { confirm: 'initech' }, throwOnError: true }),
      ),
    ).toMatchObject({ status: 404 });
    await deleteOrg({ path: { org: 'acme' }, body: { confirm: 'acme' }, throwOnError: true });
    expect((await listOrgs({ throwOnError: true })).data.items).toEqual([]);
    expect(db.invitations.some((invitation) => invitation.orgId === ACME)).toBe(false);
  });

  it('keeps the other organizations: the next one becomes the demo’s own', async () => {
    const globex = otherOrganization();
    const initech = { ...otherOrganization(), id: 'org-initech', name: 'Initech' };
    db.otherOrganizations = [globex, initech];
    setDemoRole(db, 'owner');
    // Globex has no members the demo knows of: it is the person's own.
    await deleteOrg({ path: { org: initech.id }, body: { confirm: 'initech' }, throwOnError: true });
    await deleteOrg({ path: { org: ACME }, body: { confirm: 'acme' }, throwOnError: true });
    expect((await listOrgs({ throwOnError: true })).data.items.map((item) => item.name)).toEqual(['Globex']);
    expect(db.organization.id).toBe(globex.id);
  });
});
