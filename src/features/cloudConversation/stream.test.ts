// SPDX-License-Identifier: Apache-2.0
import { client } from '@gen/api/client.gen';
import type { CloudEventDto } from '@gen/api/types.gen';
import { followEvents, reconnectDelay, StreamRefused } from './stream';

const AT = '2026-11-15T10:00:00.000Z';

function frame(seq: number, type = 'message.agent'): string {
  const event: CloudEventDto = { seq, type, at: AT, epoch: 1, data: { text: `e${String(seq)}` } };
  return `id: ${String(seq)}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Each connection answers the next of `answers`; the URLs asked are kept. */
function serve(answers: readonly (() => Response | Promise<Response>)[]): { readonly urls: string[] } {
  const urls: string[] = [];
  let next = 0;
  client.setConfig({ baseUrl: 'http://ostrom.test' });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    urls.push(request.url);
    const answer = answers[next];
    next += 1;
    if (answer === undefined) throw new Error('no more answers');
    return answer();
  });
  return { urls };
}

function stream(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

interface Heard {
  readonly opened: number[];
  readonly events: number[];
  readonly waits: number[];
}

function listen(): Heard & {
  readonly listener: Parameters<typeof followEvents>[2];
} {
  const heard = { opened: [] as number[], events: [] as number[], waits: [] as number[] };
  return {
    ...heard,
    listener: {
      opened: () => heard.opened.push(1),
      event: (event) => heard.events.push(event.seq),
      reconnecting: (wait) => heard.waits.push(wait),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('following a conversation’s events (TeamCode RemoteTranscriptRepository.follow)', () => {
  it('backs off from 2 s up to 30 s, shortened by up to a fifth', () => {
    expect(reconnectDelay(1, () => 0)).toBe(2_000);
    expect(reconnectDelay(2, () => 0)).toBe(4_000);
    expect(reconnectDelay(0, () => 0)).toBe(2_000);
    expect(reconnectDelay(10, () => 0)).toBe(30_000);
    expect(reconnectDelay(40, () => 1)).toBe(24_000);
    expect(reconnectDelay(1)).toBeGreaterThanOrEqual(1_600);
  });

  it('reads the events, reconnects after a close or a failure from the last one, and stops at the end', async () => {
    const { urls } = serve([
      () => stream(frame(4) + frame(5)),
      () => stream('', 503),
      () => {
        throw new TypeError('offline');
      },
      () => stream(`: keep-alive\n\n${frame(6)}event: end\ndata: {}\n\n${frame(7)}`),
    ]);
    const heard = listen();
    const end = await followEvents('cs-1', 3, heard.listener, {
      signal: new AbortController().signal,
      sleep: async () => {
        await Promise.resolve();
      },
      random: () => 0,
    });
    expect(end).toBe('ended');
    expect(heard.events).toEqual([4, 5, 6]);
    expect(heard.opened).toHaveLength(2);
    // A failure without an event in between backs off; an event starts the count again.
    expect(heard.waits).toEqual([2_000, 4_000, 8_000]);
    expect(urls.map((url) => new URL(url).searchParams.get('after'))).toEqual(['3', '5', '5', '5']);
    expect(new URL(urls[0] ?? '').pathname).toBe('/api/v1/cloud/sessions/cs-1/events/stream');
  });

  it('says when access was withdrawn', async () => {
    serve([() => stream('event: denied\ndata: {}\n\n')]);
    const heard = listen();
    await expect(
      followEvents('cs-1', 0, heard.listener, { signal: new AbortController().signal }),
    ).resolves.toBe('denied');
  });

  it('is refused for good on a 4xx, or an event it cannot read', async () => {
    serve([() => stream('', 404)]);
    const refused = followEvents('cs-1', 0, listen().listener, { signal: new AbortController().signal });
    await expect(refused).rejects.toBeInstanceOf(StreamRefused);
    await expect(refused).rejects.toMatchObject({ status: 404 });
    serve([() => stream('event: message.agent\ndata: {"seq":"x"}\n\n')]);
    await expect(
      followEvents('cs-1', 0, listen().listener, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ status: 200, message: 'unreadable_event' });
  });

  it('stops once the screen closes, during a connection or a wait', async () => {
    const during = new AbortController();
    serve([
      () => {
        during.abort();
        return stream(frame(1));
      },
    ]);
    await expect(followEvents('cs-1', 0, listen().listener, { signal: during.signal })).resolves.toBe(
      undefined,
    );
    const waiting = new AbortController();
    serve([() => stream('')]);
    const heard = listen();
    const following = followEvents('cs-1', 0, heard.listener, { signal: waiting.signal, random: () => 0 });
    await vi.waitFor(() => {
      expect(heard.waits).toEqual([2_000]);
    });
    waiting.abort();
    await expect(following).resolves.toBe(undefined);
    const before = new AbortController();
    before.abort();
    await expect(followEvents('cs-1', 0, listen().listener, { signal: before.signal })).resolves.toBe(
      undefined,
    );
  });

  it('carries the feed an event belongs to', async () => {
    const event: CloudEventDto = { seq: 1, type: 'tool.call', at: AT, epoch: 2, data: {}, feed: 'tu-9' };
    serve([
      () => stream(`id: 1\nevent: tool.call\ndata: ${JSON.stringify(event)}\n\nevent: end\ndata: {}\n\n`),
    ]);
    const events: CloudEventDto[] = [];
    await followEvents(
      'cs-1',
      0,
      { opened: () => undefined, event: (got) => events.push(got), reconnecting: () => undefined },
      { signal: new AbortController().signal },
    );
    expect(events).toEqual([event]);
  });
});
