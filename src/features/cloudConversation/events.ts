// SPDX-License-Identifier: Apache-2.0
import type { CloudEvent, CloudEventPage, CloudSubagent } from '@gen/api/types.gen';

/** A file a `message.user` carried, as the server recorded it. */
export interface MessageFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
}

/**
 * One transcript event of a conversation session, already bounded and masked by the server (TeamCode's companion
 * `TranscriptEvent`). `seq` is the session's own sequence, gap-free from 1: events are told apart and ordered by it
 * alone. An unknown type becomes `unknown` instead of failing.
 */
export type TranscriptEvent =
  | {
      readonly kind: 'user';
      readonly seq: number;
      readonly at: string;
      readonly text: string;
      readonly inputId: string | undefined;
      readonly authorId: string | undefined;
      /** The files the message carried (`runners.cloud.files.v1`): names, sizes and types, never a host path. */
      readonly files: readonly MessageFile[];
    }
  | {
      readonly kind: 'agent';
      readonly seq: number;
      readonly at: string;
      readonly text: string;
      readonly parentToolUseId: string | undefined;
      /** With `index`, the live text it replaces (`message.agent.delta`); `index` absent: every block of the message. */
      readonly messageId: string | undefined;
      readonly index: number | undefined;
    }
  | {
      /** Live text while the agent writes it (`runners.cloud.transcript.live.v1`): what the block gained since its last delta. */
      readonly kind: 'delta';
      readonly seq: number;
      readonly at: string;
      readonly text: string;
      readonly messageId: string;
      readonly index: number;
      readonly parentToolUseId: string | undefined;
    }
  | {
      readonly kind: 'toolCall';
      readonly seq: number;
      readonly at: string;
      readonly id: string;
      readonly name: string;
      /** The tool input as indented JSON. */
      readonly input: string;
      /** Its most telling field, on one line: a command, a path. */
      readonly summary: string | undefined;
      readonly parentToolUseId: string | undefined;
      /** The input as sent, for what a subagent's card reads (its type, its description, background or not). */
      readonly fields: Readonly<Record<string, unknown>> | undefined;
    }
  | {
      readonly kind: 'toolResult';
      readonly seq: number;
      readonly at: string;
      readonly id: string;
      readonly output: string;
      readonly isError: boolean;
      readonly exitCode: number | undefined;
      readonly parentToolUseId: string | undefined;
    }
  | {
      readonly kind: 'turn';
      readonly seq: number;
      readonly at: string;
      readonly phase: TurnPhase;
      readonly durationMs: number | undefined;
      readonly steps: number | undefined;
    }
  | {
      readonly kind: 'status';
      readonly seq: number;
      readonly at: string;
      readonly agent: string | undefined;
      readonly model: string | undefined;
      readonly exitCode: number | undefined;
    }
  | {
      readonly kind: 'error';
      readonly seq: number;
      readonly at: string;
      readonly code: string | undefined;
      readonly message: string | undefined;
    }
  | {
      /** An input that changed status: rejected or cancelled (with `reason`), or a consumed permission answer. */
      readonly kind: 'input';
      readonly seq: number;
      readonly at: string;
      readonly inputId: string | undefined;
      readonly status: string | undefined;
      readonly reason: string | undefined;
      readonly requestId: string | undefined;
    }
  | PermissionRequest
  | {
      readonly kind: 'permissionExpired';
      readonly seq: number;
      readonly at: string;
      readonly requestId: string | undefined;
    }
  | {
      readonly kind: 'transferred';
      readonly seq: number;
      readonly at: string;
      readonly fromMemberId: string | undefined;
      readonly toMemberId: string | undefined;
    }
  | {
      /**
       * The agent's live background tasks as its runner reported them, the whole set each time (`runners.cloud.tasks.v1`);
       * `stoppable`: the runner can stop one; `scheduled`: the scheduled wake-ups the agent holds.
       */
      readonly kind: 'tasks';
      readonly seq: number;
      readonly at: string;
      readonly tasks: readonly BackgroundTask[];
      readonly stoppable: boolean;
      readonly scheduled: number;
    }
  | {
      /** An event of more than 60 000 bytes, replaced by the server. */
      readonly kind: 'truncated';
      readonly seq: number;
      readonly at: string;
      readonly type: string;
      readonly originalBytes: number | undefined;
    }
  | { readonly kind: 'unknown'; readonly seq: number; readonly at: string; readonly type: string };

/**
 * The agent waits for a person: a tool use to allow, or a question (`AskUserQuestion`, with `questions`). `input` is
 * the tool input as indented JSON; a request whose input was too large for the event has `inputLeftOut` and only its
 * first characters in `inputPreview`, and can only be denied.
 */
export interface PermissionRequest {
  readonly kind: 'permission';
  readonly seq: number;
  readonly at: string;
  readonly requestId: string | undefined;
  readonly toolName: string | undefined;
  readonly question: boolean;
  readonly questions: readonly AgentQuestion[];
  readonly input: string | undefined;
  readonly inputLeftOut: boolean;
  readonly inputPreview: string | undefined;
  readonly description: string | undefined;
}

export interface AgentQuestionOption {
  readonly label: string;
  readonly description: string | undefined;
}

/** A question of `AskUserQuestion`; `index` is its place in the request's `input.questions`, the one answered. */
export interface AgentQuestion {
  readonly index: number;
  readonly text: string;
  readonly header: string | undefined;
  readonly options: readonly AgentQuestionOption[];
  readonly multiSelect: boolean;
}

/**
 * One background task of the agent: a subagent (`local_agent`), a background command or monitor (`local_bash`).
 * `toolUseId` is the tool call that started it, when the runner knew; `startedAt` the runner's clock (epoch ms).
 */
export interface BackgroundTask {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly subagentType: string | undefined;
  readonly toolUseId: string | undefined;
  readonly startedAt: number | undefined;
}

export const TURN_PHASES = ['started', 'completed', 'interrupted', 'failed'] as const;
export type TurnPhase = (typeof TURN_PHASES)[number] | 'unknown';

/** A phase this version does not know is `unknown`, which says nothing either way. */
export function turnPhaseOf(wire: string | undefined): TurnPhase {
  return TURN_PHASES.find((phase) => phase === wire) ?? 'unknown';
}

/** The turn is over. */
export function finished(phase: TurnPhase): boolean {
  return phase === 'completed' || phase === 'interrupted' || phase === 'failed';
}

export function isSubagentTask(task: BackgroundTask): boolean {
  return task.type === 'local_agent';
}

/** How the server reports a subagent's progress (`runners.cloud.transcript.feeds.v1`). */
export type KnownAgentState = 'running' | 'completed' | 'failed' | 'unknown';

/**
 * A subagent as the server tracks it, whatever part of the transcript was loaded: `id` is its `Agent` call's id and
 * the feed of its events, `parentId` the feed that started it (absent: the main agent), `taskId` the id to stop it with.
 */
export interface KnownAgent {
  readonly id: string;
  readonly type: string | undefined;
  readonly description: string;
  readonly state: KnownAgentState;
  readonly startedAt: number;
  readonly endedAt: number | undefined;
  readonly steps: number;
  readonly parentId: string | undefined;
  readonly taskId: string | undefined;
}

/** A page of history, oldest first. `nextBefore` continues upward; undefined when nothing older is kept. */
export interface TranscriptPage {
  readonly events: readonly TranscriptEvent[];
  readonly nextBefore: number | undefined;
  readonly lastSeq: number;
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(fields: Fields, key: string): string | undefined {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
}

function filled(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function int(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function pretty(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The fields that tell most about a tool use, in this order. */
const SUMMARY_FIELDS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt'];
const SUMMARY_CHARS = 160;

/** The field that tells most about a tool use, on one line: a shell command, a path, a pattern, a URL. */
export function toolSummary(input: unknown): string | undefined {
  if (!isFields(input)) return undefined;
  const value = SUMMARY_FIELDS.map((key) => filled(text(input, key))).find((found) => found !== undefined);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const line = trimmed.replace(/\n[\s\S]*$/, '').trim();
  return line.length > SUMMARY_CHARS || trimmed.includes('\n') ? `${line.slice(0, SUMMARY_CHARS)}…` : line;
}

/**
 * A permission request. An input that is not an object counts as left out, as the server reads it: such a request can
 * only be denied. Questions keep their index in `input.questions`, the one the server takes back, even when one of
 * them cannot be read; a repeated question text is kept once (Claude Code keys answers by text).
 */
function permissionRequest(seq: number, at: string, data: Fields): PermissionRequest {
  const input = isFields(data['input']) ? data['input'] : undefined;
  const question = bool(data['question']) === true;
  const seen = new Set<string>();
  const questions: AgentQuestion[] = [];
  if (question && input !== undefined) {
    list(input['questions']).forEach((element, index) => {
      if (!isFields(element)) return;
      const asked = text(element, 'question');
      if (asked === undefined || seen.has(asked)) return;
      seen.add(asked);
      questions.push({
        index,
        text: asked,
        header: filled(text(element, 'header')),
        options: list(element['options']).map((option) => ({
          label: isFields(option) ? (text(option, 'label') ?? '') : '',
          description: isFields(option) ? filled(text(option, 'description')) : undefined,
        })),
        multiSelect: bool(element['multiSelect']) === true,
      });
    });
  }
  return {
    kind: 'permission',
    seq,
    at,
    requestId: text(data, 'requestId'),
    toolName: text(data, 'toolName'),
    question,
    questions,
    input: input === undefined ? undefined : pretty(input),
    inputLeftOut: bool(data['inputTruncated']) === true || input === undefined,
    inputPreview: text(data, 'inputPreview'),
    description: filled(text(data, 'description')),
  };
}

/** The files of a `message.user`: one without an id or a name is left out. */
function filesOf(value: unknown): MessageFile[] {
  return list(value).flatMap((element) => {
    if (!isFields(element)) return [];
    const id = text(element, 'id');
    const name = text(element, 'name');
    if (id === undefined || name === undefined) return [];
    return [{ id, name, size: int(element['size']) ?? 0, contentType: text(element, 'contentType') ?? '' }];
  });
}

function tasksOf(value: unknown): BackgroundTask[] {
  return list(value).flatMap((element) => {
    if (!isFields(element)) return [];
    const id = text(element, 'id');
    if (id === undefined) return [];
    return [
      {
        id,
        type: text(element, 'type') ?? 'task',
        description: text(element, 'description') ?? '',
        subagentType: text(element, 'subagentType'),
        toolUseId: text(element, 'toolUseId'),
        startedAt: int(element['startedAt']),
      },
    ];
  });
}

/**
 * Every type and field is optional (TeamCode's `CloudEventView.domain()`): an unknown type or a missing field never
 * fails the transcript. The subagent an event belongs to is its `parentToolUseId`, or the server's `feed`.
 */
export function eventOf(event: CloudEvent): TranscriptEvent {
  const { seq, at, type } = event;
  const data: Fields = isFields(event.data) ? event.data : {};
  const parentToolUseId = text(data, 'parentToolUseId') ?? event.feed;
  // The server replaces an event of more than 60 000 bytes with this marker.
  if (bool(data['truncated']) === true && data['originalBytes'] !== undefined) {
    return { kind: 'truncated', seq, at, type, originalBytes: int(data['originalBytes']) };
  }
  switch (type) {
    case 'message.user':
      return {
        kind: 'user',
        seq,
        at,
        text: text(data, 'text') ?? '',
        inputId: text(data, 'inputId'),
        authorId: text(data, 'authorId'),
        files: filesOf(data['files']),
      };
    case 'message.agent':
      return {
        kind: 'agent',
        seq,
        at,
        text: text(data, 'text') ?? '',
        parentToolUseId,
        messageId: text(data, 'messageId'),
        index: int(data['index']),
      };
    case 'message.agent.delta': {
      const messageId = text(data, 'messageId');
      const index = int(data['index']);
      if (messageId === undefined || index === undefined) return { kind: 'unknown', seq, at, type };
      return { kind: 'delta', seq, at, text: text(data, 'text') ?? '', messageId, index, parentToolUseId };
    }
    case 'tool.call': {
      const input = data['input'];
      return {
        kind: 'toolCall',
        seq,
        at,
        id: text(data, 'id') ?? '',
        name: text(data, 'name') ?? 'tool',
        input: pretty(input),
        summary: toolSummary(input),
        parentToolUseId,
        fields: isFields(input) ? input : undefined,
      };
    }
    case 'tool.result': {
      const output = data['output'];
      return {
        kind: 'toolResult',
        seq,
        at,
        id: text(data, 'id') ?? '',
        output: typeof output === 'string' ? output : pretty(output),
        isError: bool(data['isError']) === true,
        exitCode: int(data['exitCode']),
        parentToolUseId,
      };
    }
    case 'turn':
      return {
        kind: 'turn',
        seq,
        at,
        phase: turnPhaseOf(text(data, 'phase')),
        durationMs: int(data['durationMs']),
        steps: int(data['steps']),
      };
    case 'status':
      return {
        kind: 'status',
        seq,
        at,
        agent: text(data, 'agent'),
        model: text(data, 'model'),
        exitCode: int(data['exitCode']),
      };
    case 'error':
      return { kind: 'error', seq, at, code: text(data, 'code'), message: text(data, 'message') };
    case 'input':
      return {
        kind: 'input',
        seq,
        at,
        inputId: text(data, 'inputId'),
        status: text(data, 'status'),
        reason: text(data, 'reason'),
        requestId: text(data, 'requestId'),
      };
    case 'permission.request':
      return permissionRequest(seq, at, data);
    case 'permission.expired':
      return { kind: 'permissionExpired', seq, at, requestId: text(data, 'requestId') };
    case 'tasks':
      return {
        kind: 'tasks',
        seq,
        at,
        tasks: tasksOf(data['tasks']),
        stoppable: bool(data['stoppable']) === true,
        scheduled: Math.max(0, int(data['scheduled']) ?? 0),
      };
    case 'transfer':
      return {
        kind: 'transferred',
        seq,
        at,
        fromMemberId: text(data, 'fromMemberId'),
        toMemberId: text(data, 'toMemberId'),
      };
    default:
      return { kind: 'unknown', seq, at, type };
  }
}

export function pageOf(page: CloudEventPage): TranscriptPage {
  return { events: page.events.map(eventOf), nextBefore: page.nextBefore, lastSeq: page.lastSeq ?? 0 };
}

const AGENT_STATES = ['running', 'completed', 'failed'] as const;

export function knownAgentOf(agent: CloudSubagent): KnownAgent {
  const ended = agent.endedAt === undefined ? undefined : Date.parse(agent.endedAt);
  return {
    id: agent.id,
    type: filled(agent.type),
    description: agent.description ?? '',
    state: AGENT_STATES.find((state) => state === agent.state) ?? 'unknown',
    startedAt: Date.parse(agent.startedAt),
    endedAt: ended,
    steps: agent.steps ?? 0,
    parentId: agent.parentId,
    taskId: agent.taskId,
  };
}

/** The parent of an event: the subagent it belongs to, undefined for the main agent's own. */
export function parentOf(event: TranscriptEvent): string | undefined {
  switch (event.kind) {
    case 'toolCall':
    case 'toolResult':
    case 'agent':
    case 'delta':
      return event.parentToolUseId;
    case 'user':
    case 'turn':
    case 'status':
    case 'error':
    case 'input':
    case 'permission':
    case 'permissionExpired':
    case 'transferred':
    case 'tasks':
    case 'truncated':
    case 'unknown':
      return undefined;
  }
}
