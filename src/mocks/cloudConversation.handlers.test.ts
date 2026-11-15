// SPDX-License-Identifier: Apache-2.0
import type { CloudEvent } from '@gen/api/types.gen';
import { CONVERSATION_ID, pageOf } from '@/mocks/cloudConversation';
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

function events(count: number): CloudEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    seq: index + 1,
    type: 'message.agent',
    at: '2026-10-30T08:00:00.000Z',
    epoch: 1,
    data: {},
  }));
}

function seqs(page: { readonly events: readonly CloudEvent[] }): number[] {
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
    expect((await call('POST', path, { text: 'no id' })).json).toMatchObject({
      error: { type: 'idempotency_key_required' },
    });
    expect((await call('POST', '/cs-none/messages', { text: 'x', clientMessageId: 'k' })).status).toBe(404);
    expect((await call('POST', '/cs-31/messages', { text: 'x', clientMessageId: 'k' })).json).toMatchObject({
      error: { type: 'terminal_session' },
    });
    db.cloudSessions.push({
      id: 'cs-p',
      owner: 'maya',
      agent: 'codex',
      mode: 'conversation',
      status: 'paused',
      createdAt: '2026-10-30T08:00:00.000Z',
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
