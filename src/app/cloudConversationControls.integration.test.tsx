// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { CloudEvent } from '@gen/api/types.gen';
import { zAnswerCloudPermissionRequest } from '@gen/api/zod.gen';
import { demoCapabilities } from '@/mocks/capabilities';
import { CONVERSATION_ID } from '@/mocks/cloudConversation';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

const AT = '2026-10-30T09:00:00.000Z';
const PATH = `/cloud/sessions/${CONVERSATION_ID}`;
const ERROR = (status: number, type: string): Response =>
  HttpResponse.json({ error: { type, message: type } }, { status });
const ANSWER = '*/api/v1/cloud/sessions/:id/permissions';

interface Added {
  readonly type: string;
  readonly data: unknown;
  readonly feed?: string;
  readonly at?: string;
}

/** Appends events to the demo conversation before the screen opens. */
function withEvents(...events: Added[]): void {
  const known = db.cloudEvents[CONVERSATION_ID] ?? [];
  const added: CloudEvent[] = events.map((event, index) => ({
    seq: known.length + index + 1,
    type: event.type,
    at: event.at ?? AT,
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

function session(): (typeof db.cloudSessions)[number] | undefined {
  return db.cloudSessions.find((item) => item.id === CONVERSATION_ID);
}

function withoutFeatures(...keys: readonly string[]): void {
  server.use(
    http.get('*/api/v1/capabilities', () =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((key) => !keys.includes(key)))),
    ),
  );
}

async function opened(): Promise<HTMLElement> {
  visit(PATH);
  const transcript = await screen.findByRole('region', { name: 'Conversation' });
  await within(transcript).findByText('Why does the invoice test fail on Mondays?');
  return transcript;
}

/** What each answer sent: its body and its idempotency key. */
function answers(): { body: ReturnType<typeof zAnswerCloudPermissionRequest.parse>; key: string | null }[] {
  const sent: { body: ReturnType<typeof zAnswerCloudPermissionRequest.parse>; key: string | null }[] = [];
  traffic.onRequest((request) => {
    if (request.method === 'POST' && request.url.endsWith('/permissions')) {
      const key = request.headers.get('Idempotency-Key');
      void request.json().then((body: unknown) => {
        sent.push({ body: zAnswerCloudPermissionRequest.parse(body), key });
      });
    }
  });
  return sent;
}

function bodies(path: string): unknown[] {
  const sent: unknown[] = [];
  traffic.onRequest((request) => {
    if (request.url.endsWith(path) && request.method !== 'GET')
      void request.json().then((body: unknown) => sent.push(body));
  });
  return sent;
}

function urls(): URL[] {
  const seen: URL[] = [];
  traffic.onRequest((request) => {
    seen.push(new URL(request.url));
  });
  return seen;
}

const toolRequest = (requestId: string, data: Record<string, unknown> = {}): Added => ({
  type: 'permission.request',
  data: {
    requestId,
    toolName: 'Bash',
    input: { command: './deploy.sh production' },
    description: 'Deploy to production',
    ...data,
  },
});

const questions = {
  type: 'permission.request',
  data: {
    requestId: 'q1',
    question: true,
    input: {
      questions: [
        {
          question: 'Which branch?',
          header: 'Branch',
          options: [{ label: 'main', description: 'The default' }, { label: 'next' }],
        },
        { question: 'Which sizes?', multiSelect: true, options: [{ label: 'S' }, { label: 'M' }] },
      ],
    },
  },
};

const started: Added = { type: 'turn', data: { phase: 'started' } };

function card(name: RegExp | string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('the permission cards (TeamCode PermissionCardView)', () => {
  it('allows a tool use with the garnet button, and says the request was answered', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(started, toolRequest('r1'));
    withSession({ waiting: { reason: 'permission', requestId: 'r1' } });
    const transcript = await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks to use Bash' });
    expect(within(asked).getByText('Deploy to production')).toBeInTheDocument();
    expect(within(asked).getByText(/deploy\.sh production/)).toBeInTheDocument();
    // The card says the wait: the badge alone is not repeated.
    expect(screen.queryByText('The agent waits for permission to use a tool.')).toBeNull();
    const allow = within(asked).getByRole('button', { name: 'Allow' });
    expect(allow).toHaveClass('o-btn--primary');
    expect(within(asked).getByRole('button', { name: 'Deny' })).not.toHaveClass('o-btn--primary');
    await user.click(allow);
    expect(await within(transcript).findByText('Deployed.')).toBeInTheDocument();
    expect(within(transcript).getByText('A permission request was answered')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'The agent asks to use Bash' })).toBeNull();
    expect(sent.map((answer) => answer.body)).toEqual([{ requestId: 'r1', behavior: 'allow' }]);
    expect(sent[0]?.key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('denies a tool use, and shows the oldest open request first with how many wait after it', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(started, toolRequest('r1'), toolRequest('r2', { toolName: undefined, description: '  ' }));
    const transcript = await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks to use Bash' });
    expect(within(asked).getByText('1 more waiting after this one')).toBeInTheDocument();
    await user.click(within(asked).getByRole('button', { name: 'Deny' }));
    expect(await within(transcript).findByText('Understood: I will not deploy.')).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({ requestId: 'r1', behavior: 'deny' });
    // Its turn ended: the second request closed with it.
    expect(screen.queryByRole('region', { name: /The agent asks to use/ })).toBeNull();
  });

  it('names a tool use it was not told the tool of', async () => {
    withEvents(started, toolRequest('r1', { toolName: undefined, description: undefined }));
    await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks to use a tool' });
    expect(within(asked).queryByText('Deploy to production')).toBeNull();
  });

  it('asks the questions one at a time, and sends every answer at once', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(started, questions);
    await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks' });
    expect(within(asked).getByText('1/2')).toBeInTheDocument();
    expect(within(asked).getByText('Branch')).toBeInTheDocument();
    expect(within(asked).getByText('Choose one')).toBeInTheDocument();
    expect(within(asked).getByText('The default')).toBeInTheDocument();
    expect(within(asked).getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(within(asked).queryByRole('button', { name: 'Allow' })).toBeNull();
    await user.click(within(asked).getByRole('radio', { name: 'next' }));
    await user.click(within(asked).getByRole('button', { name: 'Next' }));
    expect(within(asked).getByText('2/2')).toBeInTheDocument();
    expect(within(asked).getByText('Choose one or more')).toBeInTheDocument();
    expect(within(asked).getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.click(within(asked).getByRole('checkbox', { name: 'S' }));
    await user.click(within(asked).getByRole('checkbox', { name: 'Other' }));
    await user.type(within(asked).getByRole('textbox', { name: 'Your answer' }), 'XL');
    // Back keeps the answer given.
    await user.click(within(asked).getByRole('button', { name: 'Back' }));
    expect(within(asked).getByRole('radio', { name: 'next' })).toBeChecked();
    await user.click(within(asked).getByRole('button', { name: 'Next' }));
    // No button here is garnet: only Allow is.
    expect(within(asked).getByRole('button', { name: 'Send' })).not.toHaveClass('o-btn--primary');
    await user.click(within(asked).getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toEqual({
      requestId: 'q1',
      behavior: 'allow',
      answers: [
        { question: 0, options: [1] },
        { question: 1, text: 'S, XL' },
      ],
    });
  });

  it('lets a question be declined, and a request too large to show only be denied', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(
      started,
      {
        type: 'permission.request',
        data: { requestId: 'big', toolName: 'Write', inputTruncated: true, inputPreview: '{"content":"…' },
      },
      { type: 'permission.request', data: { requestId: 'bigq', question: true, inputTruncated: true } },
    );
    await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks to use Write' });
    expect(within(asked).getByText(/too large to show in full/)).toBeInTheDocument();
    expect(within(asked).getByText('{"content":"…')).toBeInTheDocument();
    expect(within(asked).queryByRole('button', { name: 'Allow' })).toBeNull();
    server.use(
      http.post(
        ANSWER,
        () =>
          HttpResponse.json(
            { id: 'in-d', kind: 'permission', status: 'queued', authorId: 'm-1', createdAt: AT },
            { status: 202 },
          ),
        { once: true },
      ),
    );
    await user.click(within(asked).getByRole('button', { name: 'Deny' }));
    expect(await within(asked).findByText('Answer sent, waiting for the agent')).toBeInTheDocument();
    expect(within(asked).getByRole('button', { name: 'Deny' })).toBeDisabled();
    expect(sent[0]?.body).toEqual({ requestId: 'big', behavior: 'deny' });
  });

  it('declines a question too large to show', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(started, {
      type: 'permission.request',
      data: { requestId: 'bigq', question: true, inputTruncated: true },
    });
    await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks' });
    await user.click(within(asked).getByRole('button', { name: 'Decline' }));
    await waitFor(() => {
      expect(sent[0]?.body).toEqual({ requestId: 'bigq', behavior: 'deny' });
    });
  });

  it('declines a question from its own step', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(started, questions);
    await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks' });
    await user.click(within(asked).getByRole('radio', { name: 'Other' }));
    await user.type(within(asked).getByRole('textbox', { name: 'Your answer' }), 'release');
    await user.click(within(asked).getByRole('radio', { name: /^main/ }));
    expect(within(asked).queryByRole('textbox', { name: 'Your answer' })).toBeNull();
    await user.click(within(asked).getByRole('button', { name: 'Decline' }));
    await waitFor(() => {
      expect(sent[0]?.body).toEqual({ requestId: 'q1', behavior: 'deny' });
    });
  });

  it('sends a failed answer again under the same key, and a changed one under a new key', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withEvents(started, questions);
    server.use(
      http.post(ANSWER, () => ERROR(503, 'unavailable'), { once: true }),
      http.post(ANSWER, () => ERROR(503, 'unavailable'), { once: true }),
      http.post(ANSWER, () => HttpResponse.error(), { once: true }),
    );
    await opened();
    const asked = await screen.findByRole('region', { name: 'The agent asks' });
    await user.click(within(asked).getByRole('radio', { name: /^main/ }));
    await user.click(within(asked).getByRole('button', { name: 'Next' }));
    await user.click(within(asked).getByRole('checkbox', { name: 'M' }));
    await user.click(within(asked).getByRole('button', { name: 'Send' }));
    expect(await within(asked).findByText(/Not sent: unavailable/)).toBeInTheDocument();
    await user.click(within(asked).getByRole('button', { name: 'Retry' }));
    expect(await within(asked).findByText(/Not sent: unavailable/)).toBeInTheDocument();
    // Edited after a failure: a new answer, under a new key.
    await user.click(within(asked).getByRole('checkbox', { name: 'S' }));
    expect(within(asked).queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.click(within(asked).getByRole('button', { name: 'Send' }));
    expect(await within(asked).findByText(/Not sent: /)).toBeInTheDocument();
    await waitFor(() => {
      expect(sent).toHaveLength(3);
    });
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[2]?.key).not.toBe(sent[0]?.key);
    expect(sent[2]?.body.answers).toEqual([
      { question: 0, options: [0] },
      { question: 1, options: [0, 1] },
    ]);
    // Deny after a failed Send is another answer: another key.
    await user.click(within(asked).getByRole('button', { name: 'Decline' }));
    await waitFor(() => {
      expect(sent).toHaveLength(4);
    });
    expect(sent[3]?.key).not.toBe(sent[2]?.key);
  });

  it('says a request answered, expired or ended elsewhere, and hides its card', async () => {
    const user = userEvent.setup();
    withEvents(started, toolRequest('a'), toolRequest('b'), toolRequest('c'));
    server.use(
      http.post(ANSWER, () => ERROR(409, 'permission_request_answered'), { once: true }),
      http.post(ANSWER, () => ERROR(409, 'permission_request_expired'), { once: true }),
      http.post(ANSWER, () => ERROR(409, 'permission_request_ended'), { once: true }),
    );
    await opened();
    await user.click(
      await within(card('The agent asks to use Bash')).findByRole('button', { name: 'Allow' }),
    );
    expect(await screen.findByText('Someone already answered this request.')).toBeInTheDocument();
    expect(
      within(card('The agent asks to use Bash')).getByText('1 more waiting after this one'),
    ).toBeInTheDocument();
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('This request expired before the answer arrived.')).toBeInTheDocument();
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Deny' }));
    expect(
      await screen.findByText('This request has ended: it takes no answer any more.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'The agent asks to use Bash' })).toBeNull();
  });

  it('keeps the answer to correct after a refusal, and says why', async () => {
    const user = userEvent.setup();
    withEvents(started, toolRequest('a'));
    server.use(
      http.post(ANSWER, () => ERROR(400, 'permission_input_unseen'), { once: true }),
      http.post(ANSWER, () => ERROR(400, 'invalid_permission_answer'), { once: true }),
      http.post(ANSWER, () => HttpResponse.json({ error: { message: 'no' } }, { status: 400 }), {
        once: true,
      }),
      http.post(ANSWER, () => ERROR(403, 'permission_owner_only'), { once: true }),
      http.post(ANSWER, () => ERROR(403, 'session_access_denied'), { once: true }),
      http.post(
        ANSWER,
        () =>
          HttpResponse.json(
            { id: 'in-r', kind: 'permission', status: 'rejected', authorId: 'm-1', createdAt: AT },
            { status: 202 },
          ),
        { once: true },
      ),
    );
    await opened();
    const allow = async (): Promise<void> => {
      await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' }));
    };
    await allow();
    expect(
      await screen.findByText('This request was too large to show, so it can only be declined.'),
    ).toBeInTheDocument();
    await allow();
    expect(
      await screen.findByText(
        'The server refused this answer (invalid_permission_answer). Check it and send again.',
      ),
    ).toBeInTheDocument();
    await allow();
    expect(
      await screen.findByText('The server refused this answer (no reason given). Check it and send again.'),
    ).toBeInTheDocument();
    await allow();
    expect(
      await screen.findByText(
        'Only the session’s owner or an administrator may allow or deny this tool use.',
      ),
    ).toBeInTheDocument();
    await allow();
    expect(await screen.findByText('session_access_denied')).toBeInTheDocument();
    // A replayed acknowledgement of a refused answer: final, said without a reason.
    await allow();
    expect(
      await within(card('The agent asks to use Bash')).findByText('no reason given'),
    ).toBeInTheDocument();
  });

  it('reopens an accepted answer the agent did not take', async () => {
    const user = userEvent.setup();
    withEvents(started, toolRequest('a'), {
      type: 'input',
      data: { inputId: 'in-late', status: 'rejected', reason: 'delivery_failed' },
    });
    server.use(
      http.post(
        ANSWER,
        () =>
          HttpResponse.json(
            { id: 'in-late', kind: 'permission', status: 'queued', authorId: 'm-1', createdAt: AT },
            { status: 202 },
          ),
        { once: true },
      ),
    );
    await opened();
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' }));
    expect(
      await screen.findByText('The agent did not take the answer (delivery_failed). Answer again.'),
    ).toBeInTheDocument();
    expect(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' })).toBeEnabled();
  });

  it('holds the buttons while an answer is on its way', async () => {
    const user = userEvent.setup();
    withEvents(started, toolRequest('a'));
    server.use(
      http.post(ANSWER, async () => {
        await delay('infinite');
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    await opened();
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('Sending the answer…')).toBeInTheDocument();
    expect(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' })).toBeDisabled();
  });

  it('shows no card while the session takes no answer, nor where the server has none', async () => {
    withEvents(started, toolRequest('a'));
    withSession({ status: 'paused', waiting: { reason: 'permission', requestId: 'a' } });
    await opened();
    expect(screen.queryByRole('region', { name: 'The agent asks to use Bash' })).toBeNull();
  });

  it('shows no card where the server does not serve permissions', async () => {
    withoutFeatures('runners.cloud.permissions.v1');
    withEvents(started, toolRequest('a'));
    const transcript = await opened();
    expect(within(transcript).getByText('The agent waits for permission to use Bash')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'The agent asks to use Bash' })).toBeNull();
  });
});

describe('the standing approval of tool uses (runners.cloud.permissions.bypass.v1)', () => {
  it('lets the owner bypass from the card, which allows the request too, then ask again', async () => {
    const user = userEvent.setup();
    const sent = answers();
    const bypass = bodies('/permission-bypass');
    withSession({ permissionBypass: false });
    withEvents(started, toolRequest('a'));
    const transcript = await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    expect(within(settings).getByText('The agent asks before each tool use')).toBeInTheDocument();
    const bypassButton = await within(card('The agent asks to use Bash')).findByRole('button', {
      name: 'Bypass',
    });
    expect(bypassButton).not.toHaveClass('o-btn--primary');
    await user.click(bypassButton);
    // A standing approval: confirmed by a second press that says so, or kept asking.
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Keep asking' }));
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Bypass' }));
    await user.click(
      within(card('The agent asks to use Bash')).getByRole('button', {
        name: 'Approve every tool use from now on',
      }),
    );
    expect(await within(transcript).findByText('Deployed.')).toBeInTheDocument();
    expect(bypass).toEqual([{ enabled: true }]);
    expect(sent[0]?.body).toEqual({ requestId: 'a', behavior: 'allow' });
    expect(within(settings).getByText('Tool uses are approved without asking')).toBeInTheDocument();
    expect(session()?.permissionBypass).toBe(true);
    await user.click(within(settings).getByRole('button', { name: 'Ask for permissions again' }));
    expect(await within(settings).findByText('The agent asks before each tool use')).toBeInTheDocument();
    expect(bypass).toEqual([{ enabled: true }, { enabled: false }]);
  });

  it('turns it on from the settings after a confirmation', async () => {
    const user = userEvent.setup();
    withSession({ permissionBypass: false });
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    await user.click(within(settings).getByRole('button', { name: 'Approve every tool use' }));
    await user.click(within(settings).getByRole('button', { name: 'Keep asking' }));
    await user.click(within(settings).getByRole('button', { name: 'Approve every tool use' }));
    await user.click(within(settings).getByRole('button', { name: 'Approve every tool use from now on' }));
    expect(await within(settings).findByText('Tool uses are approved without asking')).toBeInTheDocument();
  });

  it('allows nothing when the approval is refused, and says why', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withSession({ permissionBypass: false });
    withEvents(started, toolRequest('a'));
    server.use(
      http.put('*/api/v1/cloud/sessions/:id/permission-bypass', () => ERROR(403, 'bypass_owner_only'), {
        once: true,
      }),
    );
    await opened();
    await user.click(
      await within(card('The agent asks to use Bash')).findByRole('button', { name: 'Bypass' }),
    );
    await user.click(
      within(card('The agent asks to use Bash')).getByRole('button', {
        name: 'Approve every tool use from now on',
      }),
    );
    expect(await screen.findByText('bypass_owner_only')).toBeInTheDocument();
    expect(sent).toEqual([]);
    expect(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' })).toBeEnabled();
  });

  it('allows nothing after the bypass when the request was answered meanwhile', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withSession({ permissionBypass: false });
    withEvents(started, toolRequest('a'));
    let release: () => void = () => undefined;
    server.use(
      http.put(
        '*/api/v1/cloud/sessions/:id/permission-bypass',
        async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ ...session(), permissionBypass: true });
        },
        { once: true },
      ),
      http.post(
        ANSWER,
        () =>
          HttpResponse.json(
            { id: 'in-q', kind: 'permission', status: 'queued', authorId: 'm-1', createdAt: AT },
            { status: 202 },
          ),
        { once: true },
      ),
    );
    await opened();
    await user.click(
      await within(card('The agent asks to use Bash')).findByRole('button', { name: 'Bypass' }),
    );
    await user.click(
      within(card('The agent asks to use Bash')).getByRole('button', {
        name: 'Approve every tool use from now on',
      }),
    );
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Answer sent, waiting for the agent')).toBeInTheDocument();
    release();
    expect(await screen.findByText('Tool uses are approved without asking')).toBeInTheDocument();
    expect(sent.map((answer) => answer.body.behavior)).toEqual(['deny']);
  });

  it('allows nothing after the bypass when the request closed meanwhile', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withSession({ permissionBypass: false });
    withEvents(started, toolRequest('a'));
    let release: () => void = () => undefined;
    server.use(
      http.put(
        '*/api/v1/cloud/sessions/:id/permission-bypass',
        async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ ...session(), permissionBypass: true });
        },
        { once: true },
      ),
    );
    const transcript = await opened();
    await user.click(
      await within(card('The agent asks to use Bash')).findByRole('button', { name: 'Bypass' }),
    );
    await user.click(
      within(card('The agent asks to use Bash')).getByRole('button', {
        name: 'Approve every tool use from now on',
      }),
    );
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Allow' }));
    expect(await within(transcript).findByText('Deployed.')).toBeInTheDocument();
    release();
    expect(await screen.findByText('Tool uses are approved without asking')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it('takes one setting at a time: a bypass while the model changes allows nothing', async () => {
    const user = userEvent.setup();
    const sent = answers();
    withSession({ permissionBypass: false });
    withEvents(started, toolRequest('a'));
    server.use(
      http.put('*/api/v1/cloud/sessions/:id/model', async () => {
        await delay('infinite');
        return HttpResponse.json(session());
      }),
    );
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    await user.click(within(settings).getByRole('button', { name: 'Change Model' }));
    await user.clear(within(settings).getByRole('textbox', { name: 'Model' }));
    await user.type(within(settings).getByRole('textbox', { name: 'Model' }), 'claude-opus-5{Enter}');
    await waitFor(() => {
      expect(within(settings).getByRole('button', { name: 'Change Model' })).toBeDisabled();
    });
    await user.click(within(card('The agent asks to use Bash')).getByRole('button', { name: 'Bypass' }));
    await user.click(
      within(card('The agent asks to use Bash')).getByRole('button', {
        name: 'Approve every tool use from now on',
      }),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(sent).toEqual([]);
  });

  it('offers neither to anyone but the owner, nor on a server without it', async () => {
    withSession({ owner: 'lena', permissionBypass: false });
    withEvents(started, toolRequest('a'));
    await opened();
    expect(await screen.findByRole('region', { name: 'The agent asks to use Bash' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bypass' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Session settings' })).toBeNull();
  });

  it('is not offered by a server that does not announce it', async () => {
    withoutFeatures(
      'runners.cloud.permissions.bypass.v1',
      'runners.cloud.model.v1',
      'runners.cloud.effort.v1',
    );
    withSession({ permissionBypass: false });
    withEvents(started, toolRequest('a'));
    await opened();
    expect(await screen.findByRole('region', { name: 'The agent asks to use Bash' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bypass' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Session settings' })).toBeNull();
  });
});

describe('the model and the effort (runners.cloud.model.v1, runners.cloud.effort.v1)', () => {
  it('switches the model, checked as the server checks it', async () => {
    const user = userEvent.setup();
    const sent = bodies('/model');
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    await user.click(within(settings).getByRole('button', { name: 'Change Model' }));
    const field = within(settings).getByRole('textbox', { name: 'Model' });
    expect(field).toHaveValue('claude-sonnet-5');
    expect(within(settings).getByRole('button', { name: 'Switch' })).toBeDisabled();
    // The same model: Enter switches nothing.
    await user.type(field, '{Enter}');
    expect(
      within(settings).getByText(/A turn in progress finishes with the current model/),
    ).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'a b');
    expect(
      within(settings).getByText('Use letters, digits and . _ : / - (up to 120 characters).'),
    ).toBeInTheDocument();
    expect(within(settings).getByRole('button', { name: 'Switch' })).toBeDisabled();
    await user.clear(field);
    await user.type(field, ' claude-opus-5 {Enter}');
    expect(await screen.findByText('maya · claude · claude-opus-5')).toBeInTheDocument();
    expect(sent).toEqual([{ model: 'claude-opus-5' }]);
    expect(within(settings).getByText('claude-opus-5')).toBeInTheDocument();
  });

  it('switches the effort among the agent’s usual levels, and says a refusal', async () => {
    const user = userEvent.setup();
    const sent = bodies('/effort');
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    expect(within(settings).getByText('default')).toBeInTheDocument();
    await user.click(within(settings).getByRole('button', { name: 'Change Effort' }));
    const field = within(settings).getByRole('combobox', { name: 'Effort' });
    expect(field).toHaveValue('');
    expect(settings.querySelectorAll('datalist option')).toHaveLength(5);
    await user.click(within(settings).getByRole('button', { name: 'Cancel' }));
    await user.click(within(settings).getByRole('button', { name: 'Change Effort' }));
    // Enter on an invalid value sends nothing.
    await user.type(within(settings).getByRole('combobox', { name: 'Effort' }), '{Enter}');
    await user.type(within(settings).getByRole('combobox', { name: 'Effort' }), 'high');
    await user.click(within(settings).getByRole('button', { name: 'Switch' }));
    expect(await within(settings).findByText('high')).toBeInTheDocument();
    expect(sent).toEqual([{ effort: 'high' }]);

    server.use(
      http.put('*/api/v1/cloud/sessions/:id/effort', () => ERROR(409, 'session_not_running'), { once: true }),
    );
    await user.click(within(settings).getByRole('button', { name: 'Change Effort' }));
    const again = within(settings).getByRole('combobox', { name: 'Effort' });
    await user.clear(again);
    await user.type(again, 'max');
    await user.click(within(settings).getByRole('button', { name: 'Switch' }));
    expect(await within(settings).findByRole('alert')).toHaveTextContent('session_not_running');
  });

  it('suggests Codex’s own efforts', async () => {
    const user = userEvent.setup();
    withSession({ agent: 'codex' });
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    await user.click(within(settings).getByRole('button', { name: 'Change Effort' }));
    expect(settings.querySelectorAll('datalist option')).toHaveLength(4);
  });

  it('offers each setting the server announces alone', async () => {
    withoutFeatures('runners.cloud.permissions.bypass.v1', 'runners.cloud.model.v1');
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    expect(within(settings).getByRole('button', { name: 'Change Effort' })).toBeInTheDocument();
    expect(within(settings).queryByRole('button', { name: 'Change Model' })).toBeNull();
    expect(within(settings).queryByText('The agent asks before each tool use')).toBeNull();
  });

  it('offers the model without the effort where the server has no effort', async () => {
    withoutFeatures('runners.cloud.effort.v1');
    await opened();
    const settings = screen.getByRole('region', { name: 'Session settings' });
    expect(within(settings).getByRole('button', { name: 'Change Model' })).toBeInTheDocument();
    expect(within(settings).queryByRole('button', { name: 'Change Effort' })).toBeNull();
  });

  it('offers no settings once the session ended', async () => {
    withSession({ status: 'terminated' });
    await opened();
    expect(screen.queryByRole('region', { name: 'Session settings' })).toBeNull();
  });
});

const tasksReport = (tasks: unknown[], extra: Record<string, unknown> = {}): Added => ({
  type: 'tasks',
  data: { tasks, stoppable: true, scheduled: 0, ...extra },
});

describe('what runs in the session (TeamCode SubagentPanel)', () => {
  it('lists the background commands and monitors, and stops one after a confirmation', async () => {
    const user = userEvent.setup();
    const sent = bodies('/tasks/stop');
    const startedAt = Date.parse(AT);
    withEvents(
      started,
      { type: 'tool.call', data: { id: 'tu-bg', name: 'Bash', input: { command: 'pnpm test --watch' } } },
      {
        type: 'tool.call',
        data: { id: 'tu-mon', name: 'Monitor', input: { command: 'kubectl rollout status' } },
      },
      tasksReport(
        [
          {
            id: 'task-tests',
            type: 'local_bash',
            description: 'Tests in watch mode',
            toolUseId: 'tu-bg',
            startedAt,
          },
          { id: 'task-mon', type: 'local_bash', description: 'kubectl rollout status', toolUseId: 'tu-mon' },
          {
            id: 'task-loose',
            type: 'local_bash',
            description: 'A loose command',
            startedAt: startedAt - 4_000_000,
          },
        ],
        { scheduled: 2 },
      ),
    );
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText('5 running')).toBeInTheDocument();
    expect(within(panel).getByText('Background commands · 2')).toBeInTheDocument();
    expect(within(panel).getByText('pnpm test --watch')).toBeInTheDocument();
    expect(within(panel).getByText('Tests in watch mode')).toBeInTheDocument();
    expect(within(panel).getByText('A loose command')).toBeInTheDocument();
    expect(within(panel).getAllByText(/^\d+ h \d+ min$/).length).toBeGreaterThan(0);
    expect(within(panel).getByText('Monitors and waits · 1')).toBeInTheDocument();
    expect(within(panel).getByText('Scheduled wake-ups · 2')).toBeInTheDocument();
    expect(within(panel).getByText(/2 wake-ups scheduled by the agent/)).toBeInTheDocument();
    const [stop] = within(panel).getAllByRole('button', { name: 'Stop' });
    if (stop === undefined) throw new Error('no Stop');
    await user.click(stop);
    await user.click(within(panel).getByRole('button', { name: 'Stop “pnpm test --watch”' }));
    await waitFor(() => {
      expect(within(panel).queryByText('pnpm test --watch')).toBeNull();
    });
    expect(sent).toEqual([{ taskId: 'task-tests' }]);
  });

  it('lists a subagent’s task to stop it where the server has no feeds, without threads', async () => {
    const user = userEvent.setup();
    const sent = bodies('/tasks/stop');
    withoutFeatures('runners.cloud.transcript.feeds.v1');
    withEvents(
      started,
      {
        type: 'tool.call',
        data: { id: 'tu-r', name: 'Agent', input: { description: 'Review it', subagent_type: 'reviewer' } },
      },
      tasksReport([
        {
          id: 'task-r',
          type: 'local_agent',
          description: 'Review it',
          toolUseId: 'tu-r',
          subagentType: 'reviewer',
        },
      ]),
    );
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText('reviewer')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'reviewer' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Main conversation' })).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Stop' }));
    await user.click(within(panel).getByRole('button', { name: 'Stop “Review it”' }));
    await waitFor(() => {
      expect(sent).toEqual([{ taskId: 'task-r' }]);
    });
  });

  it('says a subagent parked on a wait is waiting, with its time in minutes', async () => {
    const at = new Date(Date.now() - 185_000).toISOString();
    withEvents(
      started,
      {
        type: 'tool.call',
        data: { id: 'tu-w', name: 'Agent', input: { description: 'Watch the rollout' } },
        at,
      },
      {
        type: 'tool.call',
        data: { id: 'tu-wm', name: 'Monitor', input: { command: 'kubectl rollout status' } },
        feed: 'tu-w',
        at,
      },
    );
    const user = userEvent.setup();
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    // Its own events, read with its thread, show what it waits on.
    await user.click(within(panel).getByRole('button', { name: 'general-purpose' }));
    expect(await within(panel).findByText('Waiting')).toBeInTheDocument();
    expect(within(panel).getAllByText(/^3 min \d+ s$/).length).toBeGreaterThan(0);
  });

  it('lists finished subagents without a running count', async () => {
    withEvents(
      { type: 'tool.call', data: { id: 'tu-d', name: 'Agent', input: { description: 'Done already' } } },
      { type: 'tool.result', data: { id: 'tu-d', output: 'ok' } },
    );
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText('Done already')).toBeInTheDocument();
    expect(within(panel).queryByText(/running$/)).toBeNull();
  });

  it('says Stopping… until the runner drops the task, and why a stop failed', async () => {
    const user = userEvent.setup();
    withEvents(started, tasksReport([{ id: 't1', type: 'local_bash', description: 'Build' }]));
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/tasks/stop', () => ERROR(409, 'nothing_to_interrupt'), {
        once: true,
      }),
      http.post('*/api/v1/cloud/sessions/:id/tasks/stop', () => ERROR(500, 'boom'), { once: true }),
      http.post('*/api/v1/cloud/sessions/:id/tasks/stop', () =>
        HttpResponse.json(
          { id: 'in-s', kind: 'stop_task', status: 'queued', authorId: 'm-1', createdAt: AT },
          { status: 202 },
        ),
      ),
    );
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    const stop = async (): Promise<void> => {
      await user.click(within(panel).getByRole('button', { name: 'Stop' }));
      await user.click(within(panel).getByRole('button', { name: 'Stop “Build”' }));
    };
    await stop();
    expect(await within(panel).findByText('Nothing is running.')).toBeInTheDocument();
    await stop();
    expect(await within(panel).findByText('boom')).toBeInTheDocument();
    await stop();
    expect(await within(panel).findByText('Stopping…')).toBeInTheDocument();
  });

  it('lists the tasks of a runner that cannot stop them', async () => {
    withEvents(
      started,
      tasksReport([{ id: 't1', type: 'local_bash', description: 'Build' }], { stoppable: false }),
    );
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(
      within(panel).getByText('This session’s runner does not stop tasks: they are listed only.'),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('says a subagent’s task cannot be stopped by a runner that does not stop tasks', async () => {
    withEvents(
      started,
      {
        type: 'tool.call',
        data: { id: 'tu-a', name: 'Agent', input: { description: 'Review', subagent_type: 'reviewer' } },
      },
      tasksReport([{ id: 't-a', type: 'local_agent', description: 'Review', toolUseId: 'tu-a' }], {
        stoppable: false,
      }),
    );
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(
      within(panel).getByText('This session’s runner does not stop tasks: they are listed only.'),
    ).toBeInTheDocument();
  });

  it('counts the durations up every second while something runs', async () => {
    const startedAt = Date.now();
    withEvents(started, tasksReport([{ id: 't1', type: 'local_bash', description: 'Build', startedAt }]));
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText(/^\d+ s$/)).toBeInTheDocument();
    await waitFor(
      () => {
        expect(within(panel).queryByText('0 s')).toBeNull();
      },
      { timeout: 3_000 },
    );
  });

  it('shows nothing of the tasks of a paused session', async () => {
    withEvents(started, tasksReport([{ id: 't1', type: 'local_bash', description: 'Build' }]));
    withSession({ status: 'paused' });
    await opened();
    expect(screen.queryByRole('complementary', { name: 'Running in this session' })).toBeNull();
  });

  it('shows no panel where the server announces neither feeds nor tasks', async () => {
    withoutFeatures('runners.cloud.transcript.feeds.v1', 'runners.cloud.tasks.v1');
    withEvents(started, tasksReport([{ id: 't1', type: 'local_bash', description: 'Build' }]));
    await opened();
    expect(screen.queryByRole('complementary', { name: 'Running in this session' })).toBeNull();
  });
});

describe('the subagent feeds (runners.cloud.transcript.feeds.v1)', () => {
  const subagent: Added[] = [
    started,
    {
      type: 'tool.call',
      data: {
        id: 'tu-a',
        name: 'Agent',
        input: { description: 'Review the script', subagent_type: 'reviewer' },
      },
    },
    {
      type: 'tool.call',
      data: { id: 'tu-s1', name: 'Read', input: { file_path: 'deploy.sh' } },
      feed: 'tu-a',
    },
    { type: 'tool.result', data: { id: 'tu-s1', output: '#!/bin/sh' }, feed: 'tu-a' },
    { type: 'message.agent', data: { text: 'The script looks safe.' }, feed: 'tu-a' },
    { type: 'tool.call', data: { id: 'tu-b', name: 'Agent', input: { description: 'Nothing yet' } } },
  ];

  it('opens on the main feed, and a subagent’s card opens its own thread from its feed', async () => {
    const user = userEvent.setup();
    const seen = urls();
    withEvents(...subagent);
    const transcript = await opened();
    // The main agent's own events: the subagent's steps are in its feed.
    expect(within(transcript).queryByText('The script looks safe.')).toBeNull();
    const pages = seen.filter((url) => url.pathname.endsWith('/events'));
    expect(pages[0]?.searchParams.get('feed')).toBe('main');
    await waitFor(() => {
      expect(seen.some((url) => url.pathname.endsWith('/agents'))).toBe(true);
    });
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText('Subagents · 2')).toBeInTheDocument();
    expect(within(panel).getByText('Review the script')).toBeInTheDocument();
    expect(within(panel).getAllByText('Running')).toHaveLength(2);
    expect(within(panel).getByText('2 running')).toBeInTheDocument();
    expect(within(panel).getByText(/Background commands and monitors show here/)).toBeInTheDocument();

    await user.click(within(transcript).getByRole('button', { name: 'Open reviewer' }));
    expect(await within(transcript).findByText('The script looks safe.')).toBeInTheDocument();
    expect(within(transcript).getByText('Subagent: reviewer')).toBeInTheDocument();
    expect(seen.filter((url) => url.searchParams.get('feed') === 'tu-a')).toHaveLength(1);
    // Back, then the same thread again: its feed was read once.
    await user.click(within(transcript).getByRole('button', { name: '← Main conversation' }));
    expect(within(transcript).queryByText('The script looks safe.')).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'reviewer' }));
    expect(await within(transcript).findByText('The script looks safe.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'reviewer' })).toHaveAttribute('aria-pressed', 'true');
    expect(seen.filter((url) => url.searchParams.get('feed') === 'tu-a')).toHaveLength(1);
    await user.click(within(panel).getByRole('button', { name: 'Main conversation' }));
    expect(within(transcript).queryByText('Subagent: reviewer')).toBeNull();

    // A subagent with no step yet says so.
    await user.click(within(panel).getByRole('button', { name: 'general-purpose' }));
    expect(
      await within(transcript).findByText(/This subagent’s steps are not loaded yet/),
    ).toBeInTheDocument();
  });

  it('reads a feed again after it failed', async () => {
    const user = userEvent.setup();
    withEvents(...subagent);
    let failed = false;
    server.use(
      http.get('*/api/v1/cloud/sessions/:id/events', ({ request }) => {
        if (failed || new URL(request.url).searchParams.get('feed') !== 'tu-a') return undefined;
        failed = true;
        return ERROR(500, 'boom');
      }),
    );
    const transcript = await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    await user.click(within(panel).getByRole('button', { name: 'reviewer' }));
    expect(
      await within(transcript).findByText(/This subagent’s steps are not loaded yet/),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Main conversation' }));
    await user.click(within(panel).getByRole('button', { name: 'reviewer' }));
    expect(await within(transcript).findByText('The script looks safe.')).toBeInTheDocument();
  });

  it('reads the server’s list again when a subagent starts live, and stops one with its task', async () => {
    const user = userEvent.setup();
    const seen = urls();
    const sent = bodies('/tasks/stop');
    const transcript = await opened();
    await waitFor(() => {
      expect(seen.filter((url) => url.pathname.endsWith('/agents'))).toHaveLength(1);
    });
    await user.type(screen.getByRole('textbox', { name: 'Message the agent' }), 'Run the deploy');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const asked = await screen.findByRole('region', { name: 'The agent asks to use Bash' });
    expect(asked).toBeInTheDocument();
    await waitFor(() => {
      expect(seen.filter((url) => url.pathname.endsWith('/agents')).length).toBeGreaterThan(1);
    });
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText('Review the deploy script')).toBeInTheDocument();
    expect(within(transcript).getByRole('button', { name: 'Open reviewer' })).toBeInTheDocument();
    // The subagent's own task: stopped from its row.
    const stops = within(panel).getAllByRole('button', { name: 'Stop' });
    expect(stops).toHaveLength(2);
    await user.click(stops[0] ?? panel);
    await user.click(within(panel).getByRole('button', { name: 'Stop “Review the deploy script”' }));
    await waitFor(() => {
      expect(sent).toEqual([{ taskId: 'task-review' }]);
    });
    // The deploy allowed: the main agent's own tool result, which moves no subagent.
    await user.click(within(asked).getByRole('button', { name: 'Allow' }));
    expect(await within(transcript).findByText('Deployed.')).toBeInTheDocument();
  });

  it('keeps what the events show when the server’s list fails, and reads it once more after a burst', async () => {
    const seen = urls();
    let reads = 0;
    server.use(
      http.get('*/api/v1/cloud/sessions/:id/agents', () => {
        reads += 1;
        return reads === 1 ? ERROR(500, 'boom') : undefined;
      }),
    );
    withEvents(...subagent);
    await opened();
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(within(panel).getByText('Review the script')).toBeInTheDocument();
    expect(seen.filter((url) => url.pathname.endsWith('/agents')).length).toBeGreaterThan(0);
  });

  it('reads the list again on a subagent’s live result, even while the list fails', async () => {
    const user = userEvent.setup();
    const seen = urls();
    server.use(http.get('*/api/v1/cloud/sessions/:id/agents', () => ERROR(500, 'boom')));
    await opened();
    await waitFor(() => {
      expect(seen.filter((url) => url.pathname.endsWith('/agents'))).toHaveLength(1);
    });
    await user.type(screen.getByRole('textbox', { name: 'Message the agent' }), 'Run the deploy');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const panel = await screen.findByRole('complementary', { name: 'Running in this session' });
    expect(await within(panel).findByText('Review the deploy script')).toBeInTheDocument();
    const asked = await screen.findByRole('region', { name: 'The agent asks to use Bash' });
    const before = seen.filter((url) => url.pathname.endsWith('/agents')).length;
    // The reviewer's own result comes later, in the main feed: the list is read again.
    await user.click(within(asked).getByRole('button', { name: 'Deny' }));
    await waitFor(() => {
      expect(seen.filter((url) => url.pathname.endsWith('/agents')).length).toBeGreaterThan(before);
    });
  });

  it('shows the steps nested, as before, where the server has no feeds', async () => {
    withoutFeatures('runners.cloud.transcript.feeds.v1');
    withEvents(...subagent);
    const transcript = await opened();
    expect(await within(transcript).findByText('The script looks safe.')).toBeInTheDocument();
    expect(within(transcript).queryByRole('button', { name: 'Open reviewer' })).toBeNull();
  });
});
