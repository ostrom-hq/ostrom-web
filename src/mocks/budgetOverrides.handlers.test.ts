// SPDX-License-Identifier: Apache-2.0
import { getResponse } from 'msw';
import { type BudgetOverridesState, createBudgetOverridesHandlers } from '@/mocks/budgetOverrides';

const state: BudgetOverridesState = { budgetOverrides: [] };
let manager = true;
let stale = false;
let clock = new Date('2026-11-15T22:30:00Z');
const handlers = createBudgetOverridesHandlers(
  () => state,
  {
    manages: () => manager,
    stale: () => stale,
    knows: (_request, login) => login === 'theo',
    me: () => 'maya',
  },
  () => clock,
);

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request(`http://ostrom.test/api/v1/members/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

const grant = (extra: object = {}) => ({
  micros: 5_000_000,
  durationMinutes: 60,
  reason: 'release',
  ...extra,
});
const idOf = (body: unknown): string => {
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string')
    throw new Error('no id');
  return body.id;
};

describe('the mock budget overrides', () => {
  afterEach(() => {
    state.budgetOverrides = [];
    manager = true;
    stale = false;
    clock = new Date('2026-11-15T22:30:00Z');
  });

  it('refuses anyone but an owner or an admin, a stale sign-in, and a login that is no member', async () => {
    manager = false;
    expect((await call('GET', 'theo/budget-overrides')).status).toBe(403);
    expect((await call('POST', 'theo/budget-overrides', grant())).status).toBe(403);
    expect((await call('POST', 'theo/budget-overrides/x/revoke', { reason: 'r' })).status).toBe(403);
    manager = true;
    stale = true;
    expect((await call('POST', 'theo/budget-overrides', grant())).body).toMatchObject({
      error: { type: 'step_up_required' },
    });
    expect((await call('POST', 'theo/budget-overrides/x/revoke', { reason: 'r' })).status).toBe(403);
    stale = false;
    expect((await call('GET', 'nobody/budget-overrides')).status).toBe(404);
    expect((await call('POST', 'nobody/budget-overrides', grant())).status).toBe(404);
  });

  it('grants until midnight UTC at the latest, replaces only the one in force, and revokes it once', async () => {
    expect((await call('POST', 'theo/budget-overrides', {})).status).toBe(400);
    expect((await call('POST', 'theo/budget-overrides', grant({ reason: 'a\nb' }))).status).toBe(400);
    expect((await call('POST', 'theo/budget-overrides', grant({ reason: ' ' }))).status).toBe(400);
    expect((await call('POST', 'theo/budget-overrides', grant({ replacesId: 'x' }))).status).toBe(409);
    const first = await call('POST', 'theo/budget-overrides', grant({ durationMinutes: 120 }));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ expiresAt: '2026-11-16T00:00:00.000Z', createdBy: 'maya' });
    const firstId = idOf(first.body);
    expect((await call('POST', 'theo/budget-overrides', grant())).status).toBe(409);
    const second = await call(
      'POST',
      'theo/budget-overrides',
      grant({ replacesId: firstId, durationMinutes: 10 }),
    );
    expect(second.body).toMatchObject({ replacesId: firstId, expiresAt: '2026-11-15T22:40:00.000Z' });
    const secondId = idOf(second.body);
    expect((await call('GET', 'theo/budget-overrides')).body).toMatchObject({
      activeId: secondId,
      items: [{ id: secondId }, { id: firstId }],
    });
    expect((await call('POST', `theo/budget-overrides/${firstId}/revoke`, { reason: 'r' })).status).toBe(409);
    expect((await call('POST', `theo/budget-overrides/${secondId}/revoke`, {})).status).toBe(400);
    expect((await call('POST', 'theo/budget-overrides/nope/revoke', { reason: 'r' })).status).toBe(404);
    const revoked = await call('POST', `theo/budget-overrides/${secondId}/revoke`, { reason: ' done ' });
    expect(revoked.body).toMatchObject({ revokedBy: 'maya', revocationReason: 'done' });
    clock = new Date('2026-11-15T22:35:00Z');
    const again = await call('POST', `theo/budget-overrides/${secondId}/revoke`, { reason: 'other' });
    expect(again.body).toMatchObject({ revocationReason: 'done' });
    expect((await call('GET', 'theo/budget-overrides')).body).not.toHaveProperty('activeId');
  });

  it('pages 50 grants at a time, newest first', async () => {
    state.budgetOverrides = Array.from({ length: 55 }, (_, index) => ({
      id: `o${String(index)}`,
      member: 'theo',
      micros: 1,
      createdAt: '2026-11-14T09:00:00Z',
      expiresAt: '2026-11-14T10:00:00Z',
      reason: 'r',
      createdBy: 'maya',
    }));
    const first = await call('GET', 'theo/budget-overrides');
    expect(first.body).toMatchObject({ next: 'o5' });
    const second = await call('GET', 'theo/budget-overrides?before=o5');
    expect(second.body).not.toHaveProperty('next');
    expect(second.body).toMatchObject({
      items: [{ id: 'o4' }, { id: 'o3' }, { id: 'o2' }, { id: 'o1' }, { id: 'o0' }],
    });
  });
});
