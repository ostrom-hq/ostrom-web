// SPDX-License-Identifier: AGPL-3.0-only
import { getSpending, listActivity, listBudgets, listGroups, listSessions } from '@gen/api/sdk.gen';
import { growLarge, LARGE, largeRules } from '@/mocks/fixtures/large';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { configureApiClient } from '@/shared/api/apiClient';
import { z } from 'zod';

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

const zRulesPage = z.object({
  items: z.array(z.object({ id: z.string() })).optional(),
  next: z.string().optional(),
});

interface RulesPage {
  readonly status: number;
  readonly ids: readonly string[];
  readonly next: string | undefined;
}

/** The rules route read as is: the vendored contract does not name `after` and `limit` yet. */
async function rules(query: string): Promise<RulesPage> {
  const response = await fetch(`http://ostrom.test/api/v1/rules${query}`);
  const body = zRulesPage.parse(await response.json());
  return { status: response.status, ids: (body.items ?? []).map((rule) => rule.id), next: body.next };
}

describe('the large organization', () => {
  it('has 500 more members, 50 more groups, 2 000 rules, 10 000 lines and 300 sessions', () => {
    const members = db.orgMembers[db.organization.id]?.length ?? 0;
    const groups = db.groups.length;
    const budgets = db.budgets.length;
    growLarge(db);
    expect(db.orgMembers[db.organization.id]).toHaveLength(members + LARGE.members);
    expect(db.groups).toHaveLength(groups + LARGE.groups);
    expect(db.rules).toHaveLength(LARGE.rules);
    expect(db.activity).toHaveLength(LARGE.activity);
    expect(db.sessions).toHaveLength(LARGE.sessions);
    expect(db.sessions.filter((session) => session.endedAt === undefined)).toHaveLength(LARGE.openSessions);
    expect(db.budgets).toHaveLength(budgets + LARGE.members);
  });

  it('makes an organization whose members the demo never listed', () => {
    db.orgMembers = {};
    growLarge(db);
    expect(db.orgMembers[db.organization.id]).toHaveLength(LARGE.members);
  });

  it('lists its rules by group then id, as the server does', () => {
    const ids = largeRules().map((rule) => `${rule.group ?? ''}/${rule.id}`);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(largeRules().map((rule) => rule.output))).toEqual(new Set(['gate', 'check', 'note']));
  });

  it('serves its activity 50 lines a page, as the server does', async () => {
    growLarge(db);
    const { data } = await listActivity({ throwOnError: true });
    expect(data.items).toHaveLength(50);
    expect(data.next).toBeDefined();
    expect(new Set(db.activity.map((item) => item.kind))).toEqual(
      new Set(['session.started', 'session.ended', 'gate.requested', 'workflow.changed']),
    );
  });

  it('serves its groups, sessions, budgets and the spending of all its members', async () => {
    growLarge(db);
    const groups = await listGroups({ throwOnError: true });
    expect(groups.data.items.length).toBeGreaterThanOrEqual(LARGE.groups);
    const open = await listSessions({ query: { open: true }, throwOnError: true });
    expect(open.data.items).toHaveLength(50);
    const month = await getSpending({ query: { period: 'month' }, throwOnError: true });
    const week = await getSpending({ query: { period: 'week' }, throwOnError: true });
    expect(month.data.byPerson).toHaveLength(LARGE.members);
    expect(week.data.daily).toHaveLength(7);
    expect(month.data.totalUsd).toBeGreaterThan(week.data.totalUsd);
    const budgets = await listBudgets({ throwOnError: true });
    expect(budgets.data.orgSpentUsd).toBe(month.data.totalUsd);
  });
});

describe('GET /rules, a page at a time', () => {
  beforeEach(() => {
    growLarge(db);
  });

  it('gives 1 000 rules by default, then the rest after the cursor', async () => {
    const first = await rules('');
    expect(first.ids).toHaveLength(1000);
    expect(first.next).toBe(first.ids.at(-1));
    const second = await rules(`?after=${first.next ?? ''}`);
    expect(second.ids).toHaveLength(1000);
    expect(second.ids[0]).not.toBe(first.ids[0]);
    expect(second.next).toBeUndefined();
  });

  it('brings the limit into 1 to 1 000', async () => {
    expect((await rules('?limit=5')).ids).toHaveLength(5);
    expect((await rules('?limit=5000')).ids).toHaveLength(1000);
    expect((await rules('?limit=0')).ids).toHaveLength(1);
  });

  it('filters before the page', async () => {
    const page = await rules('?status=accepted');
    expect(page.ids.length).toBeLessThan(1000);
    expect(page.next).toBeUndefined();
  });

  it('refuses a cursor no page gave', async () => {
    expect((await rules('?after=R-none')).status).toBe(400);
  });
});
