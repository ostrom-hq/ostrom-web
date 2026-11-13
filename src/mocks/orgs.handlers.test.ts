// SPDX-License-Identifier: AGPL-3.0-only
import {
  acceptInvitation,
  createInvitationLink,
  createOrg,
  getOrg,
  inviteOrgMembers,
  listInvitations,
  listOrgMembers,
  listOrgs,
  previewInvitation,
  removeOrgMember,
  renameOrg,
  revokeInvitation,
  updateOrgMember,
} from '@gen/api/sdk.gen';
import { DEMO_INVITATION_TOKEN, DEMO_SETUP_TOKEN, otherOrganization } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { freeSlug, setDemoRole } from '@/mocks/orgs';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { appliedOf } from '@/shared/api/held';
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

async function raw(method: string, path: string, body: string): Promise<number> {
  const response = await fetch(`${API}/api/v1${path}`, method === 'GET' ? {} : { method, body });
  return response.status;
}

const org = 'acme';
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

describe('mock organizations', () => {
  it('lists the person’s organizations with their role, none for a fresh account', async () => {
    const globex = otherOrganization();
    // An organization without a creation date still lists, dated now.
    delete globex.createdAt;
    db.otherOrganizations = [globex];
    const { data } = await listOrgs({ throwOnError: true });
    expect(data.items).toMatchObject([
      { slug: 'acme', name: 'Acme', role: 'admin' },
      { slug: 'globex', name: 'Globex', role: 'owner' },
    ]);
    db.noOrganization = true;
    expect((await listOrgs({ throwOnError: true })).data.items).toEqual([]);
  });

  it('reads an organization by id or short name, and not one the person is not in', async () => {
    expect((await getOrg({ path: { org: ACME }, throwOnError: true })).data.name).toBe('Acme');
    expect((await getOrg({ path: { org }, throwOnError: true })).data.id).toBe(ACME);
    expect(await failure(async () => getOrg({ path: { org: 'initech' }, throwOnError: true }))).toMatchObject(
      {
        status: 404,
      },
    );
  });

  it('creates an organization owned by its creator, with a short name from its name or given', async () => {
    const made = await createOrg({ body: { name: '  Wayne Enterprises ' }, throwOnError: true });
    expect(made.data).toMatchObject({ slug: 'wayne-enterprises', name: 'Wayne Enterprises', role: 'owner' });
    const named = await createOrg({ body: { name: 'Stark', slug: 'stark-ind' }, throwOnError: true });
    expect(named.data.slug).toBe('stark-ind');
    expect((await listOrgs({ throwOnError: true })).data.items.map((item) => item.slug)).toEqual([
      'acme',
      'wayne-enterprises',
      'stark-ind',
    ]);
    expect(
      (await listOrgMembers({ path: { org: 'stark-ind' }, throwOnError: true })).data.items,
    ).toMatchObject([{ login: 'maya', role: 'owner' }]);
  });

  it('makes the first organization of a fresh account the one every screen reads', async () => {
    db.noOrganization = true;
    await createOrg({ body: { name: 'Wayne' }, throwOnError: true });
    expect(db.noOrganization).toBe(false);
    expect(db.organization.name).toBe('Wayne');
  });

  it('refuses a missing name, a bad or taken short name, and numbers a derived one that is taken', async () => {
    expect(await raw('POST', '/orgs', '{}')).toBe(400);
    expect(await raw('POST', '/orgs', JSON.stringify({ name: 'x'.repeat(101) }))).toBe(400);
    expect(await raw('POST', '/orgs', 'not json')).toBe(400);
    expect(
      await failure(async () => createOrg({ body: { name: 'A', slug: 'Bad Slug' }, throwOnError: true })),
    ).toMatchObject({ status: 400 });
    expect(
      await failure(async () => createOrg({ body: { name: 'A', slug: 'acme' }, throwOnError: true })),
    ).toMatchObject({ status: 409, code: 'slug_taken' });
    expect((await createOrg({ body: { name: 'Acme' }, throwOnError: true })).data.slug).toBe('acme-2');
    expect((await createOrg({ body: { name: 'Acme' }, throwOnError: true })).data.slug).toBe('acme-3');
    expect((await createOrg({ body: { name: 'Acme Corp' }, throwOnError: true })).data.slug).toBe(
      'acme-corp-2',
    );
    expect((await createOrg({ body: { name: 'Initech' }, throwOnError: true })).data.slug).toBe('initech-2');
  });

  it('numbers a taken short name as the server does: cut to 39 characters, random after 20', () => {
    const base = 'a'.repeat(38) + 'b';
    expect(freeSlug(base, new Set([base]))).toBe(`${'a'.repeat(37)}-2`);
    const dashed = `${'a'.repeat(36)}-bc`;
    expect(freeSlug(dashed, new Set([dashed]))).toBe(`${'a'.repeat(36)}-2`);
    const crowded = new Set(['acme', ...Array.from({ length: 19 }, (_, n) => `acme-${String(n + 2)}`)]);
    expect(freeSlug('acme', crowded)).toMatch(/^acme-[0-9a-f]{8}$/);
  });

  it('renames an organization for its owners and admins only', async () => {
    expect(
      (await renameOrg({ path: { org }, body: { name: ' Acme Inc ' }, throwOnError: true })).data.name,
    ).toBe('Acme Inc');
    expect(await raw('PATCH', `/orgs/${org}`, '{"name":""}')).toBe(400);
    expect(await raw('PATCH', `/orgs/${org}`, JSON.stringify({ name: 'x'.repeat(101) }))).toBe(400);
    expect(await raw('PATCH', `/orgs/${org}`, 'nope')).toBe(400);
    expect(await raw('PATCH', '/orgs/nowhere', '{"name":"x"}')).toBe(404);
    setDemoRole(db, 'member');
    expect(await raw('PATCH', `/orgs/${org}`, '{"name":"x"}')).toBe(403);
  });
});

describe('mock members of an organization', () => {
  it('changes a role the caller can give, and refuses the rest', async () => {
    const { data } = await updateOrgMember({
      path: { org, login: 'theo' },
      body: { role: 'billing' },
      throwOnError: true,
    });
    expect(appliedOf(data)?.role).toBe('billing');
    const refused = async (login: string, role: string): Promise<number | undefined> =>
      (
        await failure(async () =>
          updateOrgMember({ path: { org, login }, body: { role }, throwOnError: true }),
        )
      ).status;
    expect(await refused('nobody', 'member')).toBe(404);
    expect(await refused('theo', 'king')).toBe(400);
    expect(await refused('maya', 'member')).toBe(403);
    expect(await refused('lena', 'member')).toBe(403);
    expect(await refused('theo', 'admin')).toBe(403);
    expect(await raw('PATCH', '/orgs/nowhere/members/theo', '{"role":"member"}')).toBe(404);
    expect(await raw('PATCH', `/orgs/${org}/members/theo`, 'nope')).toBe(400);
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).map((member) =>
      member.login === 'theo' ? { ...member, role: 'auditor' } : member,
    );
    expect(await refused('theo', 'member')).toBe(403);
  });

  it('removes a person the caller manages, and nobody else', async () => {
    await removeOrgMember({ path: { org, login: 'theo' }, throwOnError: true });
    expect((db.orgMembers[ACME] ?? []).map((member) => member.login)).not.toContain('theo');
    const status = async (login: string): Promise<number | undefined> =>
      (await failure(async () => removeOrgMember({ path: { org, login }, throwOnError: true }))).status;
    expect(await status('theo')).toBe(404);
    expect(await status('lena')).toBe(403);
    expect(await raw('DELETE', '/orgs/nowhere/members/samir', '')).toBe(404);
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).map((member) =>
      member.login === 'samir' ? { ...member, role: 'auditor' } : member,
    );
    expect(await status('samir')).toBe(403);
  });

  it('lists the members of an organization the person is in only', async () => {
    expect((await listOrgMembers({ path: { org }, throwOnError: true })).data.items).toHaveLength(5);
    expect(await raw('GET', '/orgs/nowhere/members', '')).toBe(404);
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).filter((member) => member.login !== 'maya');
    expect((await getOrg({ path: { org }, throwOnError: true })).data.role).toBe('member');
    db.orgMembers = {};
    setDemoRole(db, 'billing');
    expect(db.orgMembers[ACME]).toEqual([]);
    db.orgMembers = {};
    expect((await listOrgMembers({ path: { org }, throwOnError: true })).data.items).toMatchObject([
      { login: 'maya', role: 'owner' },
    ]);
  });

  it('pages the members as the server does: `limit` from 1 to 1000, `after` the previous `next`', async () => {
    const page = async (limit?: number, after?: string) =>
      (
        await listOrgMembers({
          path: { org },
          query: { ...(limit === undefined ? {} : { limit }), ...(after === undefined ? {} : { after }) },
          throwOnError: true,
        })
      ).data;
    const all = (await page()).items;
    expect(all).toHaveLength(5);
    expect((await page()).next).toBeUndefined();
    const first = await page(2);
    expect(first.items).toEqual(all.slice(0, 2));
    expect(first.next).toBe(all[1]?.id);
    const second = await page(2, first.next);
    expect(second.items).toEqual(all.slice(2, 4));
    expect(await page(2, second.next)).toEqual({ items: all.slice(4) });
    expect(await page(2, '00000000-0000-4000-8000-000000000000')).toEqual({ items: [] });
    expect(await raw('GET', `/orgs/${org}/members?limit=0`, '')).toBe(400);
    expect(await raw('GET', `/orgs/${org}/members?limit=two`, '')).toBe(400);
    expect(await raw('GET', `/orgs/${org}/members?limit=1001`, '')).toBe(400);
    expect(await raw('GET', `/orgs/${org}/members?after=lena`, '')).toBe(400);
  });

  it('finds the members whose login or name starts with `q`, whatever the case, a page at a time', async () => {
    const found = async (q: string, limit?: number, after?: string) =>
      (
        await listOrgMembers({
          path: { org },
          query: { q, ...(limit === undefined ? {} : { limit }), ...(after === undefined ? {} : { after }) },
          throwOnError: true,
        })
      ).data;
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).map((member) =>
      member.login === 'theo' ? { ...member, name: 'Sara Abel' } : member,
    );
    // samir by his login, theo by his name; `abel` starts neither.
    expect((await found('SA')).items.map((member) => member.login)).toEqual(['samir', 'theo']);
    expect((await found('sara')).items.map((member) => member.login)).toEqual(['theo']);
    expect((await found('abel')).items).toEqual([]);
    // Paged after the filter.
    const first = await found('sa', 1);
    expect(first.items.map((member) => member.login)).toEqual(['samir']);
    expect(await found('sa', 1, first.next)).toEqual({ items: [expect.objectContaining({ login: 'theo' })] });
    expect(await raw('GET', `/orgs/${org}/members?q=`, '')).toBe(400);
    expect(await raw('GET', `/orgs/${org}/members?q=${'a'.repeat(101)}`, '')).toBe(400);
  });
});

describe('mock invitations', () => {
  it('invites each new address once, as a role the caller can give', async () => {
    const { data } = await inviteOrgMembers({
      path: { org },
      body: {
        invites: [
          { email: 'Ana@acme.dev', role: 'approver' },
          { email: 'ana@acme.dev' },
          { email: 'theo@acme.dev' },
        ],
      },
      throwOnError: true,
    });
    expect(appliedOf(data)?.invited).toEqual(['ana@acme.dev']);
    const { data: listed } = await listInvitations({ path: { org }, throwOnError: true });
    expect(listed.items[0]).toEqual({
      id: 'inv-1',
      email: 'ana@acme.dev',
      role: 'approver',
      createdAt: listed.items[0]?.createdAt,
      expiresAt: listed.items[0]?.expiresAt,
      maxUses: 1,
      uses: 0,
    });
    const owner = await failure(async () =>
      inviteOrgMembers({
        path: { org },
        body: { invites: [{ email: 'bo@acme.dev', role: 'owner' }] },
        throwOnError: true,
      }),
    );
    expect(owner.status).toBe(403);
    expect(await raw('POST', `/orgs/${org}/members/invites`, '{"invites":[]}')).toBe(400);
    expect(await raw('POST', '/orgs/nowhere/members/invites', '{"invites":[]}')).toBe(404);
  });

  it('lets only owners and admins invite, list and revoke', async () => {
    setDemoRole(db, 'member');
    expect(await raw('POST', `/orgs/${org}/members/invites`, '{"invites":[{"email":"a@b.co"}]}')).toBe(403);
    expect(await raw('GET', `/orgs/${org}/invitations`, '')).toBe(403);
    expect(await raw('POST', `/orgs/${org}/invitations/links`, '{}')).toBe(403);
    expect(await raw('DELETE', `/orgs/${org}/invitations/inv-jo`, '')).toBe(403);
    expect(await raw('GET', '/orgs/nowhere/invitations', '')).toBe(404);
    expect(await raw('POST', '/orgs/nowhere/invitations/links', '{}')).toBe(404);
    expect(await raw('DELETE', '/orgs/nowhere/invitations/inv-jo', '')).toBe(404);
  });

  it('makes a link of 1 to 100 uses, as a role the caller can give', async () => {
    const { data } = await createInvitationLink({ path: { org }, body: {}, throwOnError: true });
    expect(appliedOf(data)?.invitation).toMatchObject({ email: null, role: 'member', maxUses: 10 });
    expect(appliedOf(data)?.url).toBe(`${API}/invite#token=inv_1`);
    expect(await raw('POST', `/orgs/${org}/invitations/links`, '{"maxUses":0}')).toBe(400);
    expect(await raw('POST', `/orgs/${org}/invitations/links`, '{"maxUses":101}')).toBe(400);
    expect(await raw('POST', `/orgs/${org}/invitations/links`, '{"role":"king"}')).toBe(400);
    expect(await raw('POST', `/orgs/${org}/invitations/links`, 'nope')).toBe(400);
    expect(await raw('POST', `/orgs/${org}/invitations/links`, '{"role":"admin"}')).toBe(403);
  });

  it('takes the setup link once and a live invitation, and nothing else, for a sign-up grant', async () => {
    expect(await raw('POST', '/auth/signup-grant', `{"token":"${DEMO_SETUP_TOKEN}"}`)).toBe(204);
    expect(await raw('POST', '/auth/signup-grant', `{"token":"${DEMO_INVITATION_TOKEN}"}`)).toBe(204);
    expect(db.grants).toEqual([DEMO_SETUP_TOKEN, DEMO_INVITATION_TOKEN]);
    expect(await raw('POST', '/auth/signup-grant', '{"token":"nope"}')).toBe(404);
    expect(await raw('POST', '/auth/signup-grant', '{}')).toBe(400);
    // The setup link is used once.
    expect(db.setupUsed).toBe(true);
    expect(await raw('POST', '/auth/signup-grant', `{"token":"${DEMO_SETUP_TOKEN}"}`)).toBe(404);
  });

  it('says who may sign up', async () => {
    const open = await fetch(`${API}/api/v1/auth/providers`);
    expect(await open.json()).toEqual({ methods: ['github', 'email'], signUp: 'open' });
    db.signUp = 'invite';
    const closed = await fetch(`${API}/api/v1/auth/providers`);
    expect(await closed.json()).toMatchObject({ signUp: 'invite' });
  });

  it('revokes an invitation of the organization, never one of another', async () => {
    await revokeInvitation({ path: { org, id: 'inv-jo' }, throwOnError: true });
    expect(await raw('DELETE', `/orgs/${org}/invitations/inv-jo`, '')).toBe(404);
    expect(await raw('DELETE', `/orgs/${org}/invitations/inv-initech`, '')).toBe(404);
  });

  it('previews a live invitation, and nothing for a used up, expired or unknown one', async () => {
    const { data } = await previewInvitation({ body: { token: DEMO_INVITATION_TOKEN }, throwOnError: true });
    expect(data).toMatchObject({ orgName: 'Initech', orgSlug: 'initech', role: 'approver', email: null });
    expect((await previewInvitation({ body: { token: 'inv_jo' }, throwOnError: true })).data.orgName).toBe(
      'Acme',
    );
    expect(await raw('POST', '/invitations/preview', '{"token":"nope"}')).toBe(404);
    expect(await raw('POST', '/invitations/preview', 'nope')).toBe(404);
    db.invitations = db.invitations.map((item) => ({ ...item, uses: 5 }));
    expect(await raw('POST', '/invitations/preview', `{"token":"${DEMO_INVITATION_TOKEN}"}`)).toBe(404);
    db.invitations = db.invitations.map((item) => ({ ...item, uses: 0, expiresAt: '2020-01-01T00:00:00Z' }));
    expect(await raw('POST', '/invitations/preview', `{"token":"${DEMO_INVITATION_TOKEN}"}`)).toBe(404);
    db.elsewhere = [];
    db.invitations = db.invitations.map((item) => ({ ...item, expiresAt: '2099-01-01T00:00:00Z' }));
    expect(await raw('POST', '/invitations/preview', `{"token":"${DEMO_INVITATION_TOKEN}"}`)).toBe(404);
  });

  it('joins the organization an invitation leads to, with its role, once', async () => {
    const { data } = await acceptInvitation({ body: { token: DEMO_INVITATION_TOKEN }, throwOnError: true });
    expect(data).toMatchObject({ name: 'Initech', role: 'approver' });
    expect((await listOrgs({ throwOnError: true })).data.items.map((item) => item.slug)).toEqual([
      'acme',
      'initech',
    ]);
    expect(db.invitations.find((item) => item.token === DEMO_INVITATION_TOKEN)?.uses).toBe(2);
    expect(await raw('POST', '/invitations/accept', `{"token":"${DEMO_INVITATION_TOKEN}"}`)).toBe(409);
    expect(await raw('POST', '/invitations/accept', '{"token":"inv_jo"}')).toBe(404);
    expect(await raw('POST', '/invitations/accept', '{"token":"nope"}')).toBe(404);
    expect(await raw('POST', '/invitations/accept', 'nope')).toBe(404);
  });

  it('makes the organization a fresh account joins the one every screen reads', async () => {
    db.noOrganization = true;
    db.invitations = db.invitations.map((item) =>
      item.token === DEMO_INVITATION_TOKEN ? { ...item, email: 'maya@acme.dev' } : item,
    );
    await acceptInvitation({ body: { token: DEMO_INVITATION_TOKEN }, throwOnError: true });
    expect(db.organization.name).toBe('Initech');
    expect(db.noOrganization).toBe(false);
  });

  it('accepts no organization-scoped call for a person in none', async () => {
    db.noOrganization = true;
    expect(await raw('GET', '/secrets', '')).toBe(404);
  });
});
