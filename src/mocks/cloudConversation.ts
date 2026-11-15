// SPDX-License-Identifier: Apache-2.0
import {
  handleGetCloudSession,
  handleInterruptCloudSession,
  handleListCloudEvents,
  handleSendCloudMessage,
  handleStreamCloudSession,
} from '@gen/api/msw.gen';
import type { CloudEvent, CloudEventPage, CloudInput, CloudSession } from '@gen/api/types.gen';
import { zSendCloudMessageRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { readJson, refusal } from './http';

/** The transcripts of the conversation sessions and the inputs sent to them, as `runners` of ostrom-server keeps them. */
export interface CloudConversationState {
  cloudSessions: CloudSession[];
  /** Each conversation session's events, oldest first, `seq` from 1 without a gap. */
  cloudEvents: Record<string, CloudEvent[]>;
  /** The inputs accepted, by `session id:clientMessageId`: a replay answers the first one. */
  cloudInputs: Record<string, CloudInput>;
}

/** The demo's conversation session: Claude Code, running, one turn done. */
export const CONVERSATION_ID = 'cs-33';

const AT = '2026-10-30T08:10:00.000Z';

export function initialCloudEvents(): Record<string, CloudEvent[]> {
  const events: Omit<CloudEvent, 'seq'>[] = [
    { type: 'status', at: AT, epoch: 1, data: { agent: 'claude', model: 'claude-sonnet-5' } },
    {
      type: 'message.user',
      at: AT,
      epoch: 1,
      data: {
        text: 'Why does the invoice test fail on Mondays?',
        inputId: 'in-1',
        authorId: MEMBER_IDS.maya,
      },
    },
    { type: 'turn', at: AT, epoch: 1, data: { phase: 'started' } },
    {
      type: 'tool.call',
      at: AT,
      epoch: 1,
      data: { id: 'tu-1', name: 'Bash', input: { command: 'pnpm test invoice' } },
    },
    { type: 'tool.result', at: AT, epoch: 1, data: { id: 'tu-1', output: '1 failed', exitCode: 1 } },
    {
      type: 'tool.call',
      at: AT,
      epoch: 1,
      data: { id: 'tu-2', name: 'Read', input: { file_path: 'src/invoice/dates.ts' } },
    },
    { type: 'tool.result', at: AT, epoch: 1, data: { id: 'tu-2', output: 'export function week…' } },
    {
      type: 'message.agent',
      at: AT,
      epoch: 1,
      data: {
        text: 'The test computes the week from the **local** day: on a Monday before 2 a.m. UTC it is still Sunday.',
      },
    },
    { type: 'turn', at: AT, epoch: 1, data: { phase: 'completed', durationMs: 42_000, steps: 2 } },
  ];
  return { [CONVERSATION_ID]: events.map((event, index) => ({ ...event, seq: index + 1 })) };
}

/** What the server answers for a session that is not the caller's to read: the same as for none. */
const NOT_FOUND = (): ReturnType<typeof refusal> => refusal(404, 'not_found', 'cloud session not found');

const ENDED: ReadonlySet<string> = new Set(['ended', 'stopped', 'failed', 'terminated']);

const PAGE = 100;

/** Number of a query parameter, or undefined. */
function numberOf(value: string | null): number | undefined {
  const parsed = Number(value ?? 'none');
  return value === '' || !Number.isFinite(parsed) ? undefined : parsed;
}

/** A page in ascending order: after `after`, else before `before`, else from the oldest. */
export function pageOf(events: readonly CloudEvent[], url: URL): CloudEventPage {
  const after = numberOf(url.searchParams.get('after'));
  const before = numberOf(url.searchParams.get('before'));
  const limit = Math.min(numberOf(url.searchParams.get('limit')) ?? PAGE, PAGE);
  const lastSeq = events.at(-1)?.seq ?? 0;
  const firstSeq = events[0]?.seq ?? 0;
  if (after !== undefined) {
    const page = events.filter((event) => event.seq > after).slice(0, limit);
    const next = page.at(-1)?.seq;
    return {
      events: page,
      firstSeq,
      lastSeq,
      ...(next === undefined || next >= lastSeq ? {} : { nextAfter: next }),
    };
  }
  const older = events.filter((event) => before === undefined || event.seq < before);
  const page = before === undefined ? older.slice(0, limit) : older.slice(-limit);
  const oldest = page[0]?.seq;
  return {
    events: page,
    firstSeq,
    lastSeq,
    ...(oldest === undefined || oldest <= firstSeq ? {} : { nextBefore: oldest }),
  };
}

function frame(event: CloudEvent): string {
  return `id: ${String(event.seq)}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createCloudConversationHandlers(
  state: () => CloudConversationState,
  now: () => Date,
): HttpHandler[] {
  /** The streams open on each session, told of every event appended. */
  const listeners = new Map<string, Set<(event: CloudEvent) => void>>();
  const sessionOf = (id: string): CloudSession | undefined =>
    state().cloudSessions.find((session) => session.id === id);
  /** A session never written to has no events yet. */
  const eventsOf = (id: string): readonly CloudEvent[] => state().cloudEvents[id] ?? [];
  const append = (id: string, type: string, data: Record<string, unknown>): CloudEvent => {
    const events = eventsOf(id);
    const event: CloudEvent = {
      seq: events.length + 1,
      type,
      at: now().toISOString(),
      epoch: 1,
      data,
    };
    state().cloudEvents[id] = [...events, event];
    for (const listener of listeners.get(id) ?? []) listener(event);
    return event;
  };
  const lastTurnStarted = (id: string): boolean =>
    JSON.stringify({ turn: eventsOf(id).findLast((event) => event.type === 'turn') }).includes(
      '"phase":"started"',
    );
  const replace = (session: CloudSession): void => {
    state().cloudSessions = state().cloudSessions.map((item) => (item.id === session.id ? session : item));
  };
  return [
    handleGetCloudSession(({ params }) => {
      const session = sessionOf(params.id);
      return session === undefined ? NOT_FOUND() : HttpResponse.json(session);
    }),
    handleListCloudEvents(({ params, request }) => {
      if (sessionOf(params.id) === undefined) return NOT_FOUND();
      // A terminal session has no transcript: an empty page.
      return HttpResponse.json(pageOf(eventsOf(params.id), new URL(request.url)));
    }),
    handleStreamCloudSession(({ params, request }) => {
      const id = params.id;
      const session = sessionOf(id);
      if (session === undefined) return NOT_FOUND();
      const url = new URL(request.url);
      const after =
        numberOf(request.headers.get('Last-Event-ID')) ?? numberOf(url.searchParams.get('after')) ?? 0;
      const encoder = new TextEncoder();
      let target: ReadableStreamDefaultController<Uint8Array> | undefined;
      const told = (event: CloudEvent): void => {
        target?.enqueue(encoder.encode(frame(event)));
      };
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          for (const event of eventsOf(id))
            if (event.seq > after) controller.enqueue(encoder.encode(frame(event)));
          if (ENDED.has(session.status)) {
            controller.enqueue(encoder.encode('event: end\ndata: {}\n\n'));
            controller.close();
            return;
          }
          target = controller;
          listeners.set(id, new Set([...(listeners.get(id) ?? []), told]));
        },
        cancel: () => {
          listeners.get(id)?.delete(told);
        },
      });
      return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
    }),
    handleSendCloudMessage(async ({ params, request }) => {
      const session = sessionOf(params.id);
      if (session === undefined) return NOT_FOUND();
      const body = zSendCloudMessageRequest.safeParse(await readJson(request));
      if (!body.success || body.data.text.trim() === '')
        return refusal(400, 'invalid_message', 'Write a message of 1 to 32,000 characters.');
      if (session.mode !== 'conversation')
        return refusal(409, 'terminal_session', 'A terminal session takes no message.');
      if (ENDED.has(session.status)) return refusal(409, 'session_not_running', 'The session ended.');
      // The console always names its message (`clientMessageId`): a replay answers the first input.
      const clientMessageId = body.data.clientMessageId;
      if (clientMessageId === undefined)
        return refusal(400, 'idempotency_key_required', 'Name the message with clientMessageId.');
      const key = `${session.id}:${clientMessageId}`;
      const replayed = state().cloudInputs[key];
      if (replayed !== undefined) return HttpResponse.json(replayed, { status: 202 });
      const woke = session.status === 'paused';
      if (woke) replace({ ...session, status: 'running' });
      const input: CloudInput = {
        id: `in-${String(Object.keys(state().cloudInputs).length + 100)}`,
        kind: 'message',
        status: 'consumed',
        authorId: MEMBER_IDS.maya,
        text: body.data.text,
        woke,
        createdAt: now().toISOString(),
        clientMessageId,
      };
      state().cloudInputs[key] = input;
      // The demo's agent answers at once: the message, a turn, and a reply.
      append(session.id, 'message.user', {
        text: body.data.text,
        inputId: input.id,
        authorId: input.authorId,
      });
      append(session.id, 'turn', { phase: 'started' });
      append(session.id, 'message.agent', { text: `On it: ${body.data.text}` });
      append(session.id, 'turn', { phase: 'completed', durationMs: 1_000, steps: 0 });
      return HttpResponse.json(input, { status: 202 });
    }),
    handleInterruptCloudSession(({ params }) => {
      const session = sessionOf(params.id);
      if (session === undefined) return NOT_FOUND();
      if (session.status !== 'running' || !lastTurnStarted(session.id))
        return refusal(409, 'nothing_to_interrupt', 'Nothing is running.');
      append(session.id, 'turn', { phase: 'interrupted' });
      return HttpResponse.json(
        {
          id: `in-${String(Object.keys(state().cloudInputs).length + 500)}`,
          kind: 'interrupt',
          status: 'queued',
          authorId: MEMBER_IDS.maya,
          createdAt: now().toISOString(),
        },
        { status: 202 },
      );
    }),
  ];
}
