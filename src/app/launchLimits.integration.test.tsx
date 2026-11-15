// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities, handleGetLaunchLimits, handleSetLaunchLimits } from '@gen/api/msw.gen';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

describe('the labels of a session (sessions.labels.v1)', () => {
  it('shows them on the list and the session, and filters the list by label', async () => {
    const user = userEvent.setup();
    visit('/sessions');
    const live = await screen.findByRole('link', { name: /claude-code · acme\/billing-api/ });
    expect(within(live).getByText('env=ci team=billing')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Labels' }), 'team=billing');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /codex/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /claude-code · acme\/billing-api/ })).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Labels' }));
    await user.type(screen.getByRole('textbox', { name: 'Labels' }), 'team');
    expect(await screen.findByText(/A label is key=value/)).toBeInTheDocument();
  });

  it('shows them on the session', async () => {
    visit('/sessions/ses-7f3a');
    const section = await screen.findByRole('region', { name: 'Labels' });
    expect(within(section).getByText('env=ci')).toBeInTheDocument();
    expect(within(section).getByText('team=billing')).toBeInTheDocument();
  });

  it('is not offered where the server keeps no labels', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'sessions.labels.v1'))),
      ),
    );
    visit('/sessions');
    await screen.findByRole('link', { name: /claude-code · acme\/billing-api/ });
    expect(screen.queryByRole('textbox', { name: 'Labels' })).toBeNull();
  });
});

describe('the limits of a launch (launches.limits.v1)', () => {
  it('lets an administrator cap the budget, the calls at once, and pause the launch', async () => {
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    const section = await screen.findByRole('region', { name: 'Limits of this launch' });
    const budget = await within(section).findByRole('textbox', { name: 'Budget, in USD (0 = no budget)' });
    expect(budget).toHaveValue('0');
    await user.clear(budget);
    await user.type(budget, '5.25');
    const concurrent = within(section).getByRole('spinbutton', { name: /Concurrent requests/ });
    await user.clear(concurrent);
    await user.type(concurrent, '2');
    await user.click(within(section).getByRole('checkbox', { name: /Paused/ }));
    await user.click(within(section).getByRole('button', { name: 'Save the limits' }));
    await waitFor(() => {
      expect(db.launchLimits['lch-7f3a']).toEqual({
        budgetMicros: 5_250_000,
        maxConcurrent: 2,
        paused: true,
        spentMicros: 0,
      });
    });
    expect(await screen.findByText('The limits apply from the next model call.')).toBeInTheDocument();
  });

  it('does not send a budget or a count out of range', async () => {
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    const section = await screen.findByRole('region', { name: 'Limits of this launch' });
    const save = within(section).getByRole('button', { name: 'Save the limits' });
    const budget = await within(section).findByRole('textbox', { name: /Budget/ });
    await user.clear(budget);
    await user.type(budget, 'lots');
    expect(save).toBeDisabled();
    await user.clear(budget);
    await user.type(budget, '1');
    const concurrent = within(section).getByRole('spinbutton', { name: /Concurrent requests/ });
    await user.clear(concurrent);
    await user.type(concurrent, '40');
    expect(save).toBeDisabled();
    expect(db.launchLimits['lch-7f3a']).toBeUndefined();
  });

  it('is not offered to a member who is not an administrator, nor where the server has no limits', async () => {
    setDemoRole(db, 'member');
    visit('/sessions/ses-7f3a');
    await screen.findByRole('region', { name: 'Who and where' });
    expect(screen.queryByRole('region', { name: 'Limits of this launch' })).toBeNull();
  });

  it('is hidden where the server has no launch limits', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'launches.limits.v1'))),
      ),
    );
    visit('/sessions/ses-7f3a');
    await screen.findByRole('region', { name: 'Who and where' });
    expect(screen.queryByRole('region', { name: 'Limits of this launch' })).toBeNull();
  });

  it('shows what was spent when the server says, holds the form while it saves, and says why a save failed', async () => {
    const user = userEvent.setup();
    server.use(
      handleGetLaunchLimits(() => HttpResponse.json({ budgetMicros: 0, maxConcurrent: 0, paused: false })),
      handleSetLaunchLimits(async () => {
        await delay(150);
        return HttpResponse.json(
          { error: { type: 'invalid_launch_limits', message: 'Out of range.' } },
          { status: 400 },
        );
      }),
    );
    visit('/sessions/ses-7f3a');
    const section = await screen.findByRole('region', { name: 'Limits of this launch' });
    expect(within(section).queryByText(/Spent so far/)).toBeNull();
    await user.click(within(section).getByRole('button', { name: 'Save the limits' }));
    expect(await within(section).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(await within(section).findByText('Out of range.')).toBeInTheDocument();
    expect(within(section).queryByText('The limits apply from the next model call.')).toBeNull();
  });

  it('sends nothing for a form that is not valid, even submitted by other means', async () => {
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    const section = await screen.findByRole('region', { name: 'Limits of this launch' });
    const budget = await within(section).findByRole('textbox', { name: /Budget/ });
    await user.clear(budget);
    await user.type(budget, 'lots');
    const form = section.querySelector('form');
    if (form === null) throw new Error('no form');
    fireEvent.submit(form);
    expect(db.launchLimits['lch-7f3a']).toBeUndefined();
    await user.clear(budget);
    await user.type(budget, '1');
    const concurrent = within(section).getByRole('spinbutton', { name: /Concurrent requests/ });
    await user.clear(concurrent);
    await user.type(concurrent, '99');
    fireEvent.submit(form);
    expect(db.launchLimits['lch-7f3a']).toBeUndefined();
  });
});
