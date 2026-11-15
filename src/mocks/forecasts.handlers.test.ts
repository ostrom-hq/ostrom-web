// SPDX-License-Identifier: Apache-2.0
import { zForecastSnapshot } from '@gen/api/zod.gen';
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

async function call(query: string, org?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://ostrom.test/api/v1/forecasts${query}`, {
    headers: org === undefined ? {} : { 'Ostrom-Org': org },
  });
  return { status: response.status, body: await response.json() };
}

describe('the mock forecasts, as the server answers', () => {
  it('shows the first account by id, every account in the picker, within the contract', async () => {
    const answer = await call('');
    expect(answer.status).toBe(200);
    const snapshot = zForecastSnapshot.parse(answer.body);
    expect(snapshot.accounts.map((account) => account.id)).toEqual(['acc-1', 'acc-2', 'acc-3']);
    expect(snapshot.account?.id).toBe('acc-1');
    expect(snapshot.windows.map((window) => window.window)).toEqual(['five_hour', 'seven_day', 'model:opus']);
    expect(snapshot.pressureThreshold).toBe(0.95);
    expect(snapshot.truncated).toBe(false);
  });

  it('shows the account asked for, an account without readings as no window, and its e-mail when it has one', async () => {
    db.sharedAccounts = db.sharedAccounts.map((account) =>
      account.id === 'acc-3' ? { ...account, email: 'team@acme.dev' } : account,
    );
    const team = zForecastSnapshot.parse((await call('?account=acc-3')).body);
    expect(team.account).toMatchObject({ id: 'acc-3', email: 'team@acme.dev' });
    expect(team.windows).toEqual([]);
    expect(zForecastSnapshot.parse((await call('?account=acc-2')).body).windows).toHaveLength(2);
  });

  it('lists nothing when the organization has no shared account', async () => {
    db.sharedAccounts = [];
    const snapshot = zForecastSnapshot.parse((await call('')).body);
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.account).toBeUndefined();
    expect(snapshot.windows).toEqual([]);
  });

  it('refuses a member, an account named twice, and an unknown account', async () => {
    expect((await call('?account=acc-1&account=acc-2')).status).toBe(400);
    expect((await call('?account=acc-9')).status).toBe(404);
    setDemoRole(db, 'member');
    expect((await call('')).status).toBe(403);
  });

  it('keeps the demo organization’s accounts out of another organization', async () => {
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
    const theirs = zForecastSnapshot.parse((await call('', globex.id)).body);
    expect(theirs.accounts).toEqual([]);
    expect(theirs.windows).toEqual([]);
    expect((await call('?account=acc-1', globex.id)).status).toBe(404);
  });
});
