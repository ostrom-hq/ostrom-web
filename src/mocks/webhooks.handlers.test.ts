// SPDX-License-Identifier: Apache-2.0
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { configureApiClient } from '@/shared/api/apiClient';

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

interface Answer {
  readonly status: number;
  readonly type: string | undefined;
  readonly retryAfter: string | null;
  readonly body: unknown;
}

async function call(method: string, path: string, body?: unknown, org?: string): Promise<Answer> {
  const response = await fetch(`http://ostrom.test/api/v1${path}`, {
    method,
    headers: org === undefined ? {} : { 'Ostrom-Org': org },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const error = typeof parsed === 'object' && parsed !== null && 'error' in parsed ? parsed.error : undefined;
  const type =
    typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
      ? error.type
      : undefined;
  return { status: response.status, type, retryAfter: response.headers.get('Retry-After'), body: parsed };
}

const VALID = { url: 'https://example.com/hook', types: ['cloud.todo'] };

describe('the mock webhooks, as the server refuses', () => {
  it('lets only owners and admins in, on every route', async () => {
    setDemoRole(db, 'member');
    const answers = await Promise.all([
      call('GET', '/webhooks'),
      call('POST', '/webhooks', VALID),
      call('GET', '/webhooks/wh-1'),
      call('PUT', '/webhooks/wh-1', { ...VALID, version: 1 }),
      call('DELETE', '/webhooks/wh-1'),
      call('GET', '/webhooks/wh-1/deliveries'),
      call('POST', '/webhooks/wh-1/test'),
      call('POST', '/webhooks/wh-1/rotate-secret'),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([403, 403, 403, 403, 403, 403, 403, 403]);
    expect(db.webhooks).toHaveLength(3);
  });

  it('keeps the demo organization’s webhooks out of another organization', async () => {
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
    const list = await call('GET', '/webhooks', undefined, globex.id);
    expect(list.body).toEqual({ items: [] });
    const answers = await Promise.all([
      call('GET', '/webhooks/wh-1', undefined, globex.id),
      call('PUT', '/webhooks/wh-1', { ...VALID, version: 1 }, globex.id),
      call('DELETE', '/webhooks/wh-1', undefined, globex.id),
      call('GET', '/webhooks/wh-1/deliveries', undefined, globex.id),
      call('POST', '/webhooks/wh-1/test', undefined, globex.id),
      call('POST', '/webhooks/wh-1/rotate-secret', undefined, globex.id),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect((await call('POST', '/webhooks', VALID, globex.id)).status).toBe(403);
    expect(db.webhooks).toHaveLength(3);
  });

  it('refuses a webhook that is not an https URL on a public host with known events', async () => {
    const bad = async (body: unknown): Promise<string | undefined> =>
      (await call('POST', '/webhooks', body)).type;
    expect(await bad('not json')).toBe('invalid_webhook');
    expect(await bad({ url: 'https://example.com' })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, types: [] })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, types: ['cloud.nope'] })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, description: 'x'.repeat(201) })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, url: 'not a url' })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, url: 'http://example.com/hook' })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, url: 'https://user:pw@example.com/hook' })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, url: 'https://example.com/hook#frag' })).toBe('invalid_webhook');
    expect(await bad({ ...VALID, url: `https://example.com/${'a'.repeat(2048)}` })).toBe('invalid_webhook');
    for (const host of [
      'localhost',
      'db.local',
      'x.internal',
      '10.0.0.4',
      '127.0.0.1',
      '192.168.1.1',
      '169.254.169.254',
    ]) {
      expect(await bad({ ...VALID, url: `https://${host}/hook` })).toBe('webhook_host_not_allowed');
    }
    expect(db.webhooks).toHaveLength(3);
  });

  it('creates a webhook with a secret once, and stops at 20', async () => {
    const created = await call('POST', '/webhooks', {
      ...VALID,
      types: ['cloud.todo', 'cloud.todo'],
      description: 'd',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      webhook: { id: 'wh-4', types: ['cloud.todo'], description: 'd', enabled: true, version: 1 },
    });
    expect(JSON.stringify(created.body)).toMatch(/"secret":"whsec_/);
    expect(JSON.stringify((await call('GET', '/webhooks/wh-4')).body)).not.toContain('whsec_');
    expect((await call('POST', '/webhooks', VALID)).status).toBe(201);
    while (db.webhooks.length < 20) await call('POST', '/webhooks', VALID);
    expect(await call('POST', '/webhooks', VALID)).toMatchObject({ status: 409, type: 'webhook_limit' });
  });

  it('refuses a change that is stale, broken or aimed at a refused address', async () => {
    const put = async (id: string, body: unknown): Promise<Answer> => call('PUT', `/webhooks/${id}`, body);
    expect(await put('wh-9', { ...VALID, version: 1 })).toMatchObject({ status: 404 });
    expect(await put('wh-1', { ...VALID, version: 2 })).toMatchObject({ status: 409, type: 'stale_version' });
    expect(await put('wh-1', 'nope')).toMatchObject({ status: 400, type: 'invalid_webhook' });
    expect(await put('wh-1', { ...VALID, version: 1, types: [] })).toMatchObject({ status: 400 });
    expect(await put('wh-1', { ...VALID, version: 1, url: 'http://example.com' })).toMatchObject({
      status: 400,
      type: 'invalid_webhook',
    });
    expect(await put('wh-1', { ...VALID, version: 1, url: 'https://localhost/x' })).toMatchObject({
      status: 400,
      type: 'webhook_host_not_allowed',
    });
    expect(db.webhooks[0]?.version).toBe(1);
  });

  it('changes a webhook: absent keeps the state, enabling clears the failures, disabling says why', async () => {
    const kept = await call('PUT', '/webhooks/wh-3', { ...VALID, version: 3 });
    expect(kept.body).toMatchObject({
      enabled: false,
      disabledReason: 'too_many_failures',
      consecutiveFailures: 20,
      version: 4,
    });
    const enabled = await call('PUT', '/webhooks/wh-3', { ...VALID, version: 4, enabled: true });
    expect(enabled.body).toMatchObject({ enabled: true, consecutiveFailures: 0, version: 5 });
    expect(db.webhooks[2]?.disabledReason).toBeUndefined();
    const paused = await call('PUT', '/webhooks/wh-3', { ...VALID, version: 5, enabled: false });
    expect(paused.body).toMatchObject({ enabled: false, disabledReason: 'disabled', version: 6 });
  });

  it('reads the deliveries, 50 by default, between 1 and 200', async () => {
    expect(
      ((await call('GET', '/webhooks/wh-1/deliveries')).body as { items: unknown[] }).items,
    ).toHaveLength(3);
    expect(
      ((await call('GET', '/webhooks/wh-1/deliveries?limit=1')).body as { items: unknown[] }).items,
    ).toHaveLength(1);
    expect(((await call('GET', '/webhooks/wh-2/deliveries')).body as { items: unknown[] }).items).toEqual([]);
    for (const limit of ['0', '201', 'many', '1.5']) {
      expect((await call('GET', `/webhooks/wh-1/deliveries?limit=${limit}`)).status).toBe(400);
    }
    expect((await call('GET', '/webhooks/wh-9/deliveries')).status).toBe(404);
  });

  it('queues a test, three in ten seconds at most, never retried nor counted', async () => {
    for (let index = 0; index < 3; index += 1) {
      const queued = await call('POST', '/webhooks/wh-2/test');
      expect(queued.status).toBe(202);
      expect(queued.body).toMatchObject({ eventType: 'webhook.test', test: true, state: 'pending' });
    }
    expect(await call('POST', '/webhooks/wh-2/test')).toMatchObject({
      status: 429,
      type: 'webhook_test_rate',
      retryAfter: '10',
    });
    expect(db.webhookDeliveries['wh-2']).toHaveLength(3);
    expect(db.webhooks[1]?.consecutiveFailures).toBe(0);
    expect((await call('POST', '/webhooks/wh-9/test')).status).toBe(404);
  });

  it('gives a new secret on a rotation, never twice the same, and deletes with the log', async () => {
    const first = await call('POST', '/webhooks/wh-1/rotate-secret');
    const second = await call('POST', '/webhooks/wh-1/rotate-secret');
    expect(first.status).toBe(200);
    expect((first.body as { secret: string }).secret).not.toBe((second.body as { secret: string }).secret);
    expect((await call('POST', '/webhooks/wh-9/rotate-secret')).status).toBe(404);
    expect((await call('DELETE', '/webhooks/wh-1')).status).toBe(204);
    expect(db.webhookDeliveries['wh-1']).toBeUndefined();
    expect((await call('DELETE', '/webhooks/wh-1')).status).toBe(404);
  });
});
