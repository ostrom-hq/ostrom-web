// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { setupMockApp, visit } from '@/test/mockApp';

const { server } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

beforeEach(() => {
  // Only the clock: React Query, MSW and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-30T08:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

/** The line of the list that holds `link`. */
function lineOf(link: HTMLElement): HTMLElement {
  const line = link.closest('li');
  if (line === null) throw new Error('the link is not in a line');
  return line;
}

describe('the sessions list', () => {
  it('shows open sessions with how alive they are, then the ended ones with how long they ran', async () => {
    visit('/sessions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sessions' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '2 open' })).toBeInTheDocument();

    const live = screen.getByRole('link', { name: /claude-code · acme\/billing-api/ });
    expect(live).toHaveAttribute('href', '/sessions/ses-7f3a');
    expect(within(live).getByText('Live')).toBeInTheDocument();
    expect(within(live).getByText('theo · claude-opus-5-5')).toBeInTheDocument();
    expect(within(live).getByText(/^since /)).toBeInTheDocument();

    const quiet = screen.getByRole('link', { name: /codex/ });
    expect(within(quiet).getByText('Quiet')).toBeInTheDocument();
    expect(within(quiet).getByText('maya')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Ended' })).toBeInTheDocument();
    const ended = screen.getByRole('link', { name: /acme\/web/ });
    expect(within(ended).getByText('2 hr 29 min')).toBeInTheDocument();
  });

  it('says when no agent is working and hides an empty ended list', async () => {
    server.use(http.get('*/api/v1/sessions', () => HttpResponse.json({ items: [] })));
    visit('/sessions');
    expect(await screen.findByText('No agent is working right now')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ended' })).toBeNull();
  });

  it('reads a session that carries only what the contract requires', async () => {
    server.use(
      http.get('*/api/v1/sessions', ({ request }) =>
        HttpResponse.json({
          items:
            new URL(request.url).searchParams.get('open') === 'true'
              ? [{ id: 'ses-x', agent: 'shell', dev: 'lena', startedAt: '2026-10-30T07:59:00.000Z' }]
              : [],
        }),
      ),
    );
    visit('/sessions');
    const row = await screen.findByRole('link', { name: /shell/ });
    expect(within(row).getByText('shell')).toBeInTheDocument();
    expect(within(row).getByText('lena')).toBeInTheDocument();
  });

  it('shows the shape of the list while it loads', async () => {
    server.use(http.get('*/api/v1/sessions', never));
    visit('/sessions');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says the server does not answer', async () => {
    server.use(http.get('*/api/v1/sessions', () => HttpResponse.error()));
    visit('/sessions');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says why the list does not come, whichever half fails', async () => {
    server.use(
      http.get('*/api/v1/sessions', ({ request }) =>
        new URL(request.url).searchParams.get('open') === 'false'
          ? HttpResponse.json({ error: { type: 'internal', message: 'ended list down' } }, { status: 500 })
          : HttpResponse.json({ items: [] }),
      ),
    );
    visit('/sessions');
    expect(await screen.findByText('ended list down', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('the older ended sessions', () => {
  const ended = (id: string): Record<string, string> => ({
    id,
    agent: 'shell',
    dev: 'lena',
    repo: `acme/${id}`,
    startedAt: '2026-10-29T08:00:00.000Z',
    endedAt: '2026-10-29T09:00:00.000Z',
  });
  /** Open sessions: none; ended ones: a first page that says there is more, and `older` for the next one. */
  const paged = (older: Parameters<typeof http.get>[1]): void => {
    server.use(
      http.get('*/api/v1/sessions', async (info) => {
        const query = new URL(info.request.url).searchParams;
        if (query.get('open') === 'true') return HttpResponse.json({ items: [] });
        if (query.get('before') === null)
          return HttpResponse.json({ items: [ended('ses-new')], next: 'ses-new' });
        return older(info);
      }),
    );
  };

  it('come a page at a time, when asked, and the button leaves once the last page is read', async () => {
    paged(({ request }) => {
      expect(new URL(request.url).searchParams.get('before')).toBe('ses-new');
      return HttpResponse.json({ items: [ended('ses-old')] });
    });
    visit('/sessions');
    expect(await screen.findByRole('link', { name: /acme\/ses-new/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /acme\/ses-old/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show older sessions' }));
    expect(await screen.findByRole('link', { name: /acme\/ses-old/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acme\/ses-new/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show older sessions' })).toBeNull();
  });

  it('say they are loading while the next page comes', async () => {
    paged(never);
    visit('/sessions');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show older sessions' }));
    expect(await screen.findByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('say why they did not come, and what was read stays', async () => {
    paged(() =>
      HttpResponse.json({ error: { type: 'internal', message: 'older page down' } }, { status: 500 }),
    );
    visit('/sessions');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show older sessions' }));
    expect(await screen.findByText('older page down', {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acme\/ses-new/ })).toBeInTheDocument();
    // The older page's warning only: the sessions already read are not replaced by a failure.
    expect(screen.getAllByText('Offline')).toHaveLength(1);
  });

  it('keep the older page’s failure under the list while the list is read again', async () => {
    let readAgain = false;
    server.use(
      http.get('*/api/v1/sessions', async ({ request }) => {
        const query = new URL(request.url).searchParams;
        if (query.get('open') === 'true') return HttpResponse.json({ items: [] });
        if (query.get('before') !== null)
          return HttpResponse.json(
            { error: { type: 'internal', message: 'older page down' } },
            { status: 500 },
          );
        if (screen.queryByText('older page down') === null)
          return HttpResponse.json({ items: [ended('ses-new')], next: 'ses-new' });
        // The next poll: it stays on its way, as long as the screen is read.
        readAgain = true;
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/sessions');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show older sessions' }));
    expect(await screen.findByText('older page down', {}, { timeout: 4_000 })).toBeInTheDocument();
    // The list is stale past its poll: coming back to the window reads it again, as the poll would.
    vi.setSystemTime(new Date('2026-10-30T08:00:20.000Z'));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.waitFor(() => {
      expect(readAgain).toBe(true);
    });
    expect(screen.getByText('older page down')).toBeInTheDocument();
    expect(screen.getAllByText('Offline')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /acme\/ses-new/ })).toBeInTheDocument();
  });
});

describe('a session', () => {
  it('shows who ran it, when, what it did, and the requests it raised', async () => {
    visit('/sessions/ses-7f3a');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'claude-code · acme/billing-api' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Started by theo')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();

    const who = screen.getByRole('region', { name: 'Who and where' });
    expect(who).toHaveTextContent('Developertheo, verified');
    expect(who).toHaveTextContent('Signed in withgithub');
    const when = screen.getByRole('region', { name: 'When' });
    expect(when).toHaveTextContent(/Last report.*2026/);
    expect(when).not.toHaveTextContent('Ended');
    const what = screen.getByRole('region', { name: 'What it did' });
    expect(what).toHaveTextContent('Tool calls214');
    expect(what).toHaveTextContent('Model cost$3.42');
    expect(within(what).getByRole('link', { name: 'apr-merge-412' })).toHaveAttribute(
      'href',
      '/yes/apr-merge-412',
    );
    expect(screen.getByText('The receipt is signed when the session ends.')).toBeInTheDocument();
  });

  it('shows who answered each request it raised, and the receipt of the answer once signed', async () => {
    server.use(
      http.get('*/api/v1/sessions/:id', () =>
        HttpResponse.json({
          session: {
            id: 'ses-g',
            agent: 'claude-code',
            dev: 'lena',
            startedAt: '2026-10-30T07:00:00.000Z',
            gates: ['gate-yes', 'gate-no', 'gate-wait'],
            gateAnswers: [
              {
                gateId: 'gate-yes',
                actionClass: 'push-main',
                outcome: 'approved',
                by: 'ben',
                at: '2026-10-30T07:10:00.000Z',
                receiptId: 'rcpt-gate-yes',
              },
              {
                gateId: 'gate-no',
                actionClass: 'deploy-prod',
                outcome: 'refused',
                by: 'ada',
                at: '2026-10-30T07:20:00.000Z',
              },
            ],
          },
        }),
      ),
    );
    visit('/sessions/ses-g');
    const what = await screen.findByRole('region', { name: 'What it did' });
    expect(what).toHaveTextContent('3 requests for a person');
    expect(within(what).getAllByRole('listitem')).toHaveLength(3);
    const yes = lineOf(within(what).getByRole('link', { name: 'push-main' }));
    expect(yes).toHaveTextContent(/^Approvedpush-mainby ben, .*2026.*Receipt$/);
    expect(within(yes).getByRole('link', { name: 'push-main' })).toHaveAttribute('href', '/yes/gate-yes');
    expect(within(yes).getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      '/receipts/rcpt-gate-yes',
    );
    const no = lineOf(within(what).getByRole('link', { name: 'deploy-prod' }));
    expect(no).toHaveTextContent(/^Refuseddeploy-prodby ada, .*2026/);
    expect(within(no).queryByRole('link', { name: 'Receipt' })).toBeNull();
    const wait = lineOf(within(what).getByRole('link', { name: 'gate-wait' }));
    expect(wait).toHaveTextContent('Waitinggate-wait');
    expect(within(wait).getByRole('link', { name: 'gate-wait' })).toHaveAttribute('href', '/yes/gate-wait');
  });

  it('says a request of an ended session nobody answered was not answered, never that it waits', async () => {
    server.use(
      http.get('*/api/v1/sessions/:id', () =>
        HttpResponse.json({
          session: {
            id: 'ses-done',
            agent: 'claude-code',
            dev: 'lena',
            startedAt: '2026-10-30T07:00:00.000Z',
            endedAt: '2026-10-30T08:00:00.000Z',
            gates: ['gate-left'],
            gateAnswers: [],
          },
        }),
      ),
    );
    visit('/sessions/ses-done');
    const what = await screen.findByRole('region', { name: 'What it did' });
    const left = lineOf(within(what).getByRole('link', { name: 'gate-left' }));
    expect(left).toHaveTextContent('Not answeredgate-left');
    expect(left).not.toHaveTextContent('Waiting');
  });

  it('shows an ended session with its duration, where it resumed from and its receipt', async () => {
    visit('/sessions/ses-2b9e');
    const when = await screen.findByRole('region', { name: 'When' });
    expect(when).toHaveTextContent(/Ended.*ran 2 hr 29 min/);
    expect(when).toHaveTextContent('Ended bysamir');
    expect(when).toHaveTextContent('Segment2');
    expect(within(when).getByRole('link', { name: 'ses-2b9d' })).toHaveAttribute(
      'href',
      '/sessions/ses-2b9d',
    );
    expect(screen.getByRole('region', { name: 'Who and where' })).toHaveTextContent('Developersamir');
    expect(screen.getByRole('region', { name: 'What it did' })).toHaveTextContent('Exit code0');
    expect(screen.getByRole('link', { name: 'Open receipt rcpt-ses-2b9e' })).toHaveAttribute(
      'href',
      '/receipts/rcpt-ses-2b9e',
    );
  });

  it('reads a session with only what the contract requires', async () => {
    server.use(
      http.get('*/api/v1/sessions/:id', () =>
        HttpResponse.json({
          session: { id: 'ses-x', agent: 'shell', dev: 'lena', startedAt: '2026-10-30T07:00:00.000Z' },
        }),
      ),
    );
    visit('/sessions/ses-x');
    expect(await screen.findByRole('heading', { level: 1, name: 'shell' })).toBeInTheDocument();
    expect(screen.getByText('Quiet')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What it did' })).not.toHaveTextContent('Tool calls');
    expect(screen.queryByRole('heading', { name: /request/ })).toBeNull();
  });

  it('says when the session does not exist', async () => {
    visit('/sessions/nope');
    expect(await screen.findByText('session not found')).toBeInTheDocument();
  });
});
