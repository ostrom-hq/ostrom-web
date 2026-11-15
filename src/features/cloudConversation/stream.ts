// SPDX-License-Identifier: Apache-2.0
import { client } from '@gen/api/client.gen';
import type { CloudEvent } from '@gen/api/types.gen';
import { zCloudEvent } from '@gen/api/zod.gen';

/** How a followed stream ended for good: the session terminated (`end`), or the caller lost access (`denied`). */
export type StreamEnd = 'ended' | 'denied';

/**
 * The stream was refused for good: a `401`, `403` or `404` (the session is gone or no longer visible), another `4xx`,
 * or an event this console cannot read (a reconnection would replay it).
 */
export class StreamRefused extends Error {
  override readonly name = 'StreamRefused';
  readonly status: number | undefined;

  constructor(status: number | undefined, message: string) {
    super(message);
    this.status = status;
  }
}

/** What `followEvents` tells as it goes. */
export interface FollowListener {
  /** A connection was accepted. */
  readonly opened: () => void;
  readonly event: (event: CloudEvent) => void;
  /** The connection dropped; the next one starts in `waitMs`. */
  readonly reconnecting: (waitMs: number) => void;
}

/**
 * When to reconnect (TeamCode's companion `ReconnectPolicy`): 2 s after the first failure (the server's `retry:`), then
 * doubling up to 30 s, each delay shortened by up to a fifth at random so clients cut together do not return together.
 * The count restarts when an event arrives.
 */
export function reconnectDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(2_000 * 2 ** Math.min(Math.max(failures - 1, 0), 16), 30_000);
  return Math.round(base - base * random() * 0.2);
}

export interface FollowOptions {
  readonly signal: AbortSignal;
  /** Waits before a reconnection; a test gives its own. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly random?: () => number;
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/** What one connection came to: an end for good, a close or a failure worth another try, or a refusal. */
type Outcome =
  | { readonly kind: 'end'; readonly end: StreamEnd }
  | { readonly kind: 'transient' }
  | { readonly kind: 'refused'; readonly error: StreamRefused };

function transientStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/** The event as the contract types it: its sequence and epoch parse to bigints (int64), read back as numbers. */
function cloudEventOf(data: unknown): CloudEvent | undefined {
  const parsed = zCloudEvent.safeParse(data);
  if (!parsed.success) return undefined;
  const { seq, epoch, type, at, data: fields, feed } = parsed.data;
  return {
    seq: Number(seq),
    type,
    at,
    epoch: Number(epoch),
    data: fields,
    ...(feed === undefined ? {} : { feed }),
  };
}

async function connect(
  sessionId: string,
  after: number,
  listener: FollowListener,
  delivered: (seq: number) => void,
  signal: AbortSignal,
): Promise<Outcome> {
  // Written by the client's callbacks.
  const seen: { status: number | undefined; end: StreamEnd | undefined; failure: boolean } = {
    status: undefined,
    end: undefined,
    failure: false,
  };
  let unreadable = false;
  // The generated client, so its interceptors (organization, CSRF) run; not the SDK's stream, whose response
  // validator expects a string. It never retries by itself: the loop below does, after the last event delivered.
  const { stream } = await client.sse.get({
    url: '/api/v1/cloud/sessions/{id}/events/stream',
    path: { id: sessionId },
    query: { after },
    signal,
    sseMaxRetryAttempts: 1,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      // The page's own fetch: /boot.js never starts a stream, so there is no answer of its to take up.
      const response = await globalThis.fetch(input, init);
      seen.status = response.status;
      if (response.ok) listener.opened();
      return response;
    },
    onSseEvent: (message) => {
      if (message.event === 'end') seen.end = 'ended';
      if (message.event === 'denied') seen.end = 'denied';
    },
    onSseError: () => {
      seen.failure = true;
    },
  });
  for await (const data of stream) {
    if (seen.end !== undefined) break;
    const event = cloudEventOf(data);
    if (event === undefined) {
      unreadable = true;
      break;
    }
    listener.event(event);
    delivered(event.seq);
  }
  const { status, end, failure } = seen;
  if (end !== undefined) return { kind: 'end', end };
  if (unreadable) return { kind: 'refused', error: new StreamRefused(status, 'unreadable_event') };
  if (failure && !transientStatus(status))
    return { kind: 'refused', error: new StreamRefused(status, `HTTP ${String(status)}`) };
  return { kind: 'transient' };
}

/**
 * Follows a conversation session's events after `after`, reconnecting by itself after a cut, a closed stream, a `408`,
 * `429` or `5xx`, each time after the last event delivered. Resolves with how it ended for good (or `undefined` once
 * `signal` aborts); rejects with `StreamRefused` on a refusal.
 */
export async function followEvents(
  sessionId: string,
  after: number,
  listener: FollowListener,
  { signal, sleep = pause, random = Math.random }: FollowOptions,
): Promise<StreamEnd | undefined> {
  let cursor = after;
  let failures = 0;
  // Read again after each wait: the screen may have closed meanwhile.
  const closed = (): boolean => signal.aborted;
  while (!closed()) {
    const outcome = await connect(
      sessionId,
      cursor,
      listener,
      (seq) => {
        cursor = Math.max(cursor, seq);
        failures = 0;
      },
      signal,
    );
    if (closed()) return undefined;
    if (outcome.kind === 'end') return outcome.end;
    if (outcome.kind === 'refused') throw outcome.error;
    failures += 1;
    const wait = reconnectDelay(failures, random);
    listener.reconnecting(wait);
    await sleep(wait, signal);
  }
  return undefined;
}
