import { decideAsk, getAsk, getYesQueue } from '@gen/api/sdk.gen';
import type { Ask } from '@gen/api/types.gen';
import { zSelfApprovalRefused } from '@gen/api/zod.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';
import { initialAsks } from '@/mocks/fixtures/yes';
import { selfApprovalRefusal } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();
const initial = structuredClone(db.asks);
const NOW = new Date('2026-10-30T08:00:00.000Z');

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test/api', getToken: () => undefined });
});
afterEach(() => {
  db.asks = structuredClone(initial);
});
afterAll(() => {
  server.close();
});

async function failureOf(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('the call did not fail');
}

describe('mock API', () => {
  it('lists pending and decided requests apart', async () => {
    const { data } = await getYesQueue({ throwOnError: true });
    expect(data.operator).toBe('maya');
    expect(data.pending).toHaveLength(2);
    expect(data.recent.map((ask) => ask.status)).toEqual(['approved']);
  });

  it('returns one request', async () => {
    const { data } = await getAsk({ path: { id: 'ask-merge-412' }, throwOnError: true });
    expect(data.commits?.map((commit) => commit.sha)).toEqual(['9c1e4b2a7d', '3fa0d81c55']);
  });

  it('signs a yes as the viewer and moves the request to the decided list', async () => {
    const { data } = await decideAsk({
      path: { id: 'ask-merge-412' },
      body: { result: 'approved' },
      throwOnError: true,
    });
    expect(data.status).toBe('approved');
    expect(data.receipt?.by).toBe('maya');
    expect(data.receipt?.digest).toBe(data.shownDigest);
    const queue = await getYesQueue({ throwOnError: true });
    expect(queue.data.pending.map((ask) => ask.id)).toEqual(['ask-deploy-88']);
  });

  it('stamps the decision with the injected clock', async () => {
    const { createHandlers, createMockDb } = await import('@/mocks/handlers');
    const ownDb = createMockDb();
    server.use(...createHandlers(ownDb, () => NOW));
    const { data } = await decideAsk({
      path: { id: 'ask-merge-412' },
      body: { result: 'rejected' },
      throwOnError: true,
    });
    expect([data.status, data.decidedAt]).toEqual(['rejected', NOW.toISOString()]);
    server.resetHandlers();
  });

  it('refuses the author’s own yes while another approver exists', async () => {
    const error = await failureOf(async () =>
      decideAsk({ path: { id: 'ask-deploy-88' }, body: { result: 'approved' }, throwOnError: true }),
    );
    expect(isApiFailure(error) && error.kind).toBe('forbidden');
    const body = isApiFailure(error) ? zSelfApprovalRefused.parse(error.body) : undefined;
    expect(body?.others).toEqual(['samir']);
  });

  it('lets the author withdraw with a no', async () => {
    const { data } = await decideAsk({
      path: { id: 'ask-deploy-88' },
      body: { result: 'rejected' },
      throwOnError: true,
    });
    expect(data.status).toBe('rejected');
  });

  it('answers 404 for an unknown request, on read and on decide', async () => {
    const read = await failureOf(async () => getAsk({ path: { id: 'nope' }, throwOnError: true }));
    const decide = await failureOf(async () =>
      decideAsk({ path: { id: 'nope' }, body: { result: 'approved' }, throwOnError: true }),
    );
    expect([read, decide].map((error) => isApiFailure(error) && error.kind)).toEqual([
      'not-found',
      'not-found',
    ]);
  });

  it('answers 400 to a body outside the contract', async () => {
    const response = await fetch('http://ostrom.test/api/yes/ask-merge-412/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result: 'maybe' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('selfApprovalRefusal', () => {
  function fixture(id: string): Ask {
    const found = initialAsks().find((ask) => ask.id === id);
    if (found === undefined) throw new Error(`no fixture ${id}`);
    return found;
  }

  it('lets through a viewer who can approve, or a request without a viewer', () => {
    const merge = fixture('ask-merge-412');
    expect(selfApprovalRefusal(merge)).toBeUndefined();
    delete merge.you;
    expect(selfApprovalRefusal(merge)).toBeUndefined();
  });

  it('gives a default reason and no other approver when the request has no gate', () => {
    const deploy = fixture('ask-deploy-88');
    delete deploy.gate;
    deploy.you = { login: 'maya', self: true, canApprove: false };
    expect(selfApprovalRefusal(deploy)).toEqual({
      error: 'You asked for this action: another approver has to say yes.',
      code: 'self_approval_refused',
      others: [],
    });
  });
});
