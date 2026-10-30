// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
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
      http.get('*/api/v1/sessions', () =>
        HttpResponse.json({
          items: [{ id: 'ses-x', agent: 'shell', dev: 'lena', startedAt: '2026-10-30T07:59:00.000Z' }],
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
