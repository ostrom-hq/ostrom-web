// SPDX-License-Identifier: Apache-2.0
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { CloudEvent, CloudInput } from '@gen/api/types.gen';
import { zCreateCloudSessionBody, zSendCloudMessageRequest } from '@gen/api/zod.gen';
import { demoCapabilities } from '@/mocks/capabilities';
import { CONVERSATION_ID } from '@/mocks/cloudConversation';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

const AT = '2026-10-30T09:00:00.000Z';
const PATH = `/cloud/sessions/${CONVERSATION_ID}`;
const ERROR = (status: number, type: string): Response =>
  HttpResponse.json({ error: { type, message: type } }, { status });

/** Appends events to the demo conversation before the screen opens. */
function withEvents(
  ...events: { readonly type: string; readonly data: unknown; readonly feed?: string }[]
): void {
  const known = db.cloudEvents[CONVERSATION_ID] ?? [];
  const added: CloudEvent[] = events.map((event, index) => ({
    seq: known.length + index + 1,
    type: event.type,
    at: AT,
    epoch: 1,
    data: event.data,
    ...(event.feed === undefined ? {} : { feed: event.feed }),
  }));
  db.cloudEvents[CONVERSATION_ID] = [...known, ...added];
}

function withSession(change: Partial<(typeof db.cloudSessions)[number]>): void {
  db.cloudSessions = db.cloudSessions.map((session) =>
    session.id === CONVERSATION_ID ? { ...session, ...change } : session,
  );
}

function withoutFeatures(...keys: readonly string[]): void {
  server.use(
    http.get('*/api/v1/capabilities', () =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((key) => !keys.includes(key)))),
    ),
  );
}

function withoutConversations(): void {
  withoutFeatures('runners.cloud.conversation.v1');
}

async function opened(): Promise<HTMLElement> {
  visit(PATH);
  const transcript = await screen.findByRole('region', { name: 'Conversation' });
  await within(transcript).findByText('Why does the invoice test fail on Mondays?');
  return transcript;
}

function composer(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Message the agent' });
}

describe('a conversation session (TeamCode SessionViewModel)', () => {
  it('opens from its row, shows the transcript, and follows it live after a message', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && request.url.endsWith('/messages'))
        void request.json().then((body: unknown) => sent.push(body));
    });
    visit('/cloud');
    await user.click(await screen.findByRole('link', { name: 'Why the invoice test fails on Mondays' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Why the invoice test fails on Mondays' }),
    ).toBeInTheDocument();
    expect(screen.getByText('maya · claude · claude-sonnet-5')).toBeInTheDocument();
    const transcript = await screen.findByRole('region', { name: 'Conversation' });
    expect(
      await within(transcript).findByText('Why does the invoice test fail on Mondays?'),
    ).toBeInTheDocument();
    expect(within(transcript).getByText('Agent started')).toBeInTheDocument();
    expect(within(transcript).getByText('local')).toBeInTheDocument();
    expect(within(transcript).getByRole('separator')).toHaveTextContent(
      /^Turn completed · 42 s · 2 steps · /,
    );
    // The two tool uses fold, then open one by one with their input and output.
    await user.click(within(transcript).getByRole('button', { name: /2 actions/ }));
    await user.click(within(transcript).getByRole('button', { name: /^Bash/ }));
    expect(within(transcript).getByText('Exit code 1')).toBeInTheDocument();
    expect(within(transcript).getByText('1 failed')).toBeInTheDocument();
    expect(await screen.findByText('Live')).toBeInTheDocument();

    await user.type(composer(), 'Fix it, please');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await within(transcript).findByText('On it: Fix it, please')).toBeInTheDocument();
    expect(within(transcript).getByText('Fix it, please')).toBeInTheDocument();
    // The transcript shows it: the pending bubble is gone, the draft cleared.
    expect(screen.queryByText('Sending…')).toBeNull();
    expect(composer()).toHaveValue('');
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(zSendCloudMessageRequest.parse(sent[0]).clientMessageId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('sends with Enter, breaks the line with Shift+Enter, and refuses a message the server would', async () => {
    const user = userEvent.setup();
    const transcript = await opened();
    await user.type(composer(), 'one{Shift>}{Enter}{/Shift}two');
    expect(composer()).toHaveValue('one\ntwo');
    await user.type(composer(), '{Enter}');
    expect(
      await within(transcript).findByText('On it: one two', {
        normalizer: (text) => text.replace(/\s+/g, ' '),
      }),
    ).toBeInTheDocument();
    // Enter on an empty draft sends nothing.
    await user.type(composer(), '{Enter}');
    fireEvent.change(composer(), { target: { value: 'ring \u0007' } });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a message of up to 32,000 characters');
    expect(composer()).toHaveValue('ring \u0007');
  });

  it('keeps a message while it is sent, says where it is, and offers it again after a failure', async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && request.url.endsWith('/messages'))
        void request.json().then((body: unknown) => {
          keys.push(zSendCloudMessageRequest.parse(body).clientMessageId ?? '');
        });
    });
    const queued = (woke: boolean): CloudInput => ({
      id: `in-q-${String(woke)}`,
      kind: 'message',
      status: 'queued',
      authorId: MEMBER_IDS.maya,
      woke,
      createdAt: AT,
    });
    server.use(
      http.post(
        '*/api/v1/cloud/sessions/:id/messages',
        () => HttpResponse.json(queued(true), { status: 202 }),
        {
          once: true,
        },
      ),
      http.post(
        '*/api/v1/cloud/sessions/:id/messages',
        () => HttpResponse.json(queued(false), { status: 202 }),
        {
          once: true,
        },
      ),
      http.post('*/api/v1/cloud/sessions/:id/messages', () => ERROR(503, 'unavailable'), { once: true }),
    );
    const transcript = await opened();
    await user.type(composer(), 'Third');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sent, the session is waking up')).toBeInTheDocument();
    await user.type(composer(), 'Fourth');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sent, waiting for the agent')).toBeInTheDocument();

    await user.type(composer(), 'First');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Not sent: unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await within(transcript).findByText('On it: First')).toBeInTheDocument();
    expect(keys).toHaveLength(4);
    expect(keys[3]).toBe(keys[2]);
    // The others stay as they were.
    expect(screen.getByText('Sent, the session is waking up')).toBeInTheDocument();

    server.use(
      http.post('*/api/v1/cloud/sessions/:id/messages', () => ERROR(409, 'session_not_running'), {
        once: true,
      }),
    );
    await user.type(composer(), 'Second');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Refused: session_not_running')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Second')).toBeNull();

    server.use(
      http.post('*/api/v1/cloud/sessions/:id/messages', async () => {
        await delay('infinite');
        return HttpResponse.json(queued(false), { status: 202 });
      }),
    );
    await user.type(composer(), 'Fifth');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    // A message on its way can be neither retried nor discarded.
    expect(screen.queryAllByRole('button', { name: 'Discard' })).toHaveLength(0);
  });

  it('starts afresh on another session’s address', async () => {
    db.cloudSessions.push({
      id: 'cs-34',
      owner: 'maya',
      agent: 'codex',
      mode: 'conversation',
      status: 'running',
      createdAt: AT,
    });
    db.cloudEvents['cs-34'] = [
      { seq: 1, type: 'message.agent', at: AT, epoch: 1, data: { text: 'Another conversation' } },
    ];
    const router = visit(PATH);
    await screen.findByText('Why does the invoice test fail on Mondays?');
    await router.navigate({ to: '/cloud/sessions/$sessionId', params: { sessionId: 'cs-34' } });
    expect(await screen.findByText('Another conversation')).toBeInTheDocument();
    expect(screen.queryByText('Why does the invoice test fail on Mondays?')).toBeNull();
  });

  it('stops reading when the screen closes before the first page', async () => {
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    server.use(
      http.get('*/api/v1/cloud/sessions/:id/events', async () => {
        await delay('infinite');
        return ERROR(500, 'never');
      }),
    );
    const router = visit(PATH);
    await waitFor(() => {
      expect(asked).toContain(`/api/v1${PATH}/events`);
    });
    await router.navigate({ to: '/cloud' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Cloud agents' })).toBeInTheDocument();
    expect(asked).not.toContain(`/api/v1${PATH}/events/stream`);
  });

  it('says a refusal the transcript reports, with its reason', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/messages', () =>
        HttpResponse.json(
          {
            id: 'in-r',
            kind: 'message',
            status: 'rejected',
            reason: 'delivery_failed',
            authorId: 'm',
            createdAt: AT,
          },
          { status: 202 },
        ),
      ),
    );
    await opened();
    await user.type(composer(), 'Late');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Refused: delivery_failed')).toBeInTheDocument();
  });

  it('interrupts a running turn once, and says when nothing runs', async () => {
    const user = userEvent.setup();
    withEvents({ type: 'turn', data: { phase: 'started' } });
    const transcript = await opened();
    expect(await screen.findByText('The agent is working…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Interrupt' }));
    expect(await within(transcript).findByText(/^Turn interrupted · /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Interrupt' })).toBeNull();
    expect(screen.queryByText('The agent is working…')).toBeNull();
  });

  it('holds Interrupt while it is on its way, and says why it was refused', async () => {
    const user = userEvent.setup();
    withEvents({ type: 'turn', data: { phase: 'started' } });
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/interrupt', () => ERROR(409, 'nothing_to_interrupt'), {
        once: true,
      }),
      http.post('*/api/v1/cloud/sessions/:id/interrupt', () => ERROR(500, 'boom'), { once: true }),
      http.post('*/api/v1/cloud/sessions/:id/interrupt', async () => {
        await delay('infinite');
        return ERROR(500, 'never');
      }),
    );
    await opened();
    await user.click(await screen.findByRole('button', { name: 'Interrupt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing is running.');
    await user.click(screen.getByRole('button', { name: 'Interrupt' }));
    expect(await screen.findByText('boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Interrupt' }));
    const holding = await screen.findByRole('button', { name: 'Interrupting…' });
    expect(holding).toBeDisabled();
    // A new message clears what the last action said.
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('shows what the agent is writing until its final message', async () => {
    withEvents(
      { type: 'turn', data: { phase: 'started' } },
      { type: 'message.agent.delta', data: { messageId: 'm1', index: 0, text: 'Reading the ' } },
      { type: 'message.agent.delta', data: { messageId: 'm1', index: 0, text: '**dates** module' } },
    );
    await opened();
    const live = await screen.findByLabelText('The agent is writing');
    expect(live).toHaveTextContent('Reading the dates module');
    expect(within(live).getByText('dates').tagName).toBe('STRONG');
    expect(screen.queryByText('The agent is working…')).toBeNull();
  });

  it('shows every kind of line the transcript has', async () => {
    const user = userEvent.setup();
    // Without feeds a subagent's steps show nested under its card, in the one transcript.
    withoutFeatures('runners.cloud.transcript.feeds.v1');
    withEvents(
      { type: 'message.user', data: { text: 'From Theo', inputId: 'in-t', authorId: MEMBER_IDS.theo } },
      { type: 'tool.result', data: { id: 'tu-old', output: 'orphan output', isError: true } },
      { type: 'tool.call', data: { id: 'tu-3', name: 'Write', input: { file_path: 'a.ts' } } },
      { type: 'tool.result', data: { id: 'tu-3', output: 'ok', exitCode: 0 } },
      { type: 'message.agent', data: { text: 'Checking.' } },
      { type: 'tool.call', data: { id: 'tu-5', name: 'Edit', input: { file_path: 'b.ts' } } },
      { type: 'message.agent', data: { text: 'Edited.' } },
      { type: 'tool.call', data: { id: 'tu-sub0', name: 'Task', input: {} } },
      {
        type: 'tool.call',
        data: { id: 'tu-sub', name: 'Agent', input: { description: 'Look for callers' } },
      },
      { type: 'tool.call', data: { id: 'tu-4', name: 'Grep' }, feed: 'tu-sub' },
      { type: 'tool.call', data: { name: 'Glob' }, feed: 'tu-sub' },
      { type: 'tool.call', data: { name: 'LS' }, feed: 'tu-sub' },
      { type: 'tool.call', data: { name: 'Find' }, feed: 'tu-sub' },
      { type: 'error', data: { message: 'rate limited' } },
      { type: 'error', data: { code: 'agent_crashed' } },
      { type: 'error', data: {} },
      { type: 'input', data: { inputId: 'in-x', status: 'rejected', reason: 'too_late' } },
      { type: 'input', data: { inputId: 'in-y', status: 'rejected' } },
      { type: 'input', data: { inputId: 'in-z', status: 'cancelled' } },
      { type: 'permission.request', data: { requestId: 'r1', toolName: 'Bash', input: { command: 'rm' } } },
      { type: 'permission.request', data: { requestId: 'r2', input: {} } },
      { type: 'permission.request', data: { requestId: 'r3', question: true, input: { questions: [] } } },
      { type: 'permission.expired', data: { requestId: 'r1' } },
      { type: 'transfer', data: {} },
      { type: 'message.agent', data: { truncated: true, originalBytes: 70_000 } },
      { type: 'status', data: { exitCode: 2 } },
      { type: 'turn', data: { phase: 'interrupted' } },
      { type: 'turn', data: { phase: 'failed', durationMs: 1_500, steps: 1 } },
    );
    const transcript = await opened();
    expect(within(transcript).getByText('From another member')).toBeInTheDocument();
    expect(within(transcript).getAllByText('From Theo')).toHaveLength(1);
    // A result whose call is not loaded shows as an output, folded with the next tool use.
    await user.click(within(transcript).getByRole('button', { name: /^2 actions\s*Write$/ }));
    await user.click(within(transcript).getByRole('button', { name: /^Output/ }));
    expect(within(transcript).getByText('orphan output')).toBeInTheDocument();
    expect(within(transcript).getAllByText('Error').length).toBeGreaterThan(0);
    await user.click(within(transcript).getByRole('button', { name: /^Write/ }));
    expect(within(transcript).getByText('ok')).toBeInTheDocument();
    expect(within(transcript).getByText('Look for callers')).toBeInTheDocument();
    expect(within(transcript).getByText('Task')).toBeInTheDocument();
    // A tool use alone shows as itself, its summary beside its name.
    expect(within(transcript).getByRole('button', { name: /^Edit\s*b\.ts$/ })).toBeInTheDocument();
    await user.click(within(transcript).getByRole('button', { name: /4 actions.*Grep · Glob · LS · …/ }));
    // A tool use without its result yet shows its input alone.
    await user.click(within(transcript).getByRole('button', { name: /^Grep/ }));
    expect(within(transcript).getAllByText('Input')).toHaveLength(2);
    for (const line of [
      'Error: rate limited',
      'Error: agent_crashed',
      'A message was not delivered (too_late)',
      'A message was not delivered (rejected)',
      'A message was cancelled (cancelled)',
      'The agent waits for permission to use Bash',
      'The agent waits for permission to use a tool',
      'The agent asks a question',
      'A permission request expired and was denied',
      'The session changed owner',
      'An event too large to show (message.agent)',
      'The agent exited with code 2',
    ])
      expect(within(transcript).getByText(line)).toBeInTheDocument();
    expect(within(transcript).getByText('Error:')).toBeInTheDocument();
    expect(within(transcript).getByText(/^Turn interrupted · /)).toBeInTheDocument();
    expect(within(transcript).getByText(/^Turn failed · 1 s · 1 step · /)).toBeInTheDocument();
  });

  it('says when the agent waits for a tool use to be allowed', async () => {
    withSession({ waiting: { reason: 'permission', requestId: 'r1' } });
    await opened();
    expect(await screen.findByText('The agent waits for permission to use a tool.')).toBeInTheDocument();
  });

  it('says when the agent asks a question', async () => {
    withSession({ waiting: { reason: 'question' } });
    await opened();
    expect(await screen.findByText('The agent asks you a question.')).toBeInTheDocument();
  });

  it('says a waiting reason it has no words for plainly', async () => {
    withSession({ waiting: { reason: 'approval' } });
    await opened();
    expect(await screen.findByText('The agent waits for you.')).toBeInTheDocument();
  });

  it('takes no more messages once the session ended', async () => {
    withSession({ status: 'ended', endedAt: AT, waiting: { reason: 'permission' } });
    await opened();
    // The session's status and the stream's end.
    expect(await screen.findAllByText('Ended')).toHaveLength(2);
    expect(screen.getByText('This session ended: it takes no more messages.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message the agent' })).toBeNull();
    expect(screen.queryByText('The agent waits for permission to use a tool.')).toBeNull();
  });

  it('opens on an empty transcript, named by its agent, with a status it has no words for', async () => {
    db.cloudSessions.push({
      id: 'cs-34',
      owner: 'maya',
      agent: 'codex',
      mode: 'conversation',
      status: 'paused',
      createdAt: AT,
    });
    visit('/cloud/sessions/cs-34');
    expect(await screen.findByText(/^Nothing yet/)).toBeInTheDocument();
    expect(screen.getByText('paused')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'codex · cs-34' })).toBeInTheDocument();
    expect(screen.getByText('maya · codex')).toBeInTheDocument();
  });

  it('shows no conversation for a terminal session', async () => {
    visit('/cloud/sessions/cs-31');
    expect(
      await screen.findByText('This session runs in a terminal: it has no conversation to show here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Live')).toBeNull();
  });

  it('shows no conversation where the server has none', async () => {
    withoutConversations();
    visit(PATH);
    expect(await screen.findByText('This server does not serve conversations.')).toBeInTheDocument();
  });

  it('says a session that is gone by its header', async () => {
    visit('/cloud/sessions/cs-nope');
    expect(
      await screen.findByText('This session does not exist, or you may no longer read it.'),
    ).toBeInTheDocument();
  });

  it('says a session that is gone by its stream', async () => {
    server.use(http.get('*/api/v1/cloud/sessions/:id/events/stream', () => ERROR(403, 'forbidden')));
    visit(PATH);
    expect(
      await screen.findByText('This session does not exist, or you may no longer read it.'),
    ).toBeInTheDocument();
  });

  it('says when access was withdrawn or the first page failed, and follows again on Try again', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(
        '*/api/v1/cloud/sessions/:id/events/stream',
        () =>
          new HttpResponse('event: denied\ndata: {}\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        { once: true },
      ),
      http.get('*/api/v1/cloud/sessions/:id/events', () => ERROR(500, 'page_failed'), { once: true }),
    );
    visit(PATH);
    expect(await screen.findByText('page_failed')).toBeInTheDocument();
    expect(screen.getByText('Not following')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You may no longer read this session.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Why does the invoice test fail on Mondays?')).toBeInTheDocument();
    expect(screen.queryByText('You may no longer read this session.')).toBeNull();
  });

  it('reconnects by itself after a cut, and reads the header again', async () => {
    const asked: string[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'GET') asked.push(new URL(request.url).pathname);
    });
    server.use(
      http.get(
        '*/api/v1/cloud/sessions/:id/events/stream',
        () => new HttpResponse('', { headers: { 'Content-Type': 'text/event-stream' } }),
        { once: true },
      ),
    );
    await opened();
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();
    expect(await screen.findByText('Live', {}, { timeout: 6_000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(asked.filter((path) => path === PATH.replace('/cloud', '/api/v1/cloud'))).toHaveLength(2);
    });
  });
});

describe('the start of a conversation session', () => {
  it('offers the conversation mode for Claude Code and Codex, and sends it', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && request.url.endsWith('/cloud/sessions'))
        void request.json().then((body: unknown) => sent.push(body));
    });
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    const mode = await within(form).findByRole('combobox', { name: 'Mode' });
    expect(mode).toHaveValue('terminal');
    // A value the form does not offer is never taken.
    fireEvent.change(mode, { target: { value: 'pty' } });
    expect(mode).toHaveValue('terminal');
    await user.selectOptions(mode, 'Conversation');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Agent' }), 'Gemini CLI');
    expect(within(form).queryByRole('combobox', { name: 'Mode' })).toBeNull();
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Agent' }), 'Codex');
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'Talk to me');
    await user.click(within(form).getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByRole('link', { name: 'codex · cs-105' })).toBeInTheDocument();
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(zCreateCloudSessionBody.parse(sent[0]).mode).toBe('conversation');
  });

  it('sends no mode for a terminal, nor where the server has no conversations', async () => {
    const user = userEvent.setup();
    withoutConversations();
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    await screen.findByText('Why the invoice test fails on Mondays');
    expect(within(form).queryByRole('combobox', { name: 'Mode' })).toBeNull();
    // Without the feature, a conversation's row has no screen to open.
    expect(screen.queryByRole('link', { name: 'Why the invoice test fails on Mondays' })).toBeNull();
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'Hi');
    await user.click(within(form).getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByText('claude · cs-105')).toBeInTheDocument();
    expect(db.cloudSessions.find((session) => session.id === 'cs-105')?.mode).toBeUndefined();
  });
});
