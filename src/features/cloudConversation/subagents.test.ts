// SPDX-License-Identifier: Apache-2.0
import { type BackgroundTask, eventOf, type KnownAgent, type TranscriptEvent } from './events';
import { durationOf, effortLevels, validModel } from './controls';
import { nestedOf, seqsOf, transcriptItems } from './items';
import {
  backgroundCommands,
  hasContent,
  liveTasks,
  runningCount,
  type Subagent,
  subagentsOf,
  threadEvents,
} from './subagents';

/** `seq` seconds after the epoch, as TeamCode's tests write `seq * 1_000`. */
function at(seq: number): string {
  return new Date(seq * 1_000).toISOString();
}

function cloud(seq: number, type: string, data: unknown, feed?: string): TranscriptEvent {
  return eventOf({ seq, type, at: at(seq), epoch: 1, data, ...(feed === undefined ? {} : { feed }) });
}

function agentCall(
  seq: number,
  id: string,
  options: {
    type?: string | null;
    description?: string;
    background?: boolean;
    parent?: string;
    name?: string;
  } = {},
): TranscriptEvent {
  const {
    type = 'Explore',
    description = 'Map the code',
    background = false,
    parent,
    name = 'Agent',
  } = options;
  return cloud(
    seq,
    'tool.call',
    {
      id,
      name,
      input: {
        description,
        prompt: 'Look around',
        ...(type === null ? {} : { subagent_type: type }),
        ...(background ? { run_in_background: true } : {}),
      },
    },
    parent,
  );
}
const call = (seq: number, id: string, parent?: string): TranscriptEvent =>
  cloud(seq, 'tool.call', { id, name: 'Bash', input: {} }, parent);
const result = (seq: number, id: string, parent?: string, error = false): TranscriptEvent =>
  cloud(seq, 'tool.result', { id, output: 'ok', isError: error }, parent);
const text = (seq: number, value: string, parent?: string): TranscriptEvent =>
  cloud(seq, 'message.agent', { text: value }, parent);
const turn = (seq: number, phase: string): TranscriptEvent => cloud(seq, 'turn', { phase });
function tasks(seq: number, list: BackgroundTask[], scheduled = 0): TranscriptEvent {
  return cloud(seq, 'tasks', {
    tasks: list.map((task) => ({ ...task })),
    stoppable: true,
    scheduled,
  });
}
function task(
  id: string,
  type: string,
  description: string,
  toolUseId: string | undefined,
  startedAt: number | undefined,
  subagentType?: string,
): BackgroundTask {
  return { id, type, description, subagentType, toolUseId, startedAt };
}

const events: TranscriptEvent[] = [
  turn(1, 'started'),
  cloud(2, 'message.user', { text: 'Review the repository', inputId: 'i1', authorId: 'm1' }),
  agentCall(3, 'a1'),
  call(4, 'c1', 'a1'),
  result(5, 'c1', 'a1'),
  text(6, 'Found three modules.', 'a1'),
  agentCall(7, 'a2', { type: null, description: 'Nested', parent: 'a1' }),
  call(8, 'c2', 'a2'),
  result(9, 'c2', 'a2'),
  result(10, 'a2', 'a1'),
  result(11, 'a1'),
  agentCall(12, 'a3', { type: 'reviewer', description: 'Check the tests' }),
  result(13, 'a3', undefined, true),
  agentCall(14, 'a4', { description: 'Still going', name: 'Task' }),
  text(15, 'Started two subagents.'),
];

function byId(list: readonly Subagent[], id: string): Subagent {
  const found = list.find((agent) => agent.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

describe('the subagents read from the transcript (TeamCode SubagentsTest)', () => {
  it('makes every Agent call a subagent with its type, state and duration', () => {
    const subagents = subagentsOf(events, true, undefined, 20_000);
    expect(subagents.map((agent) => agent.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    const [first, nested, failed, running] = subagents;
    expect(first).toMatchObject({
      type: 'Explore',
      description: 'Map the code',
      state: 'done',
      durationMs: 8_000,
    });
    expect(first?.depth).toBe(0);
    // A subagent's own subagent sits under it.
    expect(nested).toMatchObject({ depth: 1, parentId: 'a1', type: 'general-purpose' });
    expect(failed?.state).toBe('failed');
    // The older Task tool name counts too; no result yet while the turn runs: counted up to now.
    expect(running).toMatchObject({ state: 'running', durationMs: 6_000 });
    // Its own tool uses, its subagent's card included, not that subagent's steps.
    expect(first?.steps).toBe(2);
  });

  it('says a subagent without a result after its turn ended was stopped', () => {
    expect(
      byId(subagentsOf([...events, turn(16, 'interrupted')], false, undefined, 20_000), 'a4').state,
    ).toBe('stopped');
    expect(byId(subagentsOf(events, false, undefined, 20_000), 'a4').state).toBe('stopped');
  });

  it('keeps a background subagent running while its task is live', () => {
    const launched = [
      agentCall(1, 'b1', { background: true }),
      result(2, 'b1'),
      text(3, 'Working on it.', 'b1'),
    ];
    const live = task('t1', 'local_agent', 'Map the code', 'b1', 1_000, 'Explore');
    // Its result only said it was launched.
    expect(subagentsOf(launched, true, [live], 9_000)[0]).toMatchObject({ state: 'running', taskId: 't1' });
    // Gone from the live set: it ended, with its last own event.
    expect(subagentsOf(launched, true, [], 9_000)[0]).toMatchObject({ state: 'done', durationMs: 2_000 });
    // Without task reports, the console cannot tell.
    expect(subagentsOf(launched, true, undefined, 9_000)[0]?.state).toBe('background');
    expect(subagentsOf(launched, false, undefined, 9_000)[0]?.state).toBe('done');
    // A task started before its call was recorded starts with the task.
    expect(subagentsOf(launched, true, [{ ...live, startedAt: 500 }], 9_000)[0]?.startedAt).toBe(500);
    expect(subagentsOf(launched, true, [{ ...live, startedAt: undefined }], 9_000)[0]?.startedAt).toBe(1_000);
  });

  it('reads what a call leaves out: its time, its description, its result', () => {
    const odd = eventOf({
      seq: 1,
      type: 'tool.call',
      at: 'not a time',
      epoch: 1,
      data: { id: 'x', name: 'Agent' },
    });
    expect(subagentsOf([odd], true, undefined, 5_000)[0]).toMatchObject({
      startedAt: 0,
      description: '',
      durationMs: 5_000,
    });
    // A background subagent without its result, its turn over: it ended with its last own event.
    const background = [
      agentCall(1, 'b1', { background: true }),
      text(4, 'Half done.', 'b1'),
      turn(5, 'completed'),
    ];
    expect(subagentsOf(background, true, undefined, 9_000)[0]).toMatchObject({
      state: 'stopped',
      durationMs: 3_000,
    });
    expect(
      subagentsOf([agentCall(1, 'b2', { background: true })], false, undefined, 9_000)[0]?.durationMs,
    ).toBe(0);
    // A plain one without result nor own events ends where it started.
    expect(
      subagentsOf([agentCall(1, 'p1'), turn(2, 'completed')], true, undefined, 9_000)[0]?.durationMs,
    ).toBe(0);
  });

  it('parks a subagent whose open tool uses only wait', () => {
    const bash = (seq: number, id: string, command: string): TranscriptEvent =>
      cloud(seq, 'tool.call', { id, name: 'Bash', input: { command } }, 'w');
    const waiting = (...calls: TranscriptEvent[]): boolean | undefined =>
      subagentsOf([agentCall(1, 'w'), ...calls], true, undefined, 9_000)[0]?.waiting;
    // A wait is a Monitor, a lone sleep, a sleep loop, watch, gh … --watch.
    expect(waiting(bash(2, 'c1', 'until gh pr checks 1; do sleep 10; done'))).toBe(true);
    expect(waiting(cloud(2, 'tool.call', { id: 'c1', name: 'Monitor', input: {} }, 'w'))).toBe(true);
    expect(waiting(bash(2, 'c1', 'sleep 30'))).toBe(true);
    // Work after a sleep is work.
    expect(waiting(bash(2, 'c1', 'sleep 2 && ./gradlew build'))).toBe(false);
    expect(waiting(bash(2, 'c1', 'kubectl wait --for=condition=ready pod/x'))).toBe(false);
    // A build beside the wait is work.
    expect(waiting(bash(2, 'c1', 'sleep 30'), bash(3, 'c2', './gradlew build'))).toBe(false);
    expect(waiting(cloud(2, 'tool.call', { id: 'c1', name: 'Bash', input: {} }, 'w'))).toBe(false);
    // Thinking, no tool open: working; an answered wait is not open.
    expect(waiting()).toBe(false);
    expect(waiting(bash(2, 'c1', 'sleep 30'), result(3, 'c1', 'w'))).toBe(false);
  });

  it('keeps the agent card in the main thread and each subagent’s own events in its thread', () => {
    const main = threadEvents(events, undefined);
    expect(main.some((event) => event.kind === 'toolCall' && event.parentToolUseId !== undefined)).toBe(
      false,
    );
    const items = transcriptItems(main);
    expect(items.map((item) => item.kind)).toEqual(['user', 'subagent', 'subagent', 'subagent', 'agent']);
    const [, card] = items;
    expect(card?.kind === 'subagent' ? [card.call.id, card.result?.id] : []).toEqual(['a1', 'a1']);
    // The card shows its call and result: the reading anchor finds it.
    expect(card === undefined ? [] : seqsOf(card)).toEqual([3, 11]);
    const thread = threadEvents(events, 'a1');
    // Its own steps and its subagent's card, not its subagent's steps.
    expect(thread.map((event) => event.seq)).toEqual([4, 5, 6, 7, 10]);
    // Shown at the top level of its own thread.
    expect(transcriptItems(thread).some(nestedOf)).toBe(false);
    expect(
      threadEvents(
        [...events, cloud(16, 'message.agent.delta', { messageId: 'm', index: 0, text: 'x' }, 'a2')],
        'a2',
      ).map((event) => event.seq),
    ).toEqual([8, 9, 16]);
    expect(threadEvents(events, 'unknown')).toEqual([]);
  });

  it('lists the background commands of a running session from the latest task report', () => {
    const command = task('b1', 'local_bash', 'npm test', 'tool-9', 2_000);
    const agentTask = task('t1', 'local_agent', 'Review', 'a1', 2_000, 'Explore');
    const withTasks = [...events, tasks(16, [command, agentTask])];
    // No report yet: the runner does not report tasks.
    expect(liveTasks(events, true)).toBeUndefined();
    expect(liveTasks(withTasks, true)).toEqual({
      tasks: [command, agentTask],
      stoppable: true,
      scheduled: 0,
    });
    // A paused or ended session runs nothing.
    expect(liveTasks(withTasks, false)).toEqual({ tasks: [], stoppable: true, scheduled: 0 });
    // The last one ended.
    expect(liveTasks([...withTasks, tasks(17, [])], true)?.tasks).toEqual([]);
    // Subagents are listed as subagents.
    expect(backgroundCommands([command, agentTask], withTasks).map((item) => item.task.id)).toEqual(['b1']);
    expect(backgroundCommands([command], withTasks)[0]).toEqual({
      task: command,
      command: undefined,
      monitor: false,
    });
    const withCall = [
      ...withTasks,
      cloud(18, 'tool.call', { id: 'tool-9', name: 'Bash', input: { command: 'npm test -- --watch' } }),
    ];
    // The command its call ran, when loaded.
    expect(backgroundCommands([command], withCall)[0]).toMatchObject({
      command: 'npm test -- --watch',
      monitor: false,
    });
    // A monitor is a `local_bash` task too: its call (the Monitor tool) tells them apart.
    const monitor = task('m1', 'local_bash', 'Watch the deploy', 'tool-10', 3_000);
    const withMonitor = [
      ...withCall,
      cloud(19, 'tool.call', {
        id: 'tool-10',
        name: 'Monitor',
        input: { command: 'kubectl rollout status' },
      }),
      tasks(20, [command, monitor, agentTask], 2),
    ];
    const live = liveTasks(withMonitor, true);
    expect(backgroundCommands(live?.tasks ?? [], withMonitor).map((item) => item.monitor)).toEqual([
      false,
      true,
    ]);
    // Scheduled wake-ups: only their number is reported.
    expect(live?.scheduled).toBe(2);
    expect(
      backgroundCommands([task('x', 'local_bash', 'Loose', undefined, undefined)], withMonitor)[0]?.command,
    ).toBeUndefined();
  });

  it('counts what runs, and says when there is nothing to list', () => {
    const subagents = subagentsOf(events, true, undefined, 20_000);
    const live = { tasks: [], stoppable: false, scheduled: 1 };
    expect(runningCount({ subagents, live, commands: [] })).toBe(2);
    expect(hasContent({ subagents: [], live: undefined, commands: [] })).toBe(false);
    expect(hasContent({ subagents: [], live, commands: [] })).toBe(true);
    expect(runningCount({ subagents: [], live: undefined, commands: [] })).toBe(0);
  });
});

function known(id: string, options: Partial<Omit<KnownAgent, 'id'>> = {}): KnownAgent {
  return {
    id,
    type: 'reviewer',
    description: 'Check the tests',
    state: 'running',
    startedAt: 1_000,
    endedAt: undefined,
    steps: 3,
    parentId: undefined,
    taskId: undefined,
    ...options,
  };
}

describe('the server’s list completes the loaded events (TeamCode TranscriptFeedsTest)', () => {
  it('lists a subagent whose call was not loaded with its real start and state', () => {
    const shown = subagentsOf([text(90, 'Recent')], true, undefined, 100_000, [
      known('old', { state: 'completed', steps: 12, startedAt: 5_000, endedAt: 65_000 }),
      known('busy', { startedAt: 50_000, steps: 4 }),
      known('lost', { state: 'failed', startedAt: 20_000, endedAt: 21_000 }),
    ]);
    // In the order they started.
    expect(shown.map((agent) => agent.id)).toEqual(['old', 'lost', 'busy']);
    expect(byId(shown, 'old')).toMatchObject({
      state: 'done',
      steps: 12,
      startedAt: 5_000,
      durationMs: 60_000,
    });
    expect(byId(shown, 'lost').state).toBe('failed');
    // A running one lasts until now.
    expect(byId(shown, 'busy')).toMatchObject({ state: 'running', durationMs: 50_000 });
  });

  it('says a running subagent of a session that is not running stopped', () => {
    const shown = subagentsOf([], false, undefined, 100_000, [
      known('busy'),
      known('odd', { state: 'unknown' }),
    ]);
    expect(shown.map((agent) => [agent.state, agent.durationMs])).toEqual([
      ['stopped', 0],
      ['stopped', 0],
    ]);
  });

  it('keeps a subagent running and gives its stop from the live task report', () => {
    const live = task('t1', 'local_agent', 'Check the tests', 'busy', 1_000, 'reviewer');
    // The runner's report is newer than the list.
    expect(
      subagentsOf([], true, [live], 9_000, [
        known('busy', { state: 'completed', taskId: 't1', type: undefined }),
      ])[0],
    ).toMatchObject({ state: 'running', taskId: 't1', type: 'general-purpose' });
    // And so is a running call of the loaded events.
    const read = [agentCall(1, 'busy', { background: true }), result(2, 'busy')];
    expect(subagentsOf(read, true, [live], 9_000, [known('busy', { state: 'completed' })])[0]).toMatchObject({
      state: 'running',
      taskId: 't1',
    });
  });

  it('gives a loaded call the server’s start, steps and end', () => {
    const shown = subagentsOf([agentCall(80, 'w1')], true, undefined, 200_000, [
      known('w1', { state: 'completed', steps: 9, startedAt: 70_000, endedAt: 150_000, taskId: 't9' }),
    ])[0];
    // The server says it ended before its result was loaded; its own steps were never loaded.
    expect(shown).toMatchObject({
      state: 'done',
      steps: 9,
      startedAt: 70_000,
      durationMs: 80_000,
      taskId: 't9',
    });
    expect(
      subagentsOf([agentCall(80, 'w1')], true, undefined, 200_000, [known('w1', { state: 'failed' })])[0]
        ?.state,
    ).toBe('failed');
    // Still running per the server: what the events say, until now.
    expect(
      subagentsOf([agentCall(80, 'w1')], true, undefined, 200_000, [known('w1', { startedAt: 90_000 })])[0],
    ).toMatchObject({ state: 'running', startedAt: 80_000, durationMs: 120_000 });
    // A finished one, per the events, keeps its own end when the server has none.
    expect(
      subagentsOf([agentCall(80, 'w1'), result(85, 'w1')], true, undefined, 200_000, [
        known('w1', { state: 'completed', startedAt: 90_000 }),
      ])[0]?.durationMs,
    ).toBe(5_000);
    // A subagent listed beside a read one: both, in the order they started.
    expect(
      subagentsOf([agentCall(80, 'w1')], true, undefined, 200_000, [known('w2', { parentId: 'w1' })]).map(
        (agent) => [agent.id, agent.depth],
      ),
    ).toEqual([
      ['w2', 1],
      ['w1', 0],
    ]);
  });

  it('keeps a listed subagent running only on a live subagent task', () => {
    const live = [
      task('b1', 'local_bash', 'Build', 'busy', 1_000),
      task('t2', 'local_agent', 'Loose', undefined, 1_000),
    ];
    expect(subagentsOf([], false, live, 9_000, [known('busy')])[0]?.state).toBe('stopped');
  });

  it('follows the parents of the server’s list for the depth', () => {
    const shown = subagentsOf([], true, undefined, 9_000, [
      known('a', { startedAt: 1_000 }),
      known('b', { startedAt: 2_000, parentId: 'a' }),
      known('c', { startedAt: 3_000, parentId: 'b' }),
    ]);
    expect(shown.map((agent) => agent.depth)).toEqual([0, 1, 2]);
  });

  it('changes nothing without a server list', () => {
    const read = [agentCall(80, 'w1')];
    expect(subagentsOf(read, true, undefined, 200_000)).toEqual(
      subagentsOf(read, true, undefined, 200_000, []),
    );
    expect(subagentsOf([text(1, 'no agents')], true, undefined, 0)).toEqual([]);
  });
});

describe('the session settings', () => {
  it('checks a model or an effort as the server does, and suggests each agent’s efforts', () => {
    expect(validModel('claude-opus-4.5')).toBe(true);
    expect(validModel('openai/gpt-5:latest_1')).toBe(true);
    expect(validModel('')).toBe(false);
    expect(validModel('a b')).toBe(false);
    expect(validModel('x'.repeat(121))).toBe(false);
    expect(effortLevels('codex')).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(effortLevels('claude')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('splits a duration in seconds, minutes or hours', () => {
    expect(durationOf(-5)).toEqual({ unit: 'seconds', seconds: 0 });
    expect(durationOf(42_500)).toEqual({ unit: 'seconds', seconds: 42 });
    expect(durationOf(185_000)).toEqual({ unit: 'minutes', minutes: 3, seconds: 5 });
    expect(durationOf(4_320_000)).toEqual({ unit: 'hours', hours: 1, minutes: 12 });
  });
});
