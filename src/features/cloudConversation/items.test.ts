// SPDX-License-Identifier: Apache-2.0
import type { CloudEvent } from '@gen/api/types.gen';
import { eventOf, type TranscriptEvent, turnPhaseOf } from './events';
import { indexOfEvent, keyOf, liveTextOf, nestedOf, seqsOf, transcriptItems } from './items';

const AT = '2026-11-15T10:00:00.000Z';

function call(seq: number, id: string, parent?: string, name = 'Bash'): TranscriptEvent {
  return {
    kind: 'toolCall',
    seq,
    at: AT,
    id,
    name,
    input: '{}',
    summary: 'ls',
    parentToolUseId: parent,
    fields: {},
  };
}
function result(seq: number, id: string, parent?: string): TranscriptEvent {
  return {
    kind: 'toolResult',
    seq,
    at: AT,
    id,
    output: 'ok',
    isError: false,
    exitCode: undefined,
    parentToolUseId: parent,
  };
}
function turn(seq: number, phase: string): TranscriptEvent {
  return { kind: 'turn', seq, at: AT, phase: turnPhaseOf(phase), durationMs: undefined, steps: undefined };
}
function agent(seq: number, text: string, parent?: string): TranscriptEvent {
  return {
    kind: 'agent',
    seq,
    at: AT,
    text,
    parentToolUseId: parent,
    messageId: undefined,
    index: undefined,
  };
}
function cloud(seq: number, type: string, data: unknown): CloudEvent {
  return { seq, type, at: AT, epoch: 1, data };
}

describe('the transcript items (TeamCode TranscriptItemsTest)', () => {
  it('joins results to their calls and folds runs of tools', () => {
    const items = transcriptItems([
      turn(1, 'started'),
      { kind: 'user', seq: 2, at: AT, text: 'Go', inputId: 'i1', authorId: 'm1' },
      call(3, 'a'),
      result(4, 'a'),
      call(5, 'b'),
      result(6, 'b'),
      agent(7, 'Done.'),
      call(8, 'c'),
      { kind: 'turn', seq: 9, at: AT, phase: 'completed', durationMs: 2_000, steps: 3 },
      { kind: 'unknown', seq: 10, at: AT, type: 'something.new' },
      // A phase this version does not know does not end the turn.
      turn(11, 'paused'),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['user', 'tools', 'agent', 'tool', 'turnEnd']);
    const folded = items[1];
    if (folded?.kind !== 'tools') throw new Error('not folded');
    expect(folded.tools.map((tool) => tool.call?.id)).toEqual(['a', 'b']);
    expect(folded.tools.map((tool) => tool.result?.id)).toEqual(['a', 'b']);
    const running = items[3];
    // Still running: no result yet.
    expect(running?.kind === 'tool' ? running.result : 'x').toBeUndefined();
    expect(items.map(keyOf)).toEqual([2, 3, 7, 8, 9]);
    expect(seqsOf(folded)).toEqual([3, 4, 5, 6]);
    expect(nestedOf(items[0] ?? folded)).toBe(false);
    expect(nestedOf({ kind: 'tools', tools: [{ kind: 'tool', call: undefined, result: undefined }] })).toBe(
      false,
    );
    expect(keyOf({ kind: 'tool', call: undefined, result: undefined })).toBe(0);
    expect(indexOfEvent(items, 6)).toBe(1);
    expect(indexOfEvent(items, 11)).toBe(-1);
  });

  it('shows a result whose call is not loaded alone, and folds subagent steps apart', () => {
    const items = transcriptItems([
      result(1, 'old'),
      call(2, 'agent'),
      call(3, 'inner', 'agent'),
      result(4, 'inner', 'agent'),
      result(5, 'agent'),
    ]);
    expect(items).toHaveLength(2);
    const main = items[0];
    if (main?.kind !== 'tools') throw new Error('not folded');
    expect(main.tools[0]?.call).toBeUndefined();
    expect(main.tools[0]?.result?.id).toBe('old');
    expect(main.tools[1]?.call?.id).toBe('agent');
    expect(main.tools[1]?.result?.id).toBe('agent');
    expect(nestedOf(main)).toBe(false);
    const inner = items[1];
    expect(inner !== undefined && nestedOf(inner)).toBe(true);
    expect(
      nestedOf({
        kind: 'agent',
        event: {
          kind: 'agent',
          seq: 1,
          at: AT,
          text: 'x',
          parentToolUseId: 'w',
          messageId: undefined,
          index: undefined,
        },
      }),
    ).toBe(true);
    expect(inner?.kind === 'tool' && keyOf(inner)).toBe(3);
  });

  it('skips consumed inputs and blank text, and shows rejected inputs', () => {
    const items = transcriptItems([
      {
        kind: 'input',
        seq: 1,
        at: AT,
        inputId: 'i1',
        status: 'consumed',
        reason: undefined,
        requestId: undefined,
      },
      {
        kind: 'input',
        seq: 2,
        at: AT,
        inputId: 'i2',
        status: 'rejected',
        reason: 'delivery_failed',
        requestId: undefined,
      },
      agent(3, '  '),
      {
        kind: 'input',
        seq: 4,
        at: AT,
        inputId: 'i4',
        status: 'cancelled',
        reason: undefined,
        requestId: undefined,
      },
    ]);
    expect(items.map(keyOf)).toEqual([2, 4]);
    expect(items.map((item) => item.kind)).toEqual(['system', 'system']);
  });

  it('makes an Agent or Task call a subagent card, with its result, nested when a subagent started it', () => {
    const items = transcriptItems([
      call(1, 'w1', undefined, 'Agent'),
      call(2, 'w2', 'w1', 'Task'),
      result(3, 'w1'),
      call(4, '', undefined, 'Agent'),
      call(5, '', undefined, 'Read'),
      result(6, ''),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['subagent', 'subagent', 'tools']);
    const [first, second] = items;
    expect(first?.kind === 'subagent' ? first.result?.id : 'x').toBe('w1');
    expect(second !== undefined && nestedOf(second)).toBe(true);
    expect(first !== undefined && nestedOf(first)).toBe(false);
    expect(first === undefined ? [] : seqsOf(first)).toEqual([1, 3]);
    expect(second === undefined ? [] : seqsOf(second)).toEqual([2]);
    expect(second === undefined ? 0 : keyOf(second)).toBe(2);
    // A call without an id pairs with no result: each shows alone.
    const tools = items[2];
    expect(tools?.kind === 'tools' ? tools.tools.map((tool) => tool.result) : 'x').toEqual([
      undefined,
      undefined,
      expect.objectContaining({ seq: 6 }),
    ]);
  });

  it('shows the system lines and leaves the task reports to the panel', () => {
    const events = [
      cloud(1, 'status', { agent: 'claude' }),
      cloud(2, 'error', { code: 'x' }),
      cloud(3, 'permission.request', { requestId: 'r', toolName: 'Bash' }),
      cloud(4, 'permission.expired', { requestId: 'r' }),
      cloud(5, 'transfer', {}),
      cloud(6, 'message.agent', { truncated: true, originalBytes: 70_000 }),
      cloud(7, 'tasks', { tasks: [] }),
    ].map(eventOf);
    expect(transcriptItems(events).map((item) => [item.kind, keyOf(item)])).toEqual([
      ['system', 1],
      ['system', 2],
      ['system', 3],
      ['system', 4],
      ['system', 5],
      ['system', 6],
    ]);
  });
});

describe('the live text (CloudMappingLiveTextTest)', () => {
  it('leaves the deltas out of the items, and the final message shows', () => {
    const delta = eventOf(cloud(3, 'message.agent.delta', { messageId: 'msg_1', index: 0, text: 'Hal' }));
    expect(delta.kind).toBe('delta');
    const final = eventOf(cloud(4, 'message.agent', { text: 'Half done.', messageId: 'msg_1', index: 0 }));
    expect(final).toEqual({
      kind: 'agent',
      seq: 4,
      at: AT,
      text: 'Half done.',
      parentToolUseId: undefined,
      messageId: 'msg_1',
      index: 0,
    });
    expect(transcriptItems([delta, final]).map((item) => item.kind)).toEqual(['agent']);
    expect(liveTextOf([delta], undefined)).toBe('Hal');
    expect(liveTextOf([delta, final], undefined)).toBeUndefined();
  });

  it('joins the blocks being written in their thread, until a final message or the end of the turn', () => {
    const delta = (seq: number, messageId: string, index: number, text: string, parent?: string) =>
      eventOf(cloud(seq, 'message.agent.delta', { messageId, index, text, parentToolUseId: parent }));
    const events = [
      delta(1, 'm', 0, 'One'),
      delta(2, 'm', 0, ' two'),
      delta(3, 'm', 1, 'Three'),
      delta(4, 'w', 0, 'Worker', 'w1'),
    ];
    expect(liveTextOf(events, undefined)).toBe('One two\n\nThree');
    expect(liveTextOf(events, 'w1')).toBe('Worker');
    const whole = eventOf(cloud(5, 'message.agent', { text: 'One two Three', messageId: 'm' }));
    expect(liveTextOf([...events, whole], undefined)).toBeUndefined();
    const other = eventOf(cloud(5, 'message.agent', { text: 'Else', messageId: 'x' }));
    expect(liveTextOf([...events, other], undefined)).toBe('One two\n\nThree');
    expect(liveTextOf([...events, turn(6, 'interrupted')], 'w1')).toBeUndefined();
    expect(liveTextOf([delta(7, 'm', 0, '  ')], undefined)).toBeUndefined();
  });
});
