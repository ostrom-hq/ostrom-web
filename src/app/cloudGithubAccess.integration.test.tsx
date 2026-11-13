// SPDX-License-Identifier: AGPL-3.0-only
import { handleCapabilities } from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function row(text: string | RegExp): HTMLElement {
  const found = screen.getByText(text).closest('li');
  if (found === null) throw new Error(`no row ${String(text)}`);
  return found;
}

describe('the GitHub access of a cloud session', () => {
  it('lets the owner choose who may instruct the agent, and explains each choice', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    const choice = within(mine).getByRole('combobox', { name: 'GitHub access' });
    expect(choice).toHaveValue('owner');
    expect(within(mine).getByText(/only the owner may instruct it/)).toBeInTheDocument();
    await user.selectOptions(choice, 'shared');
    expect(await within(mine).findByText(/lends it to anyone who instructs it/)).toBeInTheDocument();
    expect(db.cloudSessions.find((session) => session.id === 'cs-31')?.githubAccess).toBe('shared');
    // The same choice again sends nothing new.
    await user.selectOptions(within(row('Fix the flaky invoice test')).getByRole('combobox'), 'shared');
    expect(within(row('Fix the flaky invoice test')).getByRole('combobox')).toHaveValue('shared');
  });

  it('asks to pause the session first to turn the access off', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.selectOptions(within(mine).getByRole('combobox'), 'none');
    expect(await within(mine).findByRole('alert')).toHaveTextContent('Pause the session first');
    expect(within(mine).getByRole('combobox')).toHaveValue('owner');
  });

  it('turns the access off once the session is paused', async () => {
    const user = userEvent.setup();
    db.cloudSessions = db.cloudSessions.map((session) =>
      session.id === 'cs-31' ? { ...session, status: 'paused' } : session,
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    await user.selectOptions(within(row('Fix the flaky invoice test')).getByRole('combobox'), 'none');
    expect(
      await within(row('Fix the flaky invoice test')).findByText('The agent holds no GitHub access.'),
    ).toBeInTheDocument();
  });

  it('holds the choice while the server has not answered', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/cloud/sessions/:id/github', async () => {
        await delay('infinite');
        return new HttpResponse(null);
      }),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    await user.selectOptions(within(row('Fix the flaky invoice test')).getByRole('combobox'), 'shared');
    expect(within(row('Fix the flaky invoice test')).getByRole('combobox')).toBeDisabled();
    expect(within(row('codex · cs-30')).queryByRole('combobox')).toBeNull();
  });

  it('says any other refusal as the server wrote it', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/cloud/sessions/:id/github', () =>
        HttpResponse.json(
          { error: { type: 'github_owner_only', message: 'Only the owner.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    await user.selectOptions(within(row('Fix the flaky invoice test')).getByRole('combobox'), 'shared');
    expect(await within(row('Fix the flaky invoice test')).findByRole('alert')).toHaveTextContent(
      'Only the owner.',
    );
  });

  it('shows another person’s session as read-only, and none for a session that ended', async () => {
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const theirs = row('codex · cs-30');
    expect(within(theirs).queryByRole('combobox')).toBeNull();
    expect(within(theirs).getByText('GitHub access: Owner only')).toBeInTheDocument();
    expect(within(row('Upgrade the API client')).queryByText(/GitHub access/)).toBeNull();
  });

  it('is absent from a server without runners.cloud.github.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'runners.cloud.github.v1')),
        ),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    expect(screen.queryByText('GitHub access')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'GitHub access' })).toBeNull();
  });
});
