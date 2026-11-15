// SPDX-License-Identifier: Apache-2.0
import { getResponse } from 'msw';
import { createPoolSizeHandlers, initialPoolSizeState } from '@/mocks/poolSize';

const opened = Date.parse('2026-11-15T10:00:00Z');
let state = initialPoolSizeState(opened);
let manager = true;
let stale = false;
let now = new Date(opened);
const handlers = createPoolSizeHandlers(() => state, {
  manages: () => manager,
  stale: () => stale,
  now: () => now,
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
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

describe('the mock pool size and pacing settings', () => {
  afterEach(() => {
    state = initialPoolSizeState(opened);
    manager = true;
    stale = false;
    now = new Date(opened);
  });

  it('lets any member read the settings, and owners and admins change them from a recent sign-in', async () => {
    manager = false;
    expect((await call('GET', 'policy/pacing')).body).toEqual({
      observationOnly: false,
      autoPoolSize: false,
    });
    expect((await call('PUT', 'policy/pacing', { autoPoolSize: true })).status).toBe(403);
    expect((await call('GET', 'pools/size')).status).toBe(403);
    manager = true;
    stale = true;
    expect((await call('PUT', 'policy/pacing', { autoPoolSize: true })).body).toMatchObject({
      error: { type: 'step_up_required' },
    });
    stale = false;
    expect((await call('PUT', 'policy/pacing', { autoPoolSize: 'yes' })).status).toBe(400);
    expect((await call('PUT', 'policy/pacing', { autoPoolSize: true })).body).toEqual({
      observationOnly: false,
      autoPoolSize: true,
    });
    expect((await call('PUT', 'policy/pacing', { observationOnly: true })).body).toEqual({
      observationOnly: true,
      autoPoolSize: true,
    });
  });

  it('applies the automatic value only while it is on and under an hour old', async () => {
    expect((await call('GET', 'pools/size')).body).toMatchObject({
      source: 'manual',
      effectiveDailyMicros: 25_000_000,
    });
    state.pacingSettings.autoPoolSize = true;
    expect((await call('GET', 'pools/size')).body).toMatchObject({
      enabled: true,
      source: 'automatic',
      effectiveDailyMicros: 38_500_000,
    });
    now = new Date(opened + 2 * 3_600_000);
    expect((await call('GET', 'pools/size')).body).toMatchObject({
      source: 'manual',
      effectiveDailyMicros: 25_000_000,
    });
    state.automaticDaily = undefined;
    expect((await call('GET', 'pools/size')).body).not.toHaveProperty('automaticDailyMicros');
  });
});
