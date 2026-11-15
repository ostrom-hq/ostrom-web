// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities, handleGetForecasts } from '@gen/api/msw.gen';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

/** The forecasts the console asks for from now on, by their query. */
function watch(): string[] {
  const asked: string[] = [];
  traffic.onRequest((request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/forecasts') asked.push(url.search);
  });
  return asked;
}

function card(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

function fact(region: HTMLElement, label: string): string | null | undefined {
  return within(region).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}

async function shown(): Promise<void> {
  await screen.findByRole('region', { name: 'five_hour' });
}

describe('the forecasts screen (TeamCode’s Forecasts page)', { timeout: 20_000 }, () => {
  it('shows one card per window of the first account, with its state, chart and what was learned', async () => {
    visit('/forecasts');
    await shown();
    expect(screen.getByRole('heading', { level: 1, name: 'Forecasts' })).toBeVisible();
    const picker = screen.getByRole('combobox', { name: 'Subscription account' });
    expect(picker).toHaveValue('acc-1');
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Maya’s Claude Max · claude', 'Theo’s ChatGPT Pro · codex', 'Team Max (TeamCode) · claude']);
    expect(screen.getByText(/^Snapshot: .* · claude · ready$/)).toBeVisible();
    expect(screen.getByText('How to read these charts')).toBeVisible();
    expect(screen.getByText(/The threshold is the account’s ceiling, 95%/)).toBeInTheDocument();

    const five = card('five_hour');
    expect(within(five).getByText('Threshold before the reset')).toBeVisible();
    expect(five).toHaveTextContent('62% used');
    expect(within(five).getByRole('img', { name: 'five_hour: readings and projection' })).toBeVisible();
    // A reset in the past hour: two lines, never joined; the projection reaches the threshold.
    expect(within(five).getAllByTestId('measured')).toHaveLength(2);
    expect(within(five).getByTestId('projection')).toBeInTheDocument();
    expect(within(five).getByTestId('threshold')).toBeInTheDocument();
    expect(within(five).getByText('Threshold 95%')).toBeInTheDocument();
    expect(fact(five, 'Recent speed')).toBe('60 percentage points per hour');
    expect(fact(five, 'Reaches the threshold')).toMatch(/^Around /);
    expect(fact(five, 'Latest continuous segment')).toBe('31 readings over 1,800 s');
    // The table view of the chart: every reading, by segment.
    const table = within(five).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(42);
    expect(within(table).getAllByRole('row')[41]).toHaveTextContent(/^2.*62%$/);
    expect(within(card('model:opus')).getAllByRole('row')).toHaveLength(3);

    const week = card('seven_day');
    expect(within(week).getByText('Reset before the threshold')).toBeVisible();
    expect(within(week).getByTestId('projection')).toBeInTheDocument();
    expect(fact(week, 'Reaches the threshold')).toBe('The reset comes first');

    // No rate yet: said in words, no projection, no reset invented.
    const opus = card('model:opus');
    expect(within(opus).getByText('Rate unknown')).toBeVisible();
    expect(within(opus).queryByTestId('projection')).toBeNull();
    expect(fact(opus, 'Reset')).toBe('Unknown');
    expect(fact(opus, 'Recent speed')).toBe('Unknown');
    expect(fact(opus, 'Reaches the threshold')).toBe('Unknown');
    expect(fact(opus, 'Latest continuous segment')).toBe('2 readings over 60 s');
  });

  it('switches account from the picker and keeps it in the address; idle is not unknown, exhausted is said', async () => {
    const user = userEvent.setup();
    const asked = watch();
    const router = visit('/forecasts');
    await shown();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Subscription account' }), 'acc-2');
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ account: 'acc-2' });
    });
    await waitFor(() => {
      expect(screen.getByText('Idle: no measured burn')).toBeVisible();
    });
    expect(asked).toContain('?account=acc-2');
    expect(screen.getByText(/^Snapshot: .* · codex · disabled · Paused$/)).toBeVisible();
    const five = card('five_hour');
    expect(fact(five, 'Recent speed')).toBe('Idle (0 points per hour)');
    expect(within(five).queryByTestId('projection')).toBeNull();
    const week = card('seven_day');
    expect(within(week).getByText('Exhausted: threshold reached')).toBeVisible();
    expect(fact(week, 'Reaches the threshold')).toBe('Already at the threshold');
    expect(within(week).queryByTestId('projection')).toBeNull();
    expect(fact(week, 'Latest continuous segment')).toBe('6 readings over 300 s');
  });

  it('says when an account has no window read yet, and when nothing is shared', async () => {
    db.sharedAccounts = db.sharedAccounts.map((account) =>
      account.id === 'acc-3' ? { ...account, email: 'team@acme.dev' } : account,
    );
    visit('/forecasts?account=acc-3');
    expect(await screen.findByText('No window read yet')).toBeVisible();
    expect(
      screen.getByRole('option', { name: 'Team Max (TeamCode) (team@acme.dev) · claude' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says that no subscription is shared yet, with an empty picker', async () => {
    db.sharedAccounts = [];
    visit('/forecasts');
    expect(await screen.findByText('No shared subscription yet')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Subscription account' })).toBeDisabled();
  });

  it('flags a truncated answer, and a window without readings or with an unknown state', async () => {
    db.forecastsTruncated = true;
    const [first] = db.forecastWindows['acc-1'] ?? [];
    if (first === undefined) throw new Error('no window');
    db.forecastWindows['acc-1'] = [
      { ...first, window: 'empty', segments: [] },
      { ...first, window: 'odd', state: 'throttled' },
      {
        ...first,
        window: 'late',
        state: 'exhausts_first',
        reachesThresholdAt: undefined,
        learningSamples: 1,
      },
    ].map(({ reachesThresholdAt, ...rest }) =>
      reachesThresholdAt === undefined ? rest : { ...rest, reachesThresholdAt },
    );
    visit('/forecasts');
    expect(await screen.findByText(/Only a bounded part of the accounts/)).toBeVisible();
    expect(within(card('empty')).getByText('No reading in the past hour.')).toBeVisible();
    expect(within(card('empty')).queryByRole('table')).toBeNull();
    expect(within(card('odd')).getByText('Rate unknown')).toBeVisible();
    expect(within(card('odd')).queryByTestId('projection')).toBeNull();
    expect(fact(card('late'), 'Reaches the threshold')).toBe('Unknown');
    expect(fact(card('late'), 'Latest continuous segment')).toBe('1 reading over 1,800 s');
  });

  it('shows the reading under the pointer, and the hint again when it leaves', async () => {
    visit('/forecasts');
    await shown();
    const five = card('five_hour');
    const svg = within(five).getByRole('img');
    const hit = within(five).getByTestId('hit');
    expect(within(five).getByText('Hover the chart for a reading.')).toBeInTheDocument();
    // jsdom lays nothing out: a zero-width chart shows nothing.
    fireEvent.pointerMove(hit, { clientX: 300 });
    expect(within(five).getByText('Hover the chart for a reading.')).toBeInTheDocument();
    svg.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 640, height: 220 });
    // « Now », where the latest reading is: 62 %.
    fireEvent.pointerMove(hit, { clientX: 334 });
    expect(within(five).getByText(/^62% at /, { selector: 'figcaption' })).toBeInTheDocument();
    expect(svg.querySelectorAll('circle[r="4"]')).toHaveLength(1);
    fireEvent.pointerLeave(hit);
    expect(svg.querySelectorAll('circle[r="4"]')).toHaveLength(0);
    expect(within(five).getByText('Hover the chart for a reading.')).toBeInTheDocument();
  });

  it('reads the forecasts again every 15 seconds, until paused, and on Refresh now', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'], shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      visit('/forecasts');
      await shown();
      const asked = watch();
      expect(screen.getByRole('status')).toHaveTextContent('Live updates on');
      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      await waitFor(() => {
        expect(asked).toHaveLength(1);
      });
      await user.click(screen.getByRole('button', { name: 'Pause live updates' }));
      expect(screen.getByRole('status')).toHaveTextContent('Live updates paused');
      await act(async () => vi.advanceTimersByTimeAsync(45_000));
      expect(asked).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Refresh now' }));
      await waitFor(() => {
        expect(asked).toHaveLength(2);
      });
      await user.click(screen.getByRole('button', { name: 'Resume live updates' }));
      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      await waitFor(() => {
        expect(asked).toHaveLength(3);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('never shows another organization’s account: an unknown id is said, with a way back to the first', async () => {
    const user = userEvent.setup();
    const router = visit('/forecasts?account=acc-of-globex');
    expect(await screen.findByText('No such account')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'five_hour' })).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Show the first account' }));
    await shown();
    expect(router.state.location.search).toEqual({});
  });

  it('says why the forecasts could not be read', async () => {
    server.use(
      handleGetForecasts(() =>
        HttpResponse.json({ error: { type: 'internal', message: 'Down.' } }, { status: 500 }),
      ),
    );
    visit('/forecasts');
    expect(await screen.findByText('Down.')).toBeVisible();
  });

  it('is for owners and admins: a member is told so and nothing is asked', async () => {
    setDemoRole(db, 'member');
    const asked = watch();
    visit('/forecasts');
    expect(await screen.findByText('Owners and admins only')).toBeVisible();
    expect(asked).toEqual([]);
  });

  it('shows the same when the server refuses (403)', async () => {
    server.use(
      handleGetForecasts(() =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'No.' } }, { status: 403 }),
      ),
    );
    visit('/forecasts');
    expect(await screen.findByText('Owners and admins only')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pause live updates' })).toBeNull();
  });

  it('is in the navigation for an owner or an admin where the server announces it, never for a member', async () => {
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Forecasts' })).toHaveAttribute('href', '/forecasts');
  });

  it('is not in the navigation of a member', async () => {
    setDemoRole(db, 'member');
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    await within(bar).findByRole('link', { name: 'Requests' });
    await waitFor(() => {
      expect(within(bar).queryByRole('link', { name: 'Webhooks' })).toBeNull();
    });
    expect(within(bar).queryByRole('link', { name: 'Forecasts' })).toBeNull();
  });

  it('is not in the navigation where the server does not announce capacity.forecasts.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'capacity.forecasts.v1'))),
      ),
    );
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    await within(bar).findByRole('link', { name: 'Webhooks' });
    expect(within(bar).queryByRole('link', { name: 'Forecasts' })).toBeNull();
  });
});
