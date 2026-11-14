// SPDX-License-Identifier: Apache-2.0
import { createAutomation, saveAutomation } from '@gen/api/sdk.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
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

/** A raw call, past the client's request validation: what another client could send. */
async function send(method: string, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://ostrom.test/api/v1/automations${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const prompt = { prompt: 'Go.' };

describe('the mock automation writes, as the server answers them', () => {
  it('creates a paused schedule owned by the caller, with the server’s defaults', async () => {
    const { data } = await createAutomation({
      body: {
        name: ' Nightly ',
        trigger: { kind: 'cron', cron: '0 3 * * *', timezone: 'UTC' },
        action: prompt,
      },
      throwOnError: true,
    });
    expect(data).toEqual({
      id: 'au-102',
      owner: 'maya',
      enabled: false,
      name: 'Nightly',
      trigger: { kind: 'cron', cron: '0 3 * * *', timezone: 'UTC', catchup: 'once' },
      action: { agent: 'claude', prompt: 'Go.', maxRuntimeMinutes: 60 },
      variables: [],
      overlap: 'skip',
      maxRunsPerDay: 24,
      version: 1,
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
    });
    expect(db.automations[0]?.id).toBe('au-102');
  });

  it('gives a new webhook its address and, once, its secret', async () => {
    const { data } = await createAutomation({
      body: {
        name: 'Hook',
        trigger: { kind: 'webhook' },
        action: { prompt: 'Go {{level}}.', agent: 'codex', model: 'gpt-6', maxRuntimeMinutes: 5 },
        variables: [
          { name: 'level', path: '$.level', type: 'enum', values: ['a'], required: false, sensitive: true },
          { name: 'id', path: '$.id', type: 'string' },
        ],
        samplePayload: { level: 'a' },
        overlap: 'allow',
        maxRunsPerDay: 3,
      },
      throwOnError: true,
    });
    expect(data).toMatchObject({
      trigger: { kind: 'webhook' },
      action: { agent: 'codex', prompt: 'Go {{level}}.', model: 'gpt-6', maxRuntimeMinutes: 5 },
      variables: [
        { name: 'level', path: '$.level', type: 'enum', values: ['a'], required: false, sensitive: true },
        { name: 'id', path: '$.id', type: 'string', values: [], required: true, sensitive: false },
      ],
      samplePayload: { level: 'a' },
      overlap: 'allow',
      maxRunsPerDay: 3,
      webhookUrl: 'https://api.ostrom.run/api/v1/automations/au-102/trigger',
    });
    expect(data.secret).toMatch(/^whsec_mock_au-102/);
    expect(db.automations[0]).not.toHaveProperty('secret');
  });

  it('refuses what the server refuses, in its words', async () => {
    expect((await send('POST', '', 'nope')).status).toBe(400);
    expect(
      await send('POST', '', {
        name: 'W',
        trigger: { kind: 'cron' },
        action: { workflowId: 'wf-1', prompt: 'x' },
      }),
    ).toEqual({
      status: 400,
      body: { error: { type: 'invalid_request', message: 'A workflow action has no prompt.' } },
    });
    expect(
      (await send('POST', '', { name: 'P', trigger: { kind: 'cron' }, action: { agent: 'codex' } })).body,
    ).toMatchObject({ error: { message: 'The prompt has 1 to 32000 characters.' } });
    expect(
      (await send('POST', '', { name: 'P', trigger: { kind: 'cron' }, action: { prompt: ' ' } })).status,
    ).toBe(400);
    expect(
      (await send('POST', '', { name: 'O', trigger: { kind: 'cron' }, action: prompt, overlap: 'queue' }))
        .body,
    ).toMatchObject({ error: { message: 'overlap is skip or allow.' } });
    expect(
      (await send('POST', '', { name: 'H', trigger: { kind: 'webhook', cron: '@daily' }, action: prompt }))
        .body,
    ).toMatchObject({ error: { message: 'A webhook trigger has no cron nor timezone.' } });
    expect(
      (await send('POST', '', { name: 'H', trigger: { kind: 'webhook', timezone: 'UTC' }, action: prompt }))
        .status,
    ).toBe(400);
    expect(
      (await send('POST', '', { name: 'O', trigger: { kind: 'cron' }, action: prompt, overlap: 'allow' }))
        .status,
    ).toBe(201);
  });

  it('saves only its owner’s change, over the version read, and the new version replaces the old', async () => {
    expect(
      (await send('PUT', '/au-none', { name: 'X', trigger: { kind: 'cron' }, action: prompt })).status,
    ).toBe(404);
    expect(
      (await send('PUT', '/au-nightly', { name: 'X', trigger: { kind: 'cron' }, action: prompt, version: 4 }))
        .body,
    ).toMatchObject({ error: { type: 'forbidden', message: 'Only the owner of an automation does this.' } });
    expect((await send('PUT', '/au-sentry', 'nope')).status).toBe(400);
    expect(
      (await send('PUT', '/au-sentry', { name: 'X', trigger: { kind: 'cron' }, action: prompt })).body,
    ).toMatchObject({ error: { message: 'A change gives the version it read.' } });
    expect(
      await send('PUT', '/au-sentry', { name: 'X', trigger: { kind: 'cron' }, action: prompt, version: 7 }),
    ).toMatchObject({ status: 409 });
    expect(
      (
        await send('PUT', '/au-sentry', {
          name: 'X',
          trigger: { kind: 'cron' },
          action: { workflowId: 'w', prompt: 'x' },
          version: 1,
        })
      ).status,
    ).toBe(400);
    const { data } = await saveAutomation({
      path: { id: 'au-sentry' },
      body: {
        name: 'Sentry, scheduled',
        trigger: { kind: 'cron', cron: '@daily', timezone: 'UTC', catchup: 'skip' },
        action: prompt,
        version: 1,
      },
      throwOnError: true,
    });
    expect(data).toMatchObject({ id: 'au-sentry', owner: 'maya', version: 2, enabled: false });
    expect(data.trigger).toEqual({ kind: 'cron', cron: '@daily', timezone: 'UTC', catchup: 'skip' });
    expect(data).not.toHaveProperty('webhookUrl');
    expect(data).not.toHaveProperty('samplePayload');
  });

  it('knows its caller by member id too, and keeps a webhook’s address on a webhook', async () => {
    const automation = db.automations.find((item) => item.id === 'au-sentry');
    if (automation === undefined) throw new Error('no au-sentry');
    automation.owner = MEMBER_IDS.maya;
    const { data } = await saveAutomation({
      path: { id: 'au-sentry' },
      body: { name: 'Still a hook', trigger: { kind: 'webhook' }, action: prompt, version: 1 },
      throwOnError: true,
    });
    expect(data.webhookUrl).toBe('https://api.ostrom.run/api/v1/automations/au-sentry/trigger');
    expect(data.owner).toBe(MEMBER_IDS.maya);
  });
});

describe('a workflow action', () => {
  it('is created and saved with its inputs and repository, and no prompt', async () => {
    const created = await send('POST', '', {
      name: 'Release',
      trigger: { kind: 'webhook' },
      action: { workflowId: 'wf-release', inputs: { tag: '{{tag}}' }, repository: 'acme/api' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      action: { workflowId: 'wf-release', inputs: { tag: '{{tag}}' }, repository: 'acme/api' },
    });
    expect(created.body).not.toHaveProperty('action.prompt');
    const bare = await send('POST', '', {
      name: 'Bare',
      trigger: { kind: 'cron' },
      action: { workflowId: 'wf-release' },
    });
    expect(bare.body).toMatchObject({ action: { workflowId: 'wf-release', inputs: {} } });
    expect(bare.body).not.toHaveProperty('action.repository');
  });
});
