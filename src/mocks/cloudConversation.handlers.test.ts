// SPDX-License-Identifier: Apache-2.0
import type { CloudEventDto } from '@gen/api/types.gen';
import { CONVERSATION_ID, feedOf, pageOf, subagentsOf } from '@/mocks/cloudConversation';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { createHandlerFetch } from '@/test/handlerFetch';

const { server, db } = createMockServer();
// Answered by the handlers themselves: a stream's frames come as they are written (src/test/handlerFetch.ts).
const { fetch } = createHandlerFetch(server);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

const BASE = `http://ostrom.test/api/v1/cloud/sessions`;

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: await response.json() };
}

function events(count: number): CloudEventDto[] {
  return Array.from({ length: count }, (_, index) => ({
    seq: index + 1,
    type: 'message.agent',
    at: '2026-10-30T08:00:00.000Z',
    epoch: 1,
    data: {},
  }));
}

function seqs(page: { readonly events: readonly CloudEventDto[] }): number[] {
  return page.events.map((event) => event.seq);
}

/** Reads a stream until `until` is in what it sent, then lets it go. */
async function readStream(response: Response, until: string): Promise<string> {
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (reader === undefined) throw new Error('no body');
  let text = '';
  while (!text.includes(until)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  await reader.cancel();
  return text;
}

describe('the mock conversation sessions', () => {
  it('pages the events after, before or from the oldest, at most 100 at a time', () => {
    const all = events(150);
    const url = (query: string): URL => new URL(`http://x/?${query}`);
    const first = pageOf(all, url(''));
    expect(seqs(first)).toHaveLength(100);
    expect(first).toMatchObject({ firstSeq: 1, lastSeq: 150 });
    expect(first.nextBefore).toBeUndefined();
    const newest = pageOf(all, url(`before=${String(Number.MAX_SAFE_INTEGER)}&limit=20`));
    expect(seqs(newest)).toEqual(Array.from({ length: 20 }, (_, index) => 131 + index));
    expect(newest.nextBefore).toBe(131);
    const after = pageOf(all, url('after=10&limit=5'));
    expect(seqs(after)).toEqual([11, 12, 13, 14, 15]);
    expect(after.nextAfter).toBe(15);
    expect(pageOf(all, url('after=148')).nextAfter).toBeUndefined();
    expect(pageOf(all, url('after=150')).events).toEqual([]);
    expect(pageOf(all, url('after=&limit=x')).events).toHaveLength(100);
    expect(pageOf([], url('before=5'))).toEqual({ events: [], firstSeq: 0, lastSeq: 0 });
  });

  it('reads a session and its transcript, and refuses one that is not there', async () => {
    expect((await call('GET', `/${CONVERSATION_ID}`)).json).toMatchObject({ mode: 'conversation' });
    expect((await call('GET', '/cs-none')).status).toBe(404);
    expect((await call('GET', `/${CONVERSATION_ID}/events`)).json).toMatchObject({ lastSeq: 9 });
    // A terminal session has no transcript: an empty page.
    expect((await call('GET', '/cs-31/events')).json).toMatchObject({ events: [], lastSeq: 0 });
    expect((await call('GET', '/cs-none/events')).status).toBe(404);
  });

  it('streams the events after the cursor, then each new one, and ends an ended session', async () => {
    expect((await fetch(`${BASE}/cs-none/events/stream`)).status).toBe(404);
    const live = await fetch(`${BASE}/${CONVERSATION_ID}/events/stream?after=7`);
    expect(live.headers.get('content-type')).toBe('text/event-stream');
    const reading = readStream(live, 'On it: hi');
    const sent = await call('POST', `/${CONVERSATION_ID}/messages`, { text: 'hi', clientMessageId: 'k1' });
    expect(sent.status).toBe(202);
    const text = await reading;
    expect(text).toContain('id: 8\nevent: message.agent\n');
    expect(text).not.toContain('id: 7\n');
    expect(text).toContain('"text":"On it: hi"');
    // The cancelled stream hears no more.
    expect(
      (await call('POST', `/${CONVERSATION_ID}/messages`, { text: 'again', clientMessageId: 'k2' })).status,
    ).toBe(202);

    const resumed = await fetch(`${BASE}/${CONVERSATION_ID}/events/stream`, {
      headers: { 'Last-Event-ID': '15' },
    });
    const tail = await readStream(resumed, 'On it: again');
    expect(tail).not.toContain('id: 15\n');

    db.cloudSessions = db.cloudSessions.map((session) =>
      session.id === CONVERSATION_ID ? { ...session, status: 'ended' } : session,
    );
    const ended = await (await fetch(`${BASE}/${CONVERSATION_ID}/events/stream?after=20`)).text();
    expect(ended).toBe('event: end\ndata: {}\n\n');
    const empty = await (await fetch(`${BASE}/cs-27/events/stream`)).text();
    expect(empty).toBe('event: end\ndata: {}\n\n');
  });

  it('takes a message once per id, wakes a paused session, and refuses what the server would', async () => {
    const path = `/${CONVERSATION_ID}/messages`;
    const first = await call('POST', path, { text: 'hello', clientMessageId: 'k1' });
    expect(first.json).toMatchObject({
      kind: 'message',
      status: 'consumed',
      woke: false,
      clientMessageId: 'k1',
    });
    expect((await call('POST', path, { text: 'hello', clientMessageId: 'k1' })).json).toEqual(first.json);
    expect(db.cloudEvents[CONVERSATION_ID]?.map((event) => event.type).slice(-4)).toEqual([
      'message.user',
      'turn',
      'message.agent',
      'turn',
    ]);
    expect((await call('POST', path, { text: '  ' })).status).toBe(400);
    expect((await call('POST', path, 'nope')).status).toBe(400);
    expect((await call('POST', path, { clientMessageId: 'no-text' })).status).toBe(400);
    expect((await call('POST', path, { text: 'no id' })).json).toMatchObject({
      error: { type: 'idempotency_key_required' },
    });
    expect((await call('POST', '/cs-none/messages', { text: 'x', clientMessageId: 'k' })).status).toBe(404);
    expect((await call('POST', '/cs-31/messages', { text: 'x', clientMessageId: 'k' })).json).toMatchObject({
      error: { type: 'terminal_session' },
    });
    db.cloudSessions.push({
      id: 'cs-p',
      name: 'codex · cs-p',
      owner: 'maya',
      agent: 'codex',
      mode: 'conversation',
      status: 'paused',
      desiredStatus: 'paused',
      epoch: 1,
      limits: { idleTimeoutMinutes: 30, maxRunMinutes: 480, restrictedEgress: false },
      createdAt: '2026-10-30T08:00:00.000Z',
      updatedAt: '2026-10-30T08:00:00.000Z',
    });
    expect((await call('POST', '/cs-p/messages', { text: 'wake', clientMessageId: 'k' })).json).toMatchObject(
      { woke: true },
    );
    expect(db.cloudSessions.find((session) => session.id === 'cs-p')?.status).toBe('running');
    expect(db.cloudEvents['cs-p']?.[0]?.seq).toBe(1);
    db.cloudSessions = db.cloudSessions.map((session) =>
      session.id === 'cs-p' ? { ...session, status: 'stopped' } : session,
    );
    expect((await call('POST', '/cs-p/messages', { text: 'x', clientMessageId: 'k9' })).json).toMatchObject({
      error: { type: 'session_not_running' },
    });
  });

  it('interrupts a running turn, and only that', async () => {
    const path = `/${CONVERSATION_ID}/interrupt`;
    expect((await call('POST', path)).json).toMatchObject({ error: { type: 'nothing_to_interrupt' } });
    expect((await call('POST', '/cs-none/interrupt')).status).toBe(404);
    db.cloudEvents[CONVERSATION_ID]?.push({
      seq: 10,
      type: 'turn',
      at: '2026-10-30T08:00:00.000Z',
      epoch: 1,
      data: { phase: 'started' },
    });
    const interrupted = await call('POST', path);
    expect(interrupted.status).toBe(202);
    expect(interrupted.json).toMatchObject({ kind: 'interrupt', status: 'queued' });
    expect(db.cloudEvents[CONVERSATION_ID]?.at(-1)?.data).toEqual({ phase: 'interrupted' });
    // A session never written to has nothing running.
    expect((await call('POST', '/cs-31/interrupt')).status).toBe(409);
  });

  it('keeps the mode a session starts in, and refuses a conversation an agent cannot hold', async () => {
    const start = async (body: unknown): Promise<{ status: number; json: unknown }> => call('POST', '', body);
    expect((await start({ agent: 'codex', mode: 'conversation' })).json).toMatchObject({
      mode: 'conversation',
    });
    expect((await start({ agent: 'gemini', mode: 'terminal' })).json).toMatchObject({ mode: 'terminal' });
    expect((await start({ agent: 'gemini', mode: 'conversation' })).json).toMatchObject({
      error: { type: 'invalid_mode' },
    });
    expect((await start({ agent: 'claude', mode: 'pty' })).status).toBe(400);
  });
});

describe('the mock conversation controls', () => {
  const path = `/${CONVERSATION_ID}`;
  const at = '2026-10-30T09:00:00.000Z';
  const add = (type: string, data: Record<string, unknown>, feed?: string): void => {
    const known = db.cloudEvents[CONVERSATION_ID] ?? [];
    db.cloudEvents[CONVERSATION_ID] = [
      ...known,
      { seq: known.length + 1, type, at, epoch: 1, data, ...(feed === undefined ? {} : { feed }) },
    ];
  };
  const answer = async (body: unknown, key?: string): Promise<{ status: number; json: unknown }> => {
    const response = await fetch(`${BASE}${path}/permissions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key === undefined ? {} : { 'Idempotency-Key': key }),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  };
  const setStatus = (status: string, owner = 'maya'): void => {
    db.cloudSessions = db.cloudSessions.map((session) =>
      session.id === CONVERSATION_ID ? { ...session, status, owner } : session,
    );
  };

  it('answers a permission request once per key, and refuses what the server would', async () => {
    const deploy = await call('POST', `${path}/messages`, { text: 'Please deploy', clientMessageId: 'k1' });
    expect(deploy.status).toBe(202);
    expect(db.cloudSessions.find((session) => session.id === CONVERSATION_ID)?.waiting).toMatchObject({
      requestId: 'perm-deploy',
    });
    expect((await answer({ requestId: 'perm-deploy', behavior: 'maybe' })).status).toBe(400);
    expect((await answer('nope')).status).toBe(400);
    expect((await answer({ requestId: 'none', behavior: 'allow' })).json).toMatchObject({
      error: { type: 'unknown_permission_request' },
    });
    const first = await answer({ requestId: 'perm-deploy', behavior: 'allow' }, 'key-1');
    expect(first.status).toBe(202);
    expect(db.cloudSessions.find((session) => session.id === CONVERSATION_ID)?.waiting).toBeUndefined();
    expect((await answer({ requestId: 'perm-deploy', behavior: 'allow' }, 'key-1')).json).toEqual(first.json);
    expect((await answer({ requestId: 'perm-deploy', behavior: 'deny' })).json).toMatchObject({
      error: { type: 'permission_request_answered' },
    });
    // A request that expired; then a denied one, answered without the session waiting on it.
    add('permission.request', { requestId: 'old' });
    add('permission.expired', { requestId: 'old' });
    expect((await answer({ requestId: 'old', behavior: 'deny' })).json).toMatchObject({
      error: { type: 'permission_request_expired' },
    });
    add('permission.request', { requestId: 'later' });
    expect((await answer({ requestId: 'later', behavior: 'deny' })).status).toBe(202);
    expect(JSON.stringify(db.cloudEvents[CONVERSATION_ID]?.at(-2)?.data)).toContain('I will not deploy');
    add('permission.request', { requestId: 'other' });
    expect((await answer({ requestId: 'other', behavior: 'allow' })).status).toBe(202);
    setStatus('paused');
    expect((await answer({ requestId: 'later', behavior: 'deny' }, 'key-2')).json).toMatchObject({
      error: { type: 'nothing_to_answer' },
    });
    const missing = await fetch(`${BASE}/cs-none/permissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'x', behavior: 'allow' }),
    });
    expect(missing.status).toBe(404);
  });

  it('changes the owner’s settings only, while the session runs', async () => {
    expect((await call('PUT', `${path}/permission-bypass`, { enabled: true })).json).toMatchObject({
      permissionBypass: true,
    });
    expect((await call('PUT', `${path}/permission-bypass`, { enabled: 'yes' })).status).toBe(400);
    expect((await call('PUT', `${path}/model`, { model: 'claude-opus-5' })).json).toMatchObject({
      model: 'claude-opus-5',
    });
    expect((await call('PUT', `${path}/model`, { model: 'a b' })).status).toBe(400);
    expect((await call('PUT', `${path}/model`, {})).status).toBe(400);
    expect((await call('PUT', `${path}/effort`, { effort: 'high' })).json).toMatchObject({ effort: 'high' });
    expect((await call('PUT', `${path}/effort`, { effort: '' })).status).toBe(400);
    expect((await call('PUT', `${path}/effort`, 'x')).status).toBe(400);
    expect((await call('PUT', '/cs-none/effort', { effort: 'high' })).status).toBe(404);
    setStatus('running', 'lena');
    expect((await call('PUT', `${path}/model`, { model: 'x' })).json).toMatchObject({
      error: { type: 'model_owner_only' },
    });
    setStatus('terminated');
    expect((await call('PUT', `${path}/permission-bypass`, { enabled: false })).json).toMatchObject({
      error: { type: 'session_not_running' },
    });
  });

  it('stops a task, which leaves the runner’s next report, and lists the subagents', async () => {
    // No report yet: the runner reports none left.
    expect((await call('POST', `${path}/tasks/stop`, { taskId: 'task-tests' })).status).toBe(202);
    expect(db.cloudEvents[CONVERSATION_ID]?.at(-1)?.data).toMatchObject({ tasks: [] });
    await call('POST', `${path}/messages`, { text: 'deploy it', clientMessageId: 'k1' });
    expect((await call('POST', `${path}/tasks/stop`, { taskId: 'task-tests' })).status).toBe(202);
    expect(JSON.stringify(db.cloudEvents[CONVERSATION_ID]?.at(-1)?.data)).not.toContain('task-tests');
    expect((await call('POST', `${path}/tasks/stop`, { taskId: 'bad id' })).status).toBe(400);
    expect((await call('POST', `${path}/tasks/stop`, {})).status).toBe(400);
    expect((await call('POST', '/cs-none/tasks/stop', { taskId: 't' })).status).toBe(404);
    expect((await call('GET', `${path}/agents`)).json).toEqual({
      agents: [expect.objectContaining({ id: 'tu-agent-1', type: 'reviewer', state: 'running', steps: 1 })],
    });
    expect((await call('GET', '/cs-none/agents')).status).toBe(404);
    setStatus('paused');
    expect((await call('POST', `${path}/tasks/stop`, { taskId: 't' })).json).toMatchObject({
      error: { type: 'nothing_to_interrupt' },
    });
  });

  it('reads the subagents and the feeds of a transcript', () => {
    const event = (
      seq: number,
      type: string,
      data: Record<string, unknown>,
      feed?: string,
    ): CloudEventDto => ({
      seq,
      type,
      at,
      epoch: 1,
      data,
      ...(feed === undefined ? {} : { feed }),
    });
    const events = [
      event(1, 'tool.call', { id: 'a', name: 'Task', input: {} }),
      event(2, 'tool.call', { id: 'b', name: 'Agent', input: 'odd' }, 'a'),
      event(3, 'tool.result', { id: 'b', isError: true }, 'a'),
      event(4, 'tool.result', { id: 'a' }),
      event(5, 'tool.call', { name: 'Agent' }),
      event(6, 'tool.call', { id: 'c', name: 'Bash' }),
      event(7, 'message.agent', {}),
    ];
    expect(subagentsOf(events)).toEqual([
      { id: 'a', description: '', state: 'completed', startedAt: at, endedAt: at, steps: 1 },
      { id: 'b', description: '', state: 'failed', startedAt: at, endedAt: at, steps: 0, parentId: 'a' },
    ]);
    expect(feedOf(events, null)).toHaveLength(7);
    expect(feedOf(events, 'main').map((item) => item.seq)).toEqual([1, 4, 5, 6, 7]);
    expect(feedOf(events, 'a').map((item) => item.seq)).toEqual([2, 3]);
  });
});

describe('the mock files of a conversation (runners.cloud.files.v1)', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);

  async function upload(
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
    key?: string,
    session = CONVERSATION_ID,
  ): Promise<{ status: number; json: unknown; replayed: string | null }> {
    const response = await fetch(`${BASE}/${session}/files?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: key === undefined ? {} : { 'Idempotency-Key': key },
      body: bytes,
    });
    return {
      status: response.status,
      json: await response.json(),
      replayed: response.headers.get('Idempotency-Replayed'),
    };
  }

  it('reads the policy, and stores a file under its key', async () => {
    const policy = await fetch('http://ostrom.test/api/v1/cloud/files/policy');
    expect(await policy.json()).toMatchObject({ available: true, maxFilesPerMessage: 5 });
    const first = await upload('../shots/a.png', PNG, 'k1');
    expect(first).toMatchObject({
      status: 201,
      json: { id: 'file-1', name: 'a.png', size: 6, contentType: 'image/png' },
    });
    expect(await upload('a.png', PNG, 'k1')).toMatchObject({ status: 200, replayed: 'true' });
    expect(await upload('a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]), 'k1')).toMatchObject({
      status: 422,
    });
    expect(await upload('/', new TextEncoder().encode('text'))).toMatchObject({
      status: 201,
      json: { name: 'file', contentType: 'text/plain' },
    });
  });

  it('recognizes each type by its bytes', async () => {
    const of = async (bytes: number[]): Promise<unknown> =>
      ((await upload('f', new Uint8Array(bytes))).json as { contentType?: string }).contentType;
    expect(await of([0xff, 0xd8, 0xff, 0])).toBe('image/jpeg');
    expect(await of([0x47, 0x49, 0x46, 0x38])).toBe('image/gif');
    expect(await of([0x25, 0x50, 0x44, 0x46])).toBe('application/pdf');
    expect(await of([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])).toBe('image/webp');
    expect(await of([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])).toBeUndefined();
    expect(await of([0xc3, 0x28])).toBeUndefined();
  });

  it('refuses what the server would', async () => {
    expect((await upload('a.png', PNG, undefined, 'cs-none')).status).toBe(404);
    expect((await upload('', PNG)).status).toBe(400);
    const nameless = await fetch(`${BASE}/${CONVERSATION_ID}/files`, { method: 'POST', body: PNG });
    expect(nameless.status).toBe(400);
    expect((await upload('a', new Uint8Array([]))).json).toMatchObject({ error: { type: 'empty_file' } });
    expect((await upload('a', new Uint8Array([1, 0, 2]))).status).toBe(415);
    db.cloudFilePolicy = { ...db.cloudFilePolicy, maxFileBytes: 2 };
    expect((await upload('a.png', PNG)).status).toBe(413);
    db.cloudFilePolicy = { ...db.cloudFilePolicy, available: false };
    expect((await upload('a.png', PNG)).json).toMatchObject({
      error: { type: 'file_storage_not_configured' },
    });
  });

  it('sends files with a message once, alone or with text, and lists them in its event', async () => {
    await upload('a.png', PNG);
    await upload('b.png', PNG);
    const sent = await call('POST', `/${CONVERSATION_ID}/messages`, {
      text: '',
      clientMessageId: 'm1',
      fileIds: ['file-1', 'file-2'],
    });
    expect(sent.status).toBe(202);
    const message = db.cloudEvents[CONVERSATION_ID]?.find(
      (event) => event.type === 'message.user' && JSON.stringify(event.data).includes('file-1'),
    );
    expect(message?.data).toMatchObject({
      files: [
        { id: 'file-1', name: 'a.png', size: 6, contentType: 'image/png' },
        { id: 'file-2', name: 'b.png' },
      ],
    });
    // Sent: no other message may carry them.
    const again = await call('POST', `/${CONVERSATION_ID}/messages`, {
      text: 'again',
      clientMessageId: 'm2',
      fileIds: ['file-1'],
    });
    expect(again).toMatchObject({ status: 409, json: { error: { type: 'file_unavailable' } } });
    expect(
      (
        await call('POST', `/${CONVERSATION_ID}/messages`, {
          text: 'x',
          clientMessageId: 'm3',
          fileIds: ['none'],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('POST', `/${CONVERSATION_ID}/messages`, {
          text: 'x',
          clientMessageId: 'm4',
          fileIds: ['a', 'a'],
        })
      ).json,
    ).toMatchObject({ error: { type: 'invalid_files' } });
    await upload('c.png', PNG);
    db.cloudFilePolicy = { ...db.cloudFilePolicy, maxMessageBytes: 2 };
    expect(
      (
        await call('POST', `/${CONVERSATION_ID}/messages`, {
          text: 'x',
          clientMessageId: 'm5',
          fileIds: ['file-3'],
        })
      ).json,
    ).toMatchObject({ error: { type: 'files_too_large' } });
    expect(
      (await call('POST', `/${CONVERSATION_ID}/messages`, { text: ' ', clientMessageId: 'm6', fileIds: [] }))
        .status,
    ).toBe(400);
  });
});
