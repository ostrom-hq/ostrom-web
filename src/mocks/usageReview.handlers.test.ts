// SPDX-License-Identifier: Apache-2.0
import { getResponse } from 'msw';
import { createUsageReviewHandlers, initialUsageReview, type UsageReviewState } from '@/mocks/usageReview';

let state: UsageReviewState = initialUsageReview();
let manager = true;
let stale = false;
const handlers = createUsageReviewHandlers(
  () => state,
  {
    manages: () => manager,
    stale: () => stale,
    loginOf: (_request, id) => (id === 'id-theo' ? 'theo' : undefined),
    me: () => 'maya',
  },
  () => new Date('2026-11-15T10:00:00Z'),
);

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request(`http://ostrom.test/api/v1/usage/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

const correction = (extra: object = {}) => ({
  expectedMicros: 1_250_000,
  micros: 300_000,
  source: 'PROVIDER_RECORD',
  reference: 'export',
  reason: 'cut',
  ...extra,
});

describe('the mock usage review', () => {
  afterEach(() => {
    state = initialUsageReview();
    manager = true;
    stale = false;
  });

  it('answers owners and admins only, and asks a fresh sign-in for a correction', async () => {
    manager = false;
    for (const path of ['pending', 'reconciliations', 'reservations/call_7f3a9c'])
      expect((await call('GET', path)).status).toBe(403);
    expect((await call('POST', 'reservations/call_7f3a9c/reconcile', correction())).status).toBe(403);
    manager = true;
    stale = true;
    expect((await call('POST', 'reservations/call_7f3a9c/reconcile', correction())).body).toMatchObject({
      error: { type: 'step_up_required' },
    });
  });

  it('lists one member’s, pages 50 at a time, and reads one review', async () => {
    expect((await call('GET', 'pending?member=id-theo')).body).toMatchObject({
      items: [{ id: 'call_7f3a9c' }],
    });
    expect((await call('GET', 'pending?member=nobody')).body).toEqual({ items: [] });
    expect((await call('GET', 'reconciliations')).body).toMatchObject({ items: [{ id: 'call_2c4d6e' }] });
    state.pendingUsage = Array.from({ length: 52 }, (_, index) => ({
      id: `c${String(index)}`,
      member: 'theo',
      micros: 1,
      heldAt: '2026-11-14T16:02:00Z',
      leaseExpiredAt: '2026-11-14T16:12:00Z',
    }));
    expect((await call('GET', 'pending')).body).toMatchObject({ next: 'c49' });
    expect((await call('GET', 'pending?before=c49')).body).toEqual({
      items: [expect.objectContaining({ id: 'c50' }), expect.objectContaining({ id: 'c51' })],
    });
    state = initialUsageReview();
    expect((await call('GET', 'reservations/call_7f3a9c')).body).toHaveProperty('pending');
    expect((await call('GET', 'reservations/call_2c4d6e')).body).toHaveProperty('reconciliation');
    expect((await call('GET', 'reservations/nope')).status).toBe(404);
  });

  it('corrects a hold once, from what was shown, and answers the same correction again', async () => {
    const path = 'reservations/call_7f3a9c/reconcile';
    expect((await call('POST', path, {})).status).toBe(400);
    expect((await call('POST', path, correction({ reason: 'a\nb' }))).status).toBe(400);
    expect((await call('POST', path, correction({ expectedMicros: 1 }))).status).toBe(409);
    expect((await call('POST', path, correction({ expectedProviderRequestId: 'x' }))).status).toBe(409);
    expect((await call('POST', 'reservations/nope/reconcile', correction())).status).toBe(404);
    const done = await call('POST', path, correction({ reference: ' export ' }));
    expect(done.body).toMatchObject({
      previousMicros: 1_250_000,
      micros: 300_000,
      reconciledBy: 'maya',
      workflowId: 'wf_release',
    });
    expect(state.pendingUsage.map((item) => item.id)).toEqual(['call_51b2e0']);
    expect((await call('POST', path, correction())).status).toBe(200);
    expect((await call('POST', path, correction({ micros: 1 }))).body).toMatchObject({
      error: { type: 'reconciled' },
    });
    const other = await call(
      'POST',
      'reservations/call_51b2e0/reconcile',
      correction({
        expectedMicros: 480_500,
        expectedProviderRequestId: 'req_011CXa',
        source: 'PROVIDER_CONFIRMATION',
      }),
    );
    expect(other.body).toMatchObject({ providerRequestId: 'req_011CXa' });
    state.pendingUsage = [
      { id: 'l1', member: 'theo', micros: 5, heldAt: 'x', leaseExpiredAt: 'y', launchId: 'la_1' },
    ];
    expect(
      (await call('POST', 'reservations/l1/reconcile', correction({ expectedMicros: 5 }))).body,
    ).toMatchObject({
      launchId: 'la_1',
    });
  });
});
