// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities, handleGetPoolSize } from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { FRESH_SIGN_IN_MS } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

function writes(): string[] {
  const sent: string[] = [];
  traffic.onRequest((request) => {
    if (request.method === 'PUT' && new URL(request.url).pathname === '/api/v1/policy/pacing')
      void request
        .clone()
        .text()
        .then((body) => sent.push(body));
  });
  return sent;
}

describe('the pool size page (TeamCode’s automatic pool size and controller settings)', () => {
  it('shows the typed budget in force, then the automatic one once the switch is saved', async () => {
    const user = userEvent.setup();
    const sent = writes();
    visit('/pool-size');
    expect(await screen.findByText('In force: $25.00 a day (typed)')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Pool size' })).toBeVisible();
    expect(screen.getByText(/^Counted · \$38\.50 a day · bound by five_hour$/)).toBeVisible();
    expect(screen.getByText('No fresh reading')).toBeVisible();
    expect(screen.getByText(/claude-sonnet-4-5/)).toBeVisible();
    const save = screen.getByRole('button', { name: 'Save settings' });
    expect(save).toBeDisabled();

    await user.click(await screen.findByRole('checkbox', { name: 'Automatic pool size' }));
    await user.click(save);
    expect(await screen.findByText('In force: $38.50 a day (automatic)')).toBeVisible();
    // Only the changed field is sent: the other setting keeps its stored value.
    expect(sent).toEqual(['{"autoPoolSize":true}']);
    expect(screen.getByRole('checkbox', { name: 'Automatic pool size' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Observation only' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Observation only' }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('checkbox', { name: 'Observation only', checked: true })).toBeVisible();
    expect(db.pacingSettings).toEqual({ observationOnly: true, autoPoolSize: true });
  });

  it('asks for a recent sign-in when the write is refused', async () => {
    const user = userEvent.setup();
    db.signedInAt -= FRESH_SIGN_IN_MS + 1;
    visit('/pool-size');
    await user.click(await screen.findByRole('checkbox', { name: 'Automatic pool size' }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('link', { name: 'Sign in again' })).toBeVisible();
    expect(db.pacingSettings.autoPoolSize).toBe(false);
  });

  it('is for owners and admins, in the navigation where the server announces it', async () => {
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Pool size' })).toHaveAttribute('href', '/pool-size');
  });

  it('tells a member so and is not in their navigation', async () => {
    setDemoRole(db, 'member');
    visit('/pool-size');
    expect(await screen.findByText('Owners and admins only')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Pool size' })).toBeNull();
  });

  it('is not in the navigation where the server does not announce capacity.poolsize.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'capacity.poolsize.v1'))),
      ),
    );
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    await within(bar).findByRole('link', { name: 'Webhooks' });
    expect(within(bar).queryByRole('link', { name: 'Pool size' })).toBeNull();
  });
});

describe('the pool size report in its other states', () => {
  const base = {
    enabled: true,
    source: 'manual' as const,
    estimatedDailyMicros: 0,
    unpricedModels: ['gpt-x'],
    accounts: [],
    capacityDailyMicros: 0,
    capacityUnknownAccounts: 0,
    outsideUnknownAccounts: 0,
    models: [],
  };

  it('says why there is no automatic value, and what is unknown', async () => {
    server.use(
      handleGetPoolSize(() => HttpResponse.json({ ...base, reason: 'no_accounts' }, { status: 200 })),
    );
    visit('/pool-size');
    expect(await screen.findByText('No daily budget applies')).toBeVisible();
    expect(screen.getByText(/No shared subscription account/)).toBeVisible();
    expect(screen.getByText('No shared account.')).toBeVisible();
    expect(screen.getByText(/gpt-x/)).toBeVisible();
    expect(screen.getAllByText(/unknown/).length).toBeGreaterThan(0);
  });

  it('says when the automatic value is stale, and an account count it cannot size', async () => {
    server.use(
      handleGetPoolSize(() =>
        HttpResponse.json({
          ...base,
          manualDailyMicros: 5_000_000,
          effectiveDailyMicros: 5_000_000,
          capacityDailyMicros: 9_000_000,
          capacityUnknownAccounts: 2,
          outsideWeeklyMicros: 1_000_000,
          accounts: [
            {
              accountId: 'a',
              status: 'unavailable',
              dailyMicros: 0,
              capacityDailyMicros: 1,
              windows: [],
              usage: [],
            },
          ],
          models: [
            {
              provider: 'anthropic',
              model: 'm',
              inputTokens: 1,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              outputTokens: 1,
              unpricedTokens: 2,
            },
          ],
        }),
      ),
    );
    visit('/pool-size');
    expect(await screen.findByText(/missing or older than an hour/)).toBeVisible();
    expect(screen.getByText(/\$9\.00 a day, at least: 2 account/)).toBeVisible();
    expect(screen.getByText('Cannot serve')).toBeVisible();
    expect(screen.getByText('2 tokens, unpriced')).toBeVisible();
  });
});

describe('a server that serves the pool size without the controller settings', () => {
  it('shows the report without the switches', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'capacity.pacing.v1'))),
      ),
    );
    visit('/pool-size');
    expect(await screen.findByText('In force: $25.00 a day (typed)')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Automatic pool size' })).toBeNull();
  });
});

describe('a pool whose capacity is fully learned', () => {
  it('shows a counted account without a binding window, and the saving state', async () => {
    const user = userEvent.setup();
    server.use(
      handleGetPoolSize(() =>
        HttpResponse.json({
          enabled: false,
          source: 'manual',
          effectiveDailyMicros: 1_000_000,
          estimatedDailyMicros: 2_000_000,
          unpricedModels: [],
          capacityDailyMicros: 4_000_000,
          capacityUnknownAccounts: 0,
          outsideUnknownAccounts: 0,
          models: [],
          accounts: [
            {
              accountId: 'a',
              status: 'counted',
              dailyMicros: 2_000_000,
              capacityDailyMicros: 4_000_000,
              windows: [],
              usage: [],
            },
          ],
        }),
      ),
      http.put('*/api/v1/policy/pacing', async () => {
        await delay(50);
        return HttpResponse.json({ observationOnly: false, autoPoolSize: true });
      }),
    );
    visit('/pool-size');
    expect(await screen.findByText(/^Counted · \$2\.00 a day$/)).toBeVisible();
    expect(screen.getByText('$4.00 a day')).toBeVisible();
    await user.click(await screen.findByRole('checkbox', { name: 'Automatic pool size' }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

describe('the organization daily limit on /spend', () => {
  it('shows the typed limit, then the automatic one once it is on', async () => {
    visit('/spend');
    expect(await screen.findByText(/\$25\.00 a day, as typed/)).toBeVisible();
    db.pacingSettings.autoPoolSize = true;
    visit('/spend');
    expect(await screen.findByText(/\$38\.50 a day, sized automatically/)).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Pool size' }).length).toBeGreaterThan(0);
  });

  it('is not shown to a member nor where the server does not announce it', async () => {
    setDemoRole(db, 'member');
    visit('/spend');
    await screen.findByRole('heading', { level: 1, name: /Spend/ });
    expect(screen.queryByText('Organization daily limit')).toBeNull();
  });
});
