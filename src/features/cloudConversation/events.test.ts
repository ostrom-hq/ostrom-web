// SPDX-License-Identifier: Apache-2.0
import type { CloudEvent } from '@gen/api/types.gen';
import { eventOf, finished, isSubagentTask, knownAgentOf, pageOf, parentOf, toolSummary } from './events';
import { EMPTY_TRANSCRIPT, withFeed, withLatest, withLive, withOlder } from './transcript';

const AT = '2026-11-15T10:00:00.000Z';

function cloud(seq: number, type: string, data: unknown, feed?: string): CloudEvent {
  return { seq, type, at: AT, epoch: 1, data, ...(feed === undefined ? {} : { feed }) };
}

describe('the mapping of a transcript event (TeamCode CloudMapping)', () => {
  it('reads every known type, with missing fields left out', () => {
    expect(eventOf(cloud(1, 'message.user', { text: 'Go', inputId: 'i1', authorId: 'm1' }))).toMatchObject({
      kind: 'user',
      text: 'Go',
      inputId: 'i1',
      authorId: 'm1',
    });
    expect(eventOf(cloud(1, 'message.user', 'not an object'))).toMatchObject({ kind: 'user', text: '' });
    expect(eventOf(cloud(2, 'message.agent', {}))).toMatchObject({ kind: 'agent', text: '' });
    expect(
      eventOf(cloud(3, 'tool.call', { id: 'a', name: 'Bash', input: { command: 'ls -la' } })),
    ).toMatchObject({
      kind: 'toolCall',
      id: 'a',
      name: 'Bash',
      input: '{\n  "command": "ls -la"\n}',
      summary: 'ls -la',
      fields: { command: 'ls -la' },
    });
    expect(eventOf(cloud(3, 'tool.call', {}))).toMatchObject({
      id: '',
      name: 'tool',
      input: '',
      summary: undefined,
      fields: undefined,
    });
    expect(
      eventOf(cloud(4, 'tool.result', { id: 'a', output: 'ok', isError: true, exitCode: 2 })),
    ).toMatchObject({
      kind: 'toolResult',
      output: 'ok',
      isError: true,
      exitCode: 2,
    });
    expect(eventOf(cloud(4, 'tool.result', { output: [1] }))).toMatchObject({
      id: '',
      output: '[\n  1\n]',
      isError: false,
      exitCode: undefined,
    });
    expect(eventOf(cloud(5, 'turn', { phase: 'completed', durationMs: 1200, steps: 3 }))).toMatchObject({
      kind: 'turn',
      phase: 'completed',
      durationMs: 1200,
      steps: 3,
    });
    expect(eventOf(cloud(5, 'turn', { phase: 'later', steps: '3' }))).toMatchObject({
      phase: 'unknown',
      steps: undefined,
    });
    expect(eventOf(cloud(6, 'status', { agent: 'claude', model: 'opus', exitCode: 0 }))).toMatchObject({
      kind: 'status',
      exitCode: 0,
    });
    expect(eventOf(cloud(7, 'error', { code: 'boom', message: 'Boom' }))).toMatchObject({
      kind: 'error',
      code: 'boom',
    });
    expect(
      eventOf(cloud(8, 'input', { inputId: 'i', status: 'rejected', reason: 'x', requestId: 'r' })),
    ).toMatchObject({
      kind: 'input',
      requestId: 'r',
    });
    expect(eventOf(cloud(9, 'permission.expired', { requestId: 'r' }))).toMatchObject({
      kind: 'permissionExpired',
      requestId: 'r',
    });
    expect(eventOf(cloud(10, 'transfer', { fromMemberId: 'a', toMemberId: 'b' }))).toMatchObject({
      kind: 'transferred',
      fromMemberId: 'a',
    });
    expect(eventOf(cloud(11, 'something.new', {}))).toEqual({
      kind: 'unknown',
      seq: 11,
      at: AT,
      type: 'something.new',
    });
    // A delta without its block is not live text.
    expect(eventOf(cloud(12, 'message.agent.delta', { text: 'x' }))).toMatchObject({ kind: 'unknown' });
    expect(eventOf(cloud(12, 'message.agent.delta', { messageId: 'm' }))).toMatchObject({ kind: 'unknown' });
    expect(eventOf(cloud(13, 'message.agent.delta', { messageId: 'm', index: 0 }))).toMatchObject({
      kind: 'delta',
      text: '',
    });
  });

  it('reads the marker of an event the server cut', () => {
    expect(eventOf(cloud(1, 'tool.result', { truncated: true, originalBytes: 70_000 }))).toEqual({
      kind: 'truncated',
      seq: 1,
      at: AT,
      type: 'tool.result',
      originalBytes: 70_000,
    });
    expect(eventOf(cloud(1, 'tool.result', { truncated: true }))).toMatchObject({ kind: 'toolResult' });
  });

  it('names the subagent an event belongs to by its parent, else by the server’s feed', () => {
    expect(parentOf(eventOf(cloud(1, 'message.agent', { parentToolUseId: 'w1' }, 'w2')))).toBe('w1');
    expect(parentOf(eventOf(cloud(1, 'tool.call', {}, 'w2')))).toBe('w2');
    expect(parentOf(eventOf(cloud(1, 'turn', {}, 'w2')))).toBeUndefined();
    expect(parentOf(eventOf(cloud(1, 'message.user', {}, 'w2')))).toBeUndefined();
  });

  it('lists the live background tasks (aTasksEventListsTheLiveBackgroundTasks)', () => {
    const event = eventOf(
      cloud(7, 'tasks', {
        tasks: [
          { id: 'b1', type: 'local_bash', description: 'npm test', toolUseId: 'toolu_9', startedAt: 5_000 },
          { id: 'a1', type: 'local_agent', description: 'Review', subagentType: 'Explore' },
          { description: 'no id: left out' },
          { id: 'c1' },
          'not a task',
        ],
        stoppable: true,
        scheduled: 2,
      }),
    );
    if (event.kind !== 'tasks') throw new Error('not tasks');
    expect(event.stoppable).toBe(true);
    expect(event.scheduled).toBe(2);
    expect(event.tasks).toEqual([
      {
        id: 'b1',
        type: 'local_bash',
        description: 'npm test',
        subagentType: undefined,
        toolUseId: 'toolu_9',
        startedAt: 5_000,
      },
      {
        id: 'a1',
        type: 'local_agent',
        description: 'Review',
        subagentType: 'Explore',
        toolUseId: undefined,
        startedAt: undefined,
      },
      {
        id: 'c1',
        type: 'task',
        description: '',
        subagentType: undefined,
        toolUseId: undefined,
        startedAt: undefined,
      },
    ]);
    expect(event.tasks.map(isSubagentTask)).toEqual([false, true, false]);
    expect(eventOf(cloud(8, 'tasks', { scheduled: -3 }))).toMatchObject({
      stoppable: false,
      scheduled: 0,
      tasks: [],
    });
  });

  it('reads a permission request and its questions by their index', () => {
    const request = eventOf(
      cloud(1, 'permission.request', {
        requestId: 'r1',
        toolName: 'AskUserQuestion',
        question: true,
        description: '  ',
        input: {
          questions: [
            {
              question: 'Which?',
              header: 'Pick',
              multiSelect: true,
              options: [{ label: 'A', description: 'first' }, {}, 'x'],
            },
            'unreadable',
            { header: 'no text' },
            { question: 'Which?' },
            { question: 'Why?', header: ' ' },
          ],
        },
      }),
    );
    expect(request).toMatchObject({
      kind: 'permission',
      requestId: 'r1',
      question: true,
      inputLeftOut: false,
      description: undefined,
      questions: [
        {
          index: 0,
          text: 'Which?',
          header: 'Pick',
          multiSelect: true,
          options: [
            { label: 'A', description: 'first' },
            { label: '', description: undefined },
            { label: '', description: undefined },
          ],
        },
        { index: 4, text: 'Why?', header: undefined, options: [], multiSelect: false },
      ],
    });
    expect(
      eventOf(
        cloud(2, 'permission.request', {
          toolName: 'Bash',
          input: 'big',
          inputPreview: 'rm -rf',
          description: 'Delete',
        }),
      ),
    ).toMatchObject({
      question: false,
      questions: [],
      input: undefined,
      inputLeftOut: true,
      inputPreview: 'rm -rf',
      description: 'Delete',
    });
    expect(
      eventOf(
        cloud(3, 'permission.request', { question: true, inputTruncated: true, input: { command: 'ls' } }),
      ),
    ).toMatchObject({
      questions: [],
      inputLeftOut: true,
    });
    expect(eventOf(cloud(4, 'permission.request', { question: true }))).toMatchObject({ questions: [] });
  });

  it('sums up a tool use on one line', () => {
    expect(toolSummary(undefined)).toBeUndefined();
    expect(toolSummary({ command: ' ', path: 'src/a.ts' })).toBe('src/a.ts');
    expect(toolSummary({ prompt: 'line one\nline two' })).toBe('line one…');
    expect(toolSummary({ url: 'x'.repeat(200) })).toBe(`${'x'.repeat(160)}…`);
    expect(toolSummary({ other: 'x' })).toBeUndefined();
    expect(toolSummary({ command: '  a  ' })).toBe('a');
  });

  it('reads a page and a subagent the server tracks', () => {
    expect(pageOf({ events: [cloud(1, 'turn', {})], nextBefore: 1, lastSeq: 9 })).toMatchObject({
      nextBefore: 1,
      lastSeq: 9,
    });
    expect(pageOf({ events: [] })).toEqual({ events: [], nextBefore: undefined, lastSeq: 0 });
    expect(
      knownAgentOf({
        id: 'w',
        state: 'completed',
        startedAt: AT,
        endedAt: AT,
        type: ' ',
        steps: 3,
        parentId: 'p',
        taskId: 't',
      }),
    ).toEqual({
      id: 'w',
      type: undefined,
      description: '',
      state: 'completed',
      startedAt: Date.parse(AT),
      endedAt: Date.parse(AT),
      steps: 3,
      parentId: 'p',
      taskId: 't',
    });
    expect(knownAgentOf({ id: 'w', state: 'paused', startedAt: AT, description: 'd' })).toMatchObject({
      state: 'unknown',
      endedAt: undefined,
      steps: 0,
      description: 'd',
    });
    expect(finished('started')).toBe(false);
  });
});

describe('the merged transcript (TeamCode Transcript)', () => {
  const page = (seqs: number[], nextBefore: number | undefined, lastSeq = 90) => ({
    events: seqs.map((seq) => eventOf(cloud(seq, 'turn', {}))),
    nextBefore,
    lastSeq,
  });

  it('merges pages and live events by sequence, each once', () => {
    const latest = withLatest(EMPTY_TRANSCRIPT, page([40, 41], 40));
    expect(latest.newestSeq).toBe(90);
    expect(latest.nextBefore).toBe(40);
    const older = withOlder(latest, page([20, 40], undefined));
    expect(older.events.map((event) => event.seq)).toEqual([20, 40, 41]);
    expect(older.nextBefore).toBeUndefined();
    const live = withLive(older, eventOf(cloud(91, 'turn', {})));
    expect(live.newestSeq).toBe(91);
    expect(withLive(live, eventOf(cloud(91, 'error', {}))).events.at(-1)?.kind).toBe('turn');
    expect(withOlder(live, page([], 5))).toEqual({ ...live, nextBefore: 5 });
  });

  it('moves only its own cursor for a feed page (aFeedPageMovesOnlyItsOwnCursor)', () => {
    const main = withLatest(EMPTY_TRANSCRIPT, page([40], 40));
    const withWorker = withFeed(main, 'w1', page([70], 70));
    expect(withWorker.nextBefore).toBe(40);
    expect([...withWorker.feeds]).toEqual([['w1', 70]]);
    expect(main.newestSeq).toBe(90);
    expect(withWorker.newestSeq).toBe(90);
    const done = withFeed(withWorker, 'w1', page([50], undefined));
    expect([...done.feeds]).toEqual([['w1', undefined]]);
    expect(done.nextBefore).toBe(40);
  });
});
