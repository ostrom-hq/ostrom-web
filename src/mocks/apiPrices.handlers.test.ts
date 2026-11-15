// SPDX-License-Identifier: Apache-2.0
import { getResponse } from 'msw';
import { type ApiPricesState, BUILT_IN_PRICES, createApiPricesHandlers } from '@/mocks/apiPrices';

const state: ApiPricesState = { apiPrices: [] };
let manager = true;
let stale = false;
const handlers = createApiPricesHandlers(() => state, { manages: () => manager, stale: () => stale });

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request(`http://ostrom.test/api/v1/policy/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

const own = { ...BUILT_IN_PRICES[1], model: 'claude-sonnet-4', effectiveFrom: '2026-11-01', outputMicros: 1 };

describe('the mock API prices', () => {
  afterEach(() => {
    state.apiPrices = [];
    manager = true;
    stale = false;
  });

  it('reads the built-in prices while the organization has none, to anyone', async () => {
    manager = false;
    expect((await call('GET', 'api-prices')).body).toEqual({ prices: BUILT_IN_PRICES, defaults: true });
    expect((await call('PUT', 'api-prices', { prices: [] })).status).toBe(403);
    expect((await call('POST', 'api-prices/load-defaults')).status).toBe(403);
    manager = true;
    stale = true;
    expect((await call('PUT', 'api-prices', { prices: [] })).body).toMatchObject({
      error: { type: 'step_up_required' },
    });
  });

  it('replaces the table, refuses a duplicate row, and loads only the built-in rows it lacks', async () => {
    expect((await call('PUT', 'api-prices', {})).status).toBe(400);
    expect((await call('PUT', 'api-prices', { prices: [own, own] })).status).toBe(400);
    expect((await call('PUT', 'api-prices', { prices: [own] })).body).toEqual({
      prices: [own],
      defaults: false,
    });
    const loaded = await call('POST', 'api-prices/load-defaults');
    expect(loaded.body).toEqual({ prices: [own, ...BUILT_IN_PRICES], defaults: false });
    expect((await call('POST', 'api-prices/load-defaults')).body).toEqual(loaded.body);
  });
});
