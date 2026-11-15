// SPDX-License-Identifier: Apache-2.0
import { finished, type TranscriptEvent } from './events';

type Of<K extends TranscriptEvent['kind']> = Extract<TranscriptEvent, { kind: K }>;

/** A tool use and its result, paired by id; `call` is undefined when the call is in a page not loaded yet. */
export interface ToolItem {
  readonly kind: 'tool';
  readonly call: Of<'toolCall'> | undefined;
  readonly result: Of<'toolResult'> | undefined;
}

/**
 * What the transcript list shows, built from the events (TeamCode's companion `TranscriptItem`):
 * - `tools`: consecutive tool uses with no text between them, shown folded as "N actions";
 * - `subagent`: a subagent's call (`Agent`, `Task` before Claude Code renamed it) and its result, a card that opens
 *   the subagent's own thread;
 * - `turnEnd`: the end of a turn, its duration and steps;
 * - `system`: a centered line (agent started, error, rejected message, permission request, transfer).
 */
export type TranscriptItem =
  | { readonly kind: 'user'; readonly event: Of<'user'> }
  | { readonly kind: 'agent'; readonly event: Of<'agent'> }
  | ToolItem
  | { readonly kind: 'tools'; readonly tools: readonly ToolItem[] }
  | {
      readonly kind: 'subagent';
      readonly call: Of<'toolCall'>;
      readonly result: Of<'toolResult'> | undefined;
    }
  | { readonly kind: 'turnEnd'; readonly event: Of<'turn'> }
  | { readonly kind: 'system'; readonly event: SystemEvent };

/** The events shown as a centered line. */
export type SystemEvent = Of<
  'status' | 'error' | 'input' | 'permission' | 'permissionExpired' | 'transferred' | 'truncated'
>;

/** The tools that start a subagent: `Agent`, and `Task`, its name before Claude Code renamed it. */
export const AGENT_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);

function toolKey(tool: ToolItem): number {
  return tool.call?.seq ?? tool.result?.seq ?? 0;
}

/** Stable across merges: a sequence number. */
export function keyOf(item: TranscriptItem): number {
  switch (item.kind) {
    case 'tool':
      return toolKey(item);
    case 'tools':
      return Math.min(...item.tools.map(toolKey));
    case 'subagent':
      return item.call.seq;
    case 'user':
    case 'agent':
    case 'turnEnd':
    case 'system':
      return item.event.seq;
  }
}

function toolNested(tool: ToolItem): boolean {
  return (tool.call?.parentToolUseId ?? tool.result?.parentToolUseId) !== undefined;
}

/** Nested under a subagent's tool call. */
export function nestedOf(item: TranscriptItem): boolean {
  switch (item.kind) {
    case 'agent':
      return item.event.parentToolUseId !== undefined;
    case 'tool':
      return toolNested(item);
    case 'tools':
      return item.tools.some(toolNested);
    case 'subagent':
      return item.call.parentToolUseId !== undefined;
    case 'user':
    case 'turnEnd':
    case 'system':
      return false;
  }
}

function toolSeqs(tool: ToolItem): number[] {
  return [tool.call?.seq, tool.result?.seq].filter((seq) => seq !== undefined);
}

/** The sequence numbers of the events an item shows, oldest first. */
export function seqsOf(item: TranscriptItem): number[] {
  switch (item.kind) {
    case 'tool':
      return toolSeqs(item);
    case 'tools':
      return item.tools.flatMap(toolSeqs);
    case 'subagent':
      return [item.call.seq, item.result?.seq].filter((seq) => seq !== undefined);
    case 'user':
    case 'agent':
    case 'turnEnd':
    case 'system':
      return [item.event.seq];
  }
}

/**
 * The index of the item that shows the event `seq`, or -1 when none does: an item's key can change when older events
 * arrive, but the event a member was reading never does.
 */
export function indexOfEvent(items: readonly TranscriptItem[], seq: number): number {
  return items.findIndex((item) => seqsOf(item).includes(seq));
}

function itemOf(
  event: TranscriptEvent,
  results: ReadonlyMap<string, Of<'toolResult'>>,
  calls: ReadonlySet<string>,
): TranscriptItem | undefined {
  switch (event.kind) {
    case 'toolCall':
      if (AGENT_TOOLS.has(event.name) && event.id !== '')
        return { kind: 'subagent', call: event, result: results.get(event.id) };
      return { kind: 'tool', call: event, result: event.id === '' ? undefined : results.get(event.id) };
    case 'toolResult':
      // Shown with its call; alone only when the call is not loaded.
      return event.id !== '' && calls.has(event.id)
        ? undefined
        : { kind: 'tool', call: undefined, result: event };
    case 'user':
      return { kind: 'user', event };
    case 'agent':
      return event.text.trim() === '' ? undefined : { kind: 'agent', event };
    case 'turn':
      return finished(event.phase) ? { kind: 'turnEnd', event } : undefined;
    case 'input':
      // A consumed permission answer closes its request: said, so the card's going away is explained.
      return event.status === 'rejected' ||
        event.status === 'cancelled' ||
        (event.status === 'consumed' && event.requestId !== undefined)
        ? { kind: 'system', event }
        : undefined;
    case 'unknown':
    case 'tasks':
    case 'delta':
      return undefined;
    case 'status':
    case 'error':
    case 'permission':
    case 'permissionExpired':
    case 'transferred':
    case 'truncated':
      return { kind: 'system', event };
  }
}

/**
 * Builds the list: tool results join their call, runs of tool uses at the same level fold together, turn starts,
 * live text and unknown types are left out (the running indicator shows a turn in progress), and plain status changes
 * of inputs that were consumed are skipped (the message itself shows).
 */
export function transcriptItems(events: readonly TranscriptEvent[]): TranscriptItem[] {
  const results = new Map<string, Of<'toolResult'>>();
  const calls = new Set<string>();
  for (const event of events) {
    if (event.kind === 'toolResult') results.set(event.id, event);
    if (event.kind === 'toolCall') calls.add(event.id);
  }
  const items: TranscriptItem[] = [];
  let run: ToolItem[] = [];
  const flush = (): void => {
    const [single] = run;
    if (single !== undefined) items.push(run.length === 1 ? single : { kind: 'tools', tools: run });
    run = [];
  };
  for (const event of events) {
    const item = itemOf(event, results, calls);
    if (item === undefined) continue;
    if (item.kind === 'tool') {
      const last = run.at(-1);
      if (last !== undefined && toolNested(last) !== toolNested(item)) flush();
      run.push(item);
    } else {
      flush();
      items.push(item);
    }
  }
  flush();
  return items;
}

/**
 * The text the agent is writing in `thread` (`runners.cloud.transcript.live.v1`): the deltas of each block that no
 * final `message.agent` replaced yet, joined in order; undefined when nothing is being written, or once the turn ended
 * (an interrupted block is never finished, its text was never final).
 */
export function liveTextOf(
  events: readonly TranscriptEvent[],
  thread: string | undefined,
): string | undefined {
  const blocks = new Map<string, string>();
  for (const event of events) {
    if (event.kind === 'turn' && finished(event.phase)) blocks.clear();
    if (event.kind === 'delta' && event.parentToolUseId === thread) {
      const key = `${event.messageId}\u0000${String(event.index)}`;
      blocks.set(key, (blocks.get(key) ?? '') + event.text);
    }
    if (event.kind === 'agent' && event.messageId !== undefined) {
      const prefix = `${event.messageId}\u0000`;
      const index = event.index;
      if (index === undefined) {
        for (const key of [...blocks.keys()]) if (key.startsWith(prefix)) blocks.delete(key);
      } else blocks.delete(`${prefix}${String(index)}`);
    }
  }
  const textNow = [...blocks.values()].join('\n\n');
  return textNow.trim() === '' ? undefined : textNow;
}
