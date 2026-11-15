// SPDX-License-Identifier: Apache-2.0
import {
  handleAnswerCloudPermission,
  handleGetCloudFilePolicy,
  handleGetCloudSession,
  handleInterruptCloudSession,
  handleListCloudEvents,
  handleListCloudSubagents,
  handleSendCloudMessage,
  handleSetCloudPermissionBypass,
  handleSetCloudSessionEffort,
  handleSetCloudSessionModel,
  handleStopCloudTask,
  handleStreamCloudSession,
  handleUploadCloudFile,
} from '@gen/api/msw.gen';
import type {
  CloudEventDto,
  CloudEventPageDto,
  CloudFileDto,
  CloudFilePolicyDto,
  CloudInputDto,
  CloudSessionResponse,
  CloudSubagentDto,
} from '@gen/api/types.gen';
import {
  zAnswerCloudPermissionBody,
  zSendCloudMessageBody,
  zSetCloudEffortBody,
  zSetCloudModelBody,
  zSetCloudPermissionBypassBody,
  zStopCloudTaskBody,
} from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { readJson, refusal } from './http';

/** The transcripts of the conversation sessions and the inputs sent to them, as `runners` of ostrom-server keeps them. */
export interface CloudConversationState {
  cloudSessions: CloudSessionResponse[];
  /** Each conversation session's events, oldest first, `seq` from 1 without a gap. */
  cloudEvents: Record<string, CloudEventDto[]>;
  /** The inputs accepted, by `session id:clientMessageId`: a replay answers the first one. */
  cloudInputs: Record<string, CloudInputDto>;
  /** What the organization allows for files sent to sessions (`runners.cloud.files.v1`). */
  cloudFilePolicy: CloudFilePolicyDto;
  /** The files uploaded, by id, with the key they came under and whether a message carried them. */
  cloudFiles: Record<string, StoredFile>;
}

/** A file the demo's server stored for a session. */
export interface StoredFile {
  readonly file: CloudFileDto;
  readonly idempotencyKey: string | undefined;
  readonly sent: boolean;
}

const MIB = 1024 * 1024;

/** The server's defaults: 20 MiB per file, 25 MiB per message, five files, images, PDFs and text. */
export function initialCloudFilePolicy(): CloudFilePolicyDto {
  return {
    available: true,
    maxFileBytes: 20 * MIB,
    maxMessageBytes: 25 * MIB,
    maxFilesPerMessage: 5,
    types: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
    ],
  };
}

/** The signatures the server recognizes a binary file by. */
const SIGNATURES: readonly (readonly [string, readonly number[]])[] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
];

/** The type of `bytes` as the server reads it: a signature, else UTF-8 text without NUL, else none. */
export function recognizedType(bytes: Uint8Array): string | undefined {
  for (const [type, signature] of SIGNATURES)
    if (signature.every((byte, index) => bytes[index] === byte)) return type;
  const riff = [0x52, 0x49, 0x46, 0x46].every((byte, index) => bytes[index] === byte);
  if (riff && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes.includes(0)) return undefined;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'text/plain';
  } catch {
    return undefined;
  }
}

async function sha256Of(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The name as a label: its last segment, `file` when nothing is left. */
function cleanName(name: string): string {
  const last = name.replace(/^.*[/\\]/s, '').trim();
  return last === '' ? 'file' : last;
}

/** The demo's conversation session: Claude Code, running, one turn done. */
export const CONVERSATION_ID = 'cs-33';

const AT = '2026-10-30T08:10:00.000Z';

export function initialCloudEvents(): Record<string, CloudEventDto[]> {
  const events: Omit<CloudEventDto, 'seq'>[] = [
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

/** The signed-in member of the demo: the owner of its sessions. */
const VIEWER = 'maya';

/** The server's model and effort rules: 1 to 120 letters, digits and `. _ : / -`. */
const AGENT_VALUE = /^[a-zA-Z0-9._:/-]{1,120}$/;

/** A task id the server takes: 1 to 64 letters, digits, `_` and `-`. */
const TASK_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The events of one feed: `main` the main agent's own (no `feed`), another the subagent's. */
export function feedOf(events: readonly CloudEventDto[], feed: string | null): readonly CloudEventDto[] {
  if (feed === null) return events;
  return events.filter((event) =>
    feed === 'main' ? (event.feed ?? undefined) === undefined : event.feed === feed,
  );
}

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The subagents of a transcript, as the server tracks them: an `Agent` (or `Task`) call starts one, its own tool calls
 * count its steps, its call's result ends it.
 */
export function subagentsOf(events: readonly CloudEventDto[]): CloudSubagentDto[] {
  const results = new Map<string, CloudEventDto>();
  const steps = new Map<string, number>();
  for (const event of events) {
    const data = fieldsOf(event.data);
    if (event.type === 'tool.result') results.set(String(data['id']), event);
    const feed = event.feed ?? undefined;
    if (event.type === 'tool.call' && feed !== undefined) steps.set(feed, (steps.get(feed) ?? 0) + 1);
  }
  return events.flatMap((event): CloudSubagentDto[] => {
    const data = fieldsOf(event.data);
    const id = textOf(data['id']);
    const name = textOf(data['name']);
    const parent = event.feed ?? undefined;
    if (event.type !== 'tool.call' || id === undefined || (name !== 'Agent' && name !== 'Task')) return [];
    const input = fieldsOf(data['input']);
    const result = results.get(id);
    const type = textOf(input['subagent_type']);
    return [
      {
        id,
        ...(type === undefined ? {} : { type }),
        description: textOf(input['description']) ?? '',
        state:
          result === undefined
            ? 'running'
            : fieldsOf(result.data)['isError'] === true
              ? 'failed'
              : 'completed',
        startedAt: event.at,
        ...(result === undefined ? {} : { endedAt: result.at }),
        steps: steps.get(id) ?? 0,
        ...(parent === undefined ? {} : { parentId: parent }),
      },
    ];
  });
}

/** A page in ascending order: after `after`, else before `before`, else from the oldest. */
export function pageOf(events: readonly CloudEventDto[], url: URL): CloudEventPageDto {
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

function frame(event: CloudEventDto): string {
  return `id: ${String(event.seq)}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createCloudConversationHandlers(
  state: () => CloudConversationState,
  now: () => Date,
): HttpHandler[] {
  /** The streams open on each session, told of every event appended. */
  const listeners = new Map<string, Set<(event: CloudEventDto) => void>>();
  const sessionOf = (id: string): CloudSessionResponse | undefined =>
    state().cloudSessions.find((session) => session.id === id);
  /** A session never written to has no events yet. */
  const eventsOf = (id: string): readonly CloudEventDto[] => state().cloudEvents[id] ?? [];
  const append = (id: string, type: string, data: Record<string, unknown>, feed?: string): CloudEventDto => {
    const events = eventsOf(id);
    const event: CloudEventDto = {
      seq: events.length + 1,
      type,
      at: now().toISOString(),
      epoch: 1,
      data,
      ...(feed === undefined ? {} : { feed }),
    };
    state().cloudEvents[id] = [...events, event];
    for (const listener of listeners.get(id) ?? []) listener(event);
    return event;
  };
  const lastTurnStarted = (id: string): boolean =>
    JSON.stringify({ turn: eventsOf(id).findLast((event) => event.type === 'turn') }).includes(
      '"phase":"started"',
    );
  const replace = (session: CloudSessionResponse): void => {
    state().cloudSessions = state().cloudSessions.map((item) => (item.id === session.id ? session : item));
  };
  /**
   * A message about a deploy: the demo's agent starts a reviewer subagent, runs the tests in the background, and asks
   * to use Bash for the deploy itself, waiting for the owner.
   */
  const askToDeploy = (session: CloudSessionResponse): void => {
    const id = session.id;
    append(id, 'tool.call', {
      id: 'tu-agent-1',
      name: 'Agent',
      input: {
        description: 'Review the deploy script',
        subagent_type: 'reviewer',
        prompt: 'Read deploy.sh',
        run_in_background: true,
      },
    });
    append(
      id,
      'tool.call',
      { id: 'tu-sub-1', name: 'Read', input: { file_path: 'deploy.sh' } },
      'tu-agent-1',
    );
    append(id, 'tool.result', { id: 'tu-sub-1', output: '#!/bin/sh' }, 'tu-agent-1');
    append(id, 'message.agent', { text: 'The script looks safe.' }, 'tu-agent-1');
    append(id, 'tool.call', { id: 'tu-bg-1', name: 'Bash', input: { command: 'pnpm test --watch' } });
    append(id, 'tasks', {
      tasks: [
        {
          id: 'task-tests',
          type: 'local_bash',
          description: 'Tests in watch mode',
          toolUseId: 'tu-bg-1',
          startedAt: now().getTime(),
        },
        {
          id: 'task-review',
          type: 'local_agent',
          description: 'Review the deploy script',
          subagentType: 'reviewer',
          toolUseId: 'tu-agent-1',
          startedAt: now().getTime(),
        },
      ],
      stoppable: true,
      scheduled: 0,
    });
    const request = append(id, 'permission.request', {
      requestId: 'perm-deploy',
      toolName: 'Bash',
      input: { command: './deploy.sh production' },
      description: 'Deploy to production',
    });
    replace({
      ...session,
      waiting: { reason: 'permission', requestId: 'perm-deploy', since: request.at, eventSeq: request.seq },
    });
  };
  const requestOf = (id: string, requestId: string): CloudEventDto | undefined =>
    eventsOf(id).find(
      (event) => event.type === 'permission.request' && fieldsOf(event.data)['requestId'] === requestId,
    );
  const closedBy = (id: string, requestId: string): string | undefined => {
    for (const event of eventsOf(id)) {
      const data = fieldsOf(event.data);
      if (event.type === 'input' && data['requestId'] === requestId && data['status'] === 'consumed')
        return 'permission_request_answered';
      if (event.type === 'permission.expired' && data['requestId'] === requestId)
        return 'permission_request_expired';
    }
    return undefined;
  };
  /** The owner's own changes: another member is refused, as is a session that ended. */
  const ownChange = (
    id: string,
    refused: string,
    change: (session: CloudSessionResponse) => CloudSessionResponse,
  ): ReturnType<typeof refusal> | HttpResponse<CloudSessionResponse> => {
    const session = sessionOf(id);
    if (session === undefined) return NOT_FOUND();
    if (session.owner !== VIEWER) return refusal(403, refused, 'Only the session’s owner may change it.');
    if (ENDED.has(session.status)) return refusal(409, 'session_not_running', 'The session ended.');
    const next = change(session);
    replace(next);
    return HttpResponse.json<CloudSessionResponse>(next);
  };
  const upload = async (id: string, request: Request): Promise<Response> => {
    const session = sessionOf(id);
    if (session === undefined) return NOT_FOUND();
    const policy = state().cloudFilePolicy;
    if (!policy.available)
      return refusal(409, 'file_storage_not_configured', 'The organization has no tested artifact storage.');
    const name = new URL(request.url).searchParams.get('name') ?? '';
    if (name.trim() === '') return refusal(400, 'invalid_file_name', 'Name the file.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0) return refusal(400, 'empty_file', 'The file is empty.');
    if (bytes.length > policy.maxFileBytes) return refusal(413, 'file_too_large', 'The file is too large.');
    const contentType = recognizedType(bytes);
    if (contentType === undefined || !policy.types.includes(contentType))
      return refusal(415, 'file_type_not_allowed', 'This type of file is not taken.');
    const sha256 = await sha256Of(bytes);
    const key = request.headers.get('Idempotency-Key') ?? undefined;
    const replayed = Object.values(state().cloudFiles).find(
      (stored) => key !== undefined && stored.idempotencyKey === key && stored.file.sessionId === id,
    );
    if (replayed !== undefined)
      return replayed.file.sha256 === sha256
        ? HttpResponse.json(replayed.file, { status: 200, headers: { 'Idempotency-Replayed': 'true' } })
        : refusal(422, 'idempotency_conflict', 'Other bytes under this key.');
    const created = now();
    const file: CloudFileDto = {
      id: `file-${String(Object.keys(state().cloudFiles).length + 1)}`,
      sessionId: id,
      name: cleanName(name),
      size: bytes.length,
      contentType,
      sha256,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + 24 * 3_600_000).toISOString(),
    };
    state().cloudFiles[file.id] = { file, idempotencyKey: key, sent: false };
    return HttpResponse.json(file, { status: 201 });
  };
  /** Why the files a message names cannot go with it, or the files. */
  const filesOf = (
    id: string,
    fileIds: readonly string[],
  ): ReturnType<typeof refusal> | readonly CloudFileDto[] => {
    if (fileIds.length > 5 || new Set(fileIds).size !== fileIds.length)
      return refusal(400, 'invalid_files', 'Name at most five distinct files.');
    const files: CloudFileDto[] = [];
    for (const fileId of fileIds) {
      const stored = state().cloudFiles[fileId];
      if (stored === undefined || stored.sent || stored.file.sessionId !== id)
        return refusal(409, 'file_unavailable', 'A file is no longer available.');
      files.push(stored.file);
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > state().cloudFilePolicy.maxMessageBytes)
      return refusal(413, 'files_too_large', 'The files exceed the limit per message.');
    return files;
  };
  return [
    handleGetCloudFilePolicy(() => HttpResponse.json(state().cloudFilePolicy)),
    handleUploadCloudFile(async ({ params, request }) => upload(params.id, request)),
    handleListCloudSubagents(({ params }) => {
      if (sessionOf(params.id) === undefined) return NOT_FOUND();
      return HttpResponse.json({ agents: subagentsOf(eventsOf(params.id)) });
    }),
    handleAnswerCloudPermission(async ({ params, request }) => {
      const session = sessionOf(params.id);
      if (session === undefined) return NOT_FOUND();
      const body = zAnswerCloudPermissionBody.safeParse(await readJson(request));
      if (!body.success || (body.data.behavior !== 'allow' && body.data.behavior !== 'deny'))
        return refusal(400, 'invalid_permission_answer', 'Allow or deny the request.');
      const key = `${session.id}:permission:${request.headers.get('Idempotency-Key') ?? body.data.requestId}`;
      const replayed = state().cloudInputs[key];
      if (replayed !== undefined) return HttpResponse.json(replayed, { status: 202 });
      if (session.status !== 'running')
        return refusal(409, 'nothing_to_answer', 'The session is not running.');
      const { requestId } = body.data;
      if (requestOf(session.id, requestId) === undefined)
        return refusal(409, 'unknown_permission_request', 'No such permission request.');
      const closed = closedBy(session.id, requestId);
      if (closed !== undefined) return refusal(409, closed, 'This request takes no answer any more.');
      const input: CloudInputDto = {
        id: `in-${String(Object.keys(state().cloudInputs).length + 700)}`,
        kind: 'permission',
        status: 'consumed',
        authorId: MEMBER_IDS.maya,
        createdAt: now().toISOString(),
      };
      state().cloudInputs[key] = input;
      // The demo's agent takes it at once: the answer consumed, then the tool used (or not) and its turn over.
      append(session.id, 'input', { inputId: input.id, status: 'consumed', requestId });
      // Answered: the session no longer waits.
      const { waiting, ...answered } = session;
      if (waiting !== undefined) replace(answered);
      // The deploy's reviewer, launched in the background, says so once the owner answered: its task runs on.
      if (requestId === 'perm-deploy')
        append(session.id, 'tool.result', { id: 'tu-agent-1', output: 'Launched in the background.' });
      if (body.data.behavior === 'allow') {
        append(session.id, 'tool.call', {
          id: `tu-${requestId}`,
          name: 'Bash',
          input: { command: './deploy.sh production' },
        });
        append(session.id, 'tool.result', { id: `tu-${requestId}`, output: 'deployed', exitCode: 0 });
        append(session.id, 'message.agent', { text: 'Deployed.' });
      } else append(session.id, 'message.agent', { text: 'Understood: I will not deploy.' });
      append(session.id, 'turn', { phase: 'completed', durationMs: 3_000, steps: 3 });
      return HttpResponse.json(input, { status: 202 });
    }),
    handleSetCloudPermissionBypass(async ({ params, request }) => {
      const body = zSetCloudPermissionBypassBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'Say whether it is on.');
      return ownChange(params.id, 'bypass_owner_only', (session) => ({
        ...session,
        permissionBypass: body.data.enabled,
      }));
    }),
    handleSetCloudSessionModel(async ({ params, request }) => {
      const body = zSetCloudModelBody.safeParse(await readJson(request));
      if (!body.success || !AGENT_VALUE.test(body.data.model))
        return refusal(400, 'invalid_agent', 'Use letters, digits and . _ : / -.');
      return ownChange(params.id, 'model_owner_only', (session) => ({ ...session, model: body.data.model }));
    }),
    handleSetCloudSessionEffort(async ({ params, request }) => {
      const body = zSetCloudEffortBody.safeParse(await readJson(request));
      if (!body.success || !AGENT_VALUE.test(body.data.effort))
        return refusal(400, 'invalid_agent', 'Use letters, digits and . _ : / -.');
      return ownChange(params.id, 'effort_owner_only', (session) => ({
        ...session,
        effort: body.data.effort,
      }));
    }),
    handleStopCloudTask(async ({ params, request }) => {
      const session = sessionOf(params.id);
      if (session === undefined) return NOT_FOUND();
      const body = zStopCloudTaskBody.safeParse(await readJson(request));
      if (!body.success || !TASK_ID.test(body.data.taskId))
        return refusal(400, 'invalid_task', 'Name the task to stop.');
      if (session.status !== 'running') return refusal(409, 'nothing_to_interrupt', 'Nothing is running.');
      // The runner stops it and reports the tasks left.
      const report = eventsOf(session.id).findLast((event) => event.type === 'tasks');
      const data = fieldsOf(report?.data);
      const tasks = Array.isArray(data['tasks']) ? data['tasks'] : [];
      append(session.id, 'tasks', {
        ...data,
        tasks: tasks.filter((task) => fieldsOf(task)['id'] !== body.data.taskId),
      });
      return HttpResponse.json(
        {
          id: `in-${String(Object.keys(state().cloudInputs).length + 900)}`,
          kind: 'stop_task',
          status: 'queued',
          authorId: MEMBER_IDS.maya,
          createdAt: now().toISOString(),
        },
        { status: 202 },
      );
    }),
    handleGetCloudSession(({ params }) => {
      const session = sessionOf(params.id);
      return session === undefined ? NOT_FOUND() : HttpResponse.json(session);
    }),
    handleListCloudEvents(({ params, request }) => {
      if (sessionOf(params.id) === undefined) return NOT_FOUND();
      // A terminal session has no transcript: an empty page.
      const url = new URL(request.url);
      return HttpResponse.json(pageOf(feedOf(eventsOf(params.id), url.searchParams.get('feed')), url));
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
      const told = (event: CloudEventDto): void => {
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
      const body = zSendCloudMessageBody.safeParse(await readJson(request));
      const text = body.success ? (body.data.text ?? '') : '';
      const fileIds = body.data?.fileIds ?? [];
      // With files the text may be empty.
      if (!body.success || (text.trim() === '' && fileIds.length === 0))
        return refusal(400, 'invalid_message', 'Write a message of 1 to 32,000 characters.');
      if (session.mode !== 'conversation')
        return refusal(409, 'terminal_session', 'A terminal session takes no message.');
      if (ENDED.has(session.status)) return refusal(409, 'session_not_running', 'The session ended.');
      // The console always names its message (`clientMessageId`): a replay answers the first input.
      const clientMessageId = body.data.clientMessageId ?? undefined;
      if (clientMessageId === undefined)
        return refusal(400, 'idempotency_key_required', 'Name the message with clientMessageId.');
      const key = `${session.id}:${clientMessageId}`;
      const replayed = state().cloudInputs[key];
      if (replayed !== undefined) return HttpResponse.json(replayed, { status: 202 });
      const files = filesOf(session.id, fileIds);
      if (files instanceof Response) return files;
      for (const file of files)
        state().cloudFiles[file.id] = {
          file,
          idempotencyKey: state().cloudFiles[file.id]?.idempotencyKey,
          sent: true,
        };
      const woke = session.status === 'paused';
      if (woke) replace({ ...session, status: 'running' });
      const input: CloudInputDto = {
        id: `in-${String(Object.keys(state().cloudInputs).length + 100)}`,
        kind: 'message',
        status: 'consumed',
        authorId: MEMBER_IDS.maya,
        text,
        woke,
        createdAt: now().toISOString(),
        clientMessageId,
      };
      state().cloudInputs[key] = input;
      // The demo's agent answers at once: the message, a turn, and a reply.
      append(session.id, 'message.user', {
        text,
        inputId: input.id,
        authorId: input.authorId,
        ...(files.length === 0
          ? {}
          : {
              files: files.map((file) => ({
                id: file.id,
                name: file.name,
                size: file.size,
                contentType: file.contentType,
              })),
            }),
      });
      append(session.id, 'turn', { phase: 'started' });
      if (/deploy/i.test(text)) {
        askToDeploy(session);
        return HttpResponse.json(input, { status: 202 });
      }
      append(session.id, 'message.agent', {
        text: files.length === 0 ? `On it: ${text}` : `Read ${files.map((file) => file.name).join(', ')}.`,
      });
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
