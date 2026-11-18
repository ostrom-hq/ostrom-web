// SPDX-License-Identifier: Apache-2.0
import { getResponse } from 'msw';
import { createPoolsHandlers, initialPoolsState } from '@/mocks/pools';

let state = initialPoolsState();
let manager = true;
const known = new Set(['maya', 'theo', 'lena']);
const handlers = createPoolsHandlers(() => state, {
  manages: () => manager,
  knows: (_request, login) => known.has(login),
  me: () => 'maya',
});

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request(`http://ostrom.test/api/v1/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

function codeOf(answer: { readonly body: unknown }): unknown {
  return answer.body !== null && typeof answer.body === 'object' && 'error' in answer.body
    ? answer.body.error
    : undefined;
}

describe('the mock pools', () => {
  afterEach(() => {
    state = initialPoolsState();
    manager = true;
  });

  it('lets owners and admins read and save the budgets, with TeamCode’s refusals', async () => {
    expect((await call('GET', 'pools/budgets')).body).toHaveLength(2);
    expect((await call('PUT', 'pools/budgets', { poolId: 'support', dailyMicros: 5_000_000 })).body).toEqual({
      poolId: 'support',
      dailyMicros: 5_000_000,
      sharedOverflow: false,
    });
    expect((await call('PUT', 'pools/budgets', 'nope')).status).toBe(400);
    expect(
      codeOf(await call('PUT', 'pools/budgets', { poolId: '', dailyMicros: 1, sharedOverflow: true })),
    ).toMatchObject({
      type: 'invalid_overflow_pool',
    });
    expect(codeOf(await call('PUT', 'pools/budgets', { poolId: '', dailyMicros: 1 }))).toMatchObject({
      type: 'invalid_pool_budget',
    });
    expect(codeOf(await call('PUT', 'pools/budgets', { poolId: 'a', dailyMicros: 0 }))).toMatchObject({
      type: 'invalid_pool_budget',
    });
    expect(
      codeOf(await call('PUT', 'pools/budgets', { poolId: 'a', dailyMicros: 100_000_000_001 })),
    ).toMatchObject({
      type: 'invalid_pool_budget',
    });
    expect(
      codeOf(await call('PUT', 'pools/budgets', { poolId: 'billing', dailyMicros: 1, sharedOverflow: true })),
    ).toMatchObject({ type: 'overflow_primary_pool' });
    for (let index = 0; index < 15; index++)
      await call('PUT', 'pools/budgets', {
        poolId: `r${String(index)}`,
        dailyMicros: 1,
        sharedOverflow: true,
      });
    expect(
      codeOf(
        await call('PUT', 'pools/budgets', { poolId: 'one-more', dailyMicros: 1, sharedOverflow: true }),
      ),
    ).toMatchObject({ type: 'overflow_pool_limit' });
    // A shared pool saved again is no seventeenth.
    expect(
      (await call('PUT', 'pools/budgets', { poolId: 'reserve', dailyMicros: 2, sharedOverflow: true }))
        .status,
    ).toBe(200);
    manager = false;
    expect((await call('GET', 'pools/budgets')).status).toBe(403);
    expect((await call('PUT', 'pools/budgets', { poolId: 'a', dailyMicros: 1 })).status).toBe(403);
  });

  it('lets a member read their own policy, and owners and admins set anyone’s', async () => {
    expect((await call('GET', 'members/lena/policy')).body).toEqual({
      member: 'lena',
      allowSharedOverflow: false,
      weight: 1,
    });
    expect((await call('GET', 'members/ghost/policy')).status).toBe(404);
    expect((await call('PATCH', 'members/ghost/policy', { poolId: '' })).status).toBe(404);
    expect((await call('PATCH', 'members/lena/policy', {})).status).toBe(400);
    expect(codeOf(await call('PATCH', 'members/lena/policy', { poolId: 'two words' }))).toMatchObject({
      type: 'invalid_policy',
    });
    expect(codeOf(await call('PATCH', 'members/lena/policy', { poolId: 'reserve' }))).toMatchObject({
      type: 'overflow_primary_pool',
    });
    expect(
      (await call('PATCH', 'members/lena/policy', { poolId: 'support', allowSharedOverflow: true })).body,
    ).toEqual({ member: 'lena', poolId: 'support', allowSharedOverflow: true, weight: 1 });
    // TeamCode's weights: 0 to 1000.
    for (const weight of [-1, 1001])
      expect(codeOf(await call('PATCH', 'members/lena/policy', { poolId: 'support', weight }))).toMatchObject(
        {
          type: 'invalid_policy',
        },
      );
    expect((await call('PATCH', 'members/lena/policy', { poolId: 'support', weight: 1.5 })).status).toBe(400);
    expect((await call('PATCH', 'members/lena/policy', { poolId: 'support', weight: 5 })).body).toMatchObject(
      {
        weight: 5,
      },
    );
    // Overflow and weight left out keep them; an empty pool takes them out of theirs.
    expect((await call('PATCH', 'members/lena/policy', { poolId: '' })).body).toEqual({
      member: 'lena',
      allowSharedOverflow: true,
      weight: 5,
    });
    manager = false;
    expect((await call('GET', 'members/maya/policy')).body).toEqual({
      member: 'maya',
      poolId: 'billing',
      allowSharedOverflow: true,
      weight: 1,
    });
    expect((await call('GET', 'members/theo/policy')).status).toBe(403);
    expect((await call('PATCH', 'members/maya/policy', { poolId: '' })).status).toBe(403);
  });

  it('gives a member’s weighted share of a named pool with their day, as ostrom-server does', async () => {
    const resetsAt: unknown = expect.stringMatching(/T00:00:00\.000Z$/);
    // Maya and Theo share billing's $40, weight 1 each.
    expect((await call('GET', 'members/maya/capacity')).body).toEqual({
      member: 'maya',
      poolId: 'billing',
      weight: 1,
      poolTotalWeight: 2,
      poolDailyMicros: 40_000_000,
      shareMicros: 20_000_000,
      dailyLimitMicros: 20_000_000,
      spentTodayMicros: 18_500_000,
      activeRequests: 1,
      waitingRequests: 0,
      resetsAt,
    });
    await call('PATCH', 'members/theo/policy', { poolId: 'billing', weight: 3 });
    expect((await call('GET', 'members/maya/capacity')).body).toMatchObject({
      poolTotalWeight: 4,
      shareMicros: 10_000_000,
    });
    // Every weight at 0: no share.
    await call('PATCH', 'members/theo/policy', { poolId: 'billing', weight: 0 });
    await call('PATCH', 'members/maya/policy', { poolId: 'billing', weight: 0 });
    expect((await call('GET', 'members/maya/capacity')).body).toMatchObject({
      poolTotalWeight: 0,
      shareMicros: 0,
    });
    // The shared home pool's budget is the organization's, which the mock does not keep; Lena did nothing today.
    expect((await call('GET', 'members/lena/capacity')).body).toEqual({
      member: 'lena',
      weight: 1,
      spentTodayMicros: 0,
      activeRequests: 0,
      waitingRequests: 0,
      resetsAt,
    });
    expect((await call('GET', 'members/ghost/capacity')).status).toBe(404);
    manager = false;
    expect((await call('GET', 'members/maya/capacity')).status).toBe(200);
    expect((await call('GET', 'members/theo/capacity')).status).toBe(403);
  });

  it('resets the day at the next midnight UTC of the clock it is given', async () => {
    const clocked = createPoolsHandlers(() => initialPoolsState(), {
      manages: () => true,
      knows: () => true,
      me: () => 'maya',
      now: () => new Date('2026-11-18T17:30:00Z'),
    });
    const response = await getResponse(
      clocked,
      new Request('http://ostrom.test/api/v1/members/maya/capacity'),
    );
    expect(await response?.json()).toMatchObject({ resetsAt: '2026-11-19T00:00:00.000Z' });
  });
});
