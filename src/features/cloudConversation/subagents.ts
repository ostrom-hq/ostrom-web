// SPDX-License-Identifier: Apache-2.0
import {
  type BackgroundTask,
  finished,
  isSubagentTask,
  type KnownAgent,
  parentOf,
  type TranscriptEvent,
} from './events';
import { AGENT_TOOLS } from './items';

type ToolCall = Extract<TranscriptEvent, { kind: 'toolCall' }>;
type ToolResult = Extract<TranscriptEvent, { kind: 'toolResult' }>;

/**
 * - `stopped`: no result and its turn ended: interrupted, or its agent stopped;
 * - `background`: launched in the background, and the runner reports no tasks: whether it still runs is unknown.
 */
export type SubagentState = 'running' | 'done' | 'failed' | 'stopped' | 'background';

/**
 * One subagent, read from the transcript (TeamCode's companion `Subagent`): `id` is its `Agent` call's id, which every
 * event it produced carries as its parent; `type` its subagent type (`general-purpose` when none was named); `depth` 0
 * for one the main agent started, 1 for a subagent's own, and so on; `steps` its own tool uses; `taskId` its background
 * task, to stop it; `waiting`: running, with every tool use still open a wait (parked rather than working).
 */
export interface Subagent {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly state: SubagentState;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly depth: number;
  readonly parentId: string | undefined;
  readonly steps: number;
  readonly taskId: string | undefined;
  readonly waiting: boolean;
}

export function activeOf(subagent: Subagent): boolean {
  return subagent.state === 'running' || subagent.state === 'background';
}

/** The runner's latest report for a running session: its live tasks, whether it can stop one, its scheduled wake-ups. */
export interface LiveTasks {
  readonly tasks: readonly BackgroundTask[];
  readonly stoppable: boolean;
  readonly scheduled: number;
}

/**
 * A background command, or a monitor (`monitor`: started by the Monitor tool, or a command that only waits), with the
 * command its call ran when loaded.
 */
export interface BackgroundCommand {
  readonly task: BackgroundTask;
  readonly command: string | undefined;
  readonly monitor: boolean;
}

const DEFAULT_TYPE = 'general-purpose';
const MAX_DEPTH = 16;

/**
 * A command that only waits: `sleep N` alone, an `until`/`while` loop whose body starts with `sleep`, `watch`,
 * `gh run watch`, `gh pr checks --watch`. `kubectl wait`, `sleep 2 && ./gradlew build` or `while read f; do …` are work.
 */
const WATCHER =
  /^\s*(sleep\s+[\d.]+[smh]?\s*$|(until|while)\b[^;]*;\s*do\s+sleep\b|watch\b|gh run watch\b|gh pr checks\b.*--watch)/;

function field(call: ToolCall, key: string): unknown {
  return call.fields?.[key];
}

function textField(call: ToolCall, key: string): string | undefined {
  const value = field(call, key);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** A tool use that only waits: the Monitor tool, or a Bash command matching `WATCHER`. */
export function watches(call: ToolCall): boolean {
  if (call.name === 'Monitor') return true;
  const command = field(call, 'command');
  return call.name === 'Bash' && typeof command === 'string' && WATCHER.test(command);
}

function timeOf(at: string): number {
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function depthOf(
  parent: string | undefined,
  parents: ReadonlyMap<string, string | undefined>,
  known: (id: string) => boolean,
): number {
  let depth = 0;
  let current = parent;
  while (current !== undefined && known(current) && depth < MAX_DEPTH) {
    depth += 1;
    current = parents.get(current);
  }
  return depth;
}

function subagentsRead(
  events: readonly TranscriptEvent[],
  running: boolean,
  tasks: readonly BackgroundTask[] | undefined,
  now: number,
): Subagent[] {
  const calls = events.filter(
    (event): event is ToolCall => event.kind === 'toolCall' && AGENT_TOOLS.has(event.name) && event.id !== '',
  );
  if (calls.length === 0) return [];
  const ids = new Set(calls.map((call) => call.id));
  const results = new Map<string, ToolResult>();
  const answered = new Set<string>();
  const open = new Map<string, ToolCall[]>();
  // Where each subagent's own events end, and how many tool uses it made.
  const last = new Map<string, number>();
  const steps = new Map<string, number>();
  for (const event of events) if (event.kind === 'toolResult') answered.add(event.id);
  for (const event of events) {
    if (event.kind === 'toolResult' && ids.has(event.id)) results.set(event.id, event);
    if (event.kind === 'toolCall' && event.parentToolUseId !== undefined && !answered.has(event.id))
      open.set(event.parentToolUseId, [...(open.get(event.parentToolUseId) ?? []), event]);
    const parent =
      event.kind === 'toolCall' || event.kind === 'toolResult' || event.kind === 'agent'
        ? event.parentToolUseId
        : undefined;
    if (parent === undefined) continue;
    if (event.kind === 'toolCall') steps.set(parent, (steps.get(parent) ?? 0) + 1);
    last.set(parent, timeOf(event.at));
  }
  const parents = new Map(calls.map((call) => [call.id, call.parentToolUseId]));
  const turnEnds = events.flatMap((event) =>
    event.kind === 'turn' && finished(event.phase) ? [event.seq] : [],
  );
  return calls.map((call) => {
    const background = field(call, 'run_in_background') === true;
    const result = results.get(call.id);
    const task = tasks?.find((item) => isSubagentTask(item) && item.toolUseId === call.id);
    const at = timeOf(call.at);
    const state: SubagentState =
      task !== undefined
        ? 'running'
        : result?.isError === true
          ? 'failed'
          : result !== undefined && background
            ? tasks !== undefined || !running
              ? 'done'
              : 'background'
            : result !== undefined
              ? 'done'
              : turnEnds.some((seq) => seq > call.seq) || !running
                ? 'stopped'
                : 'running';
    const start = task?.startedAt === undefined ? at : Math.min(task.startedAt, at);
    const resultAt = result === undefined ? undefined : timeOf(result.at);
    const end =
      state === 'running' || state === 'background'
        ? now
        : // A background subagent's result only said it was launched: it ended with its last own event.
          background
          ? Math.max(resultAt ?? at, last.get(call.id) ?? at)
          : (resultAt ?? last.get(call.id) ?? at);
    const openCalls = open.get(call.id) ?? [];
    return {
      id: call.id,
      type: textField(call, 'subagent_type') ?? DEFAULT_TYPE,
      description: textField(call, 'description') ?? call.summary ?? '',
      state,
      startedAt: start,
      durationMs: Math.max(end - start, 0),
      depth: depthOf(call.parentToolUseId, parents, (id) => ids.has(id)),
      parentId: call.parentToolUseId,
      steps: steps.get(call.id) ?? 0,
      taskId: task?.id,
      waiting: state === 'running' && openCalls.length > 0 && openCalls.every(watches),
    };
  });
}

function settled(subagent: Subagent): boolean {
  return subagent.state === 'done' || subagent.state === 'failed';
}

/**
 * The subagents the loaded events show, completed by the server's own list (`known`, `runners.cloud.transcript.feeds.v1`):
 * a subagent whose call is older than the loaded page is still listed, and one that is listed gets its real start, state
 * and step count, which the loaded events alone understate. What the events say about a running one wins while it runs
 * (they are newer than the list); a finished one, per the server, is finished.
 */
function withKnown(
  read: readonly Subagent[],
  known: readonly KnownAgent[],
  running: boolean,
  tasks: readonly BackgroundTask[] | undefined,
  now: number,
): Subagent[] {
  const info = new Map(known.map((agent) => [agent.id, agent]));
  const merged = read.map((agent): Subagent => {
    const server = info.get(agent.id);
    if (server === undefined) return agent;
    const state: SubagentState =
      agent.state === 'running' && agent.taskId !== undefined
        ? agent.state
        : server.state === 'completed' && !settled(agent)
          ? 'done'
          : server.state === 'failed' && !settled(agent)
            ? 'failed'
            : agent.state;
    const start = Math.min(agent.startedAt, server.startedAt);
    const active = state === 'running' || state === 'background';
    const end = active ? now : (server.endedAt ?? agent.startedAt + agent.durationMs);
    return {
      ...agent,
      state,
      startedAt: start,
      durationMs: Math.max(end - start, 0),
      steps: Math.max(agent.steps, server.steps),
      taskId: agent.taskId ?? server.taskId,
    };
  });
  const shown = new Set(read.map((agent) => agent.id));
  const extra = known.filter((agent) => !shown.has(agent.id));
  if (extra.length === 0) return merged;
  const parents = new Map<string, string | undefined>([
    ...read.map((agent): [string, string | undefined] => [agent.id, agent.parentId]),
    ...known.map((agent): [string, string | undefined] => [agent.id, agent.parentId]),
  ]);
  const live = new Set(
    (tasks ?? []).flatMap((task) =>
      isSubagentTask(task) && task.toolUseId !== undefined ? [task.toolUseId] : [],
    ),
  );
  const added = extra.map((agent): Subagent => {
    const state: SubagentState = live.has(agent.id)
      ? 'running'
      : agent.state === 'completed'
        ? 'done'
        : agent.state === 'failed'
          ? 'failed'
          : agent.state === 'running' && running
            ? 'running'
            : 'stopped';
    const end = state === 'running' ? now : (agent.endedAt ?? agent.startedAt);
    return {
      id: agent.id,
      type: agent.type ?? DEFAULT_TYPE,
      description: agent.description,
      state,
      startedAt: agent.startedAt,
      durationMs: Math.max(end - agent.startedAt, 0),
      depth: depthOf(agent.parentId, parents, () => true),
      parentId: agent.parentId,
      steps: agent.steps,
      taskId: agent.taskId,
      waiting: false,
    };
  });
  return [...merged, ...added].toSorted((a, b) => a.startedAt - b.startedAt);
}

/**
 * Every subagent the loaded events show, in the order they started (TeamCode's `subagentsOf`). `running`: the session's
 * agent runs; `tasks`: the runner's live tasks, undefined when it reports none (an older runner or server); `now` the
 * clock (epoch ms); `known` the server's list of subagents.
 */
export function subagentsOf(
  events: readonly TranscriptEvent[],
  running: boolean,
  tasks: readonly BackgroundTask[] | undefined,
  now: number,
  known: readonly KnownAgent[] = [],
): Subagent[] {
  const read = subagentsRead(events, running, tasks, now);
  return known.length === 0 ? read : withKnown(read, known, running, tasks, now);
}

/**
 * The events of one thread: the main agent's (`thread` undefined: no parent), or the subagent `thread`'s own, shown at
 * the top level of its thread. A subagent's own subagents show there as cards, their steps in their own thread.
 */
export function threadEvents(
  events: readonly TranscriptEvent[],
  thread: string | undefined,
): TranscriptEvent[] {
  if (thread === undefined) return events.filter((event) => parentOf(event) === undefined);
  return events.flatMap((event): TranscriptEvent[] => {
    if (
      (event.kind === 'toolCall' ||
        event.kind === 'toolResult' ||
        event.kind === 'agent' ||
        event.kind === 'delta') &&
      event.parentToolUseId === thread
    )
      return [{ ...event, parentToolUseId: undefined }];
    // The other kinds have no parent: they are the main agent's.
    return [];
  });
}

/** The runner's latest task report, undefined when the loaded events hold none; nothing runs in a session that is not `running`. */
export function liveTasks(events: readonly TranscriptEvent[], running: boolean): LiveTasks | undefined {
  const report = events.findLast((event) => event.kind === 'tasks');
  if (report?.kind !== 'tasks') return undefined;
  return running
    ? { tasks: report.tasks, stoppable: report.stoppable, scheduled: report.scheduled }
    : { tasks: [], stoppable: report.stoppable, scheduled: 0 };
}

/** The background commands and monitors among `tasks` (subagents are listed as subagents), with the command each call ran. */
export function backgroundCommands(
  tasks: readonly BackgroundTask[],
  events: readonly TranscriptEvent[],
): BackgroundCommand[] {
  const wanted = new Set(tasks.flatMap((task) => (task.toolUseId === undefined ? [] : [task.toolUseId])));
  const calls = new Map<string, ToolCall>();
  if (wanted.size > 0)
    for (const event of events)
      if (event.kind === 'toolCall' && wanted.has(event.id)) calls.set(event.id, event);
  return tasks
    .filter((task) => !isSubagentTask(task))
    .map((task) => {
      const call = task.toolUseId === undefined ? undefined : calls.get(task.toolUseId);
      return { task, command: call?.summary, monitor: call !== undefined && watches(call) };
    });
}

/** Everything the panel lists, derived from the transcript (TeamCode's `RunningWork`). */
export interface RunningWork {
  readonly subagents: readonly Subagent[];
  readonly live: LiveTasks | undefined;
  readonly commands: readonly BackgroundCommand[];
}

export function hasContent(work: RunningWork): boolean {
  return work.subagents.length > 0 || work.commands.length > 0 || (work.live?.scheduled ?? 0) > 0;
}

/** What runs now: active subagents, background commands and monitors, scheduled wake-ups. */
export function runningCount(work: RunningWork): number {
  return work.subagents.filter(activeOf).length + work.commands.length + (work.live?.scheduled ?? 0);
}
