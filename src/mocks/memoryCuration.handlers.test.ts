// SPDX-License-Identifier: Apache-2.0
import { zApiError, zMemoryCuration } from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import { createMemoryCurationHandlers, type MemoryCurationState } from '@/mocks/memoryCuration';

const state: MemoryCurationState = { memoryCuration: { enabled: false } };
let manager = true;
const handlers = createMemoryCurationHandlers(
  () => state,
  () => manager,
);

async function call(method: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request('http://ostrom.test/api/v1/memory/curation', {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

describe('the mock memory curation', () => {
  afterEach(() => {
    state.memoryCuration = { enabled: false };
    manager = true;
  });

  it('is off until an administrator turns it on, and keeps the last run it was given', async () => {
    expect(zMemoryCuration.parse((await call('GET')).body)).toEqual({ enabled: false });
    state.memoryCuration = { enabled: false, lastRunAt: '2026-11-14T10:00:00Z', lastSuperseded: 2 };
    expect(await call('PUT', { enabled: true })).toEqual({
      status: 200,
      body: { enabled: true, lastRunAt: '2026-11-14T10:00:00Z', lastSuperseded: 2 },
    });
    expect((await call('PUT', { enabled: false })).body).toMatchObject({ enabled: false });
  });

  it('refuses a member and a body that is not a switch', async () => {
    expect(zApiError.parse((await call('PUT', { enabled: 'yes' })).body).error.type).toBe('invalid_request');
    expect((await call('PUT', '{')).status).toBe(400);
    manager = false;
    expect(await call('GET')).toMatchObject({ status: 403 });
    expect(await call('PUT', { enabled: true })).toMatchObject({ status: 403 });
    expect(state.memoryCuration).toEqual({ enabled: false });
  });
});
