// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { zCloudAgentKind, zCreateCloudSessionBody } from '@gen/api/zod.gen';
import { knownValues } from '@/shared/lib/openEnum';
import { setupMockApp, visit } from '@/test/mockApp';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const { server, db, traffic } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

function asMember(): void {
  db.members = db.members.map((member) => (member.login === 'maya' ? { ...member, role: 'member' } : member));
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

function row(text: string | RegExp): HTMLElement {
  const found = screen.getByText(text).closest('li');
  if (found === null) throw new Error(`no row ${String(text)}`);
  return found;
}

async function card(name: string): Promise<HTMLElement> {
  const found = (await screen.findByRole('heading', { level: 3, name }, { timeout: 4_000 })).closest(
    'article',
  );
  if (found === null) throw new Error(`no automation ${name}`);
  return found;
}

describe('the cloud agents', () => {
  it('lists the sessions with their state and the runners', async () => {
    visit('/cloud');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cloud agents' })).toBeInTheDocument();
    await screen.findByText('Fix the flaky invoice test');
    const running = row('Fix the flaky invoice test');
    expect(running).toHaveTextContent(/maya · Claude Code · claude-sonnet-5 · started .*/);
    expect(within(running).getByText('Running')).toBeInTheDocument();
    const queued = row('codex · cs-30');
    expect(queued).toHaveTextContent('started by an automation');
    expect(within(queued).getByText('Queued')).toBeInTheDocument();
    expect(row('Upgrade the API client')).toHaveTextContent(/ended /);
    expect(within(row('codex · cs-25')).getByText('Failed')).toBeInTheDocument();
    const runners = within(screen.getByRole('region', { name: 'Runners' })).getAllByRole('listitem');
    expect(runners[0]).toHaveTextContent(/eu-west-1a.*linux, x64, docker · v0\.4\.2 · seen /);
    expect(runners[0]).toHaveTextContent('Online');
    expect(runners[1]).toHaveTextContent('Offline');
    expect(runners[1]).not.toHaveTextContent(' v');
  });

  it('shows an agent and a status it has no words for as is, and a runner never seen', async () => {
    db.cloudSessions = [
      { id: 'cs-x', owner: 'maya', agent: 'aider', status: 'paused', createdAt: '2026-10-30T07:00:00.000Z' },
    ];
    db.runners = [{ id: 'r', name: 'r', labels: [], status: 'draining' }];
    visit('/cloud');
    expect(await screen.findByText('aider · cs-x')).toBeInTheDocument();
    expect(row('aider · cs-x')).toHaveTextContent(/maya · aider · started/);
    expect(within(row('aider · cs-x')).getByText('paused')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Runners' })).getByText('never seen'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('starts an agent once there is something to do, then clears the form', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    const start = within(form).getByRole('button', { name: 'Start the agent' });
    expect(start).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'Bump the SDK');
    await user.type(within(form).getByRole('textbox', { name: 'Repository' }), 'acme/web');
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'SDK bump');
    const agent = within(form).getByRole('combobox', { name: 'Agent' });
    await user.selectOptions(agent, 'codex');
    // A name outside the contract's agents is never taken.
    fireEvent.change(agent, { target: { value: 'claude-code' } });
    await user.click(start);
    expect(await screen.findByText('SDK bump')).toBeInTheDocument();
    expect(row('SDK bump')).toHaveTextContent('maya · Codex');
    expect(within(form).getByRole('textbox', { name: 'What should it do?' })).toHaveValue('');
  });

  it('offers only the contract’s agents that follow a prompt, and sends one of them', async () => {
    const user = userEvent.setup();
    const sent: Promise<string>[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/v1/cloud/sessions')
        sent.push(request.clone().text());
    });
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    const agent = within(form).getByRole('combobox', { name: 'Agent' });
    // Read from the generated client: an agent the server would refuse is never offered; the plain shell, which only
    // a terminal drives, is not started from here.
    const offered = within(agent)
      .getAllByRole<HTMLOptionElement>('option')
      .map((option) => option.value);
    expect(offered).toEqual(knownValues(zCloudAgentKind).filter((name) => name !== 'shell'));
    expect(offered.every((name) => zCloudAgentKind.safeParse(name).success)).toBe(true);
    expect(agent).toHaveValue('claude');
    await user.selectOptions(agent, 'Gemini CLI');
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'Look around');
    await user.click(within(form).getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByText('gemini · cs-104')).toBeInTheDocument();
    const bodies = await Promise.all(sent);
    expect(bodies).toHaveLength(1);
    const body: unknown = JSON.parse(bodies.join(''));
    // The body the server reads, with the contract's enum: a name outside it would fail here.
    expect(zCreateCloudSessionBody.parse(body)).toMatchObject({ agent: 'gemini', prompt: 'Look around' });
  });

  it('starts an agent without a name or a repository', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'Look around');
    await user.click(within(form).getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByText('claude · cs-104')).toBeInTheDocument();
  });

  it('holds the form while the agent starts, and says why it did not', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/cloud/sessions', async () => delay('infinite')));
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'x');
    await user.click(within(form).getByRole('button', { name: 'Start the agent' }));
    expect(within(form).getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('says why the agent did not start', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/sessions', () =>
        HttpResponse.json({ error: { type: 'capacity', message: 'no runner online' } }, { status: 409 }),
      ),
    );
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    await user.type(within(form).getByRole('textbox', { name: 'What should it do?' }), 'x');
    await user.click(within(form).getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no runner online');
  });

  it('stops a running session after a second click that names it', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const running = row('Fix the flaky invoice test');
    await user.click(within(running).getByRole('button', { name: 'Stop' }));
    await user.click(within(running).getByRole('button', { name: 'Keep it running' }));
    await user.click(within(running).getByRole('button', { name: 'Stop' }));
    await user.click(within(running).getByRole('button', { name: 'Stop Fix the flaky invoice test' }));
    expect(await within(row('Fix the flaky invoice test')).findByText('Stopped')).toBeInTheDocument();
    expect(within(row('Fix the flaky invoice test')).queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('holds the stop while it is sent', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/cloud/sessions/:id', async () => delay('infinite')));
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const running = row('Fix the flaky invoice test');
    await user.click(within(running).getByRole('button', { name: 'Stop' }));
    await user.click(within(running).getByRole('button', { name: /^Stop Fix/ }));
    expect(within(running).getByRole('button', { name: 'Stop' })).toBeDisabled();
  });

  it('lets a member stop only their own sessions', async () => {
    asMember();
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    expect(
      within(row('Fix the flaky invoice test')).getByRole('button', { name: 'Stop' }),
    ).toBeInTheDocument();
    expect(within(row('codex · cs-30')).queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('says when there is no session and no runner', async () => {
    db.cloudSessions = [];
    db.runners = [];
    visit('/cloud');
    expect(await screen.findByText('No cloud session yet.')).toBeInTheDocument();
    expect(await screen.findByText(/No runner yet/)).toBeInTheDocument();
  });

  it('shows the shape of the list while it loads, without runners yet', async () => {
    server.use(http.get('*/api/v1/cloud/sessions', never), http.get('*/api/v1/runners', never));
    visit('/cloud');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Runners' })).toBeNull();
  });
});

describe('the automations', () => {
  it('says what starts each automation, what it does and its limits', async () => {
    visit('/automations');
    const nightly = await card('Nightly dependency upgrades');
    expect(nightly).toHaveTextContent('On');
    expect(nightly).toHaveTextContent('Starts on a schedule: 0 3 * * 1-5 · Europe/Paris');
    expect(nightly).toHaveTextContent('Codex: Upgrade the dependencies');
    expect(nightly).toHaveTextContent(
      'by theo · version 4 · at most 1 run a day · stops after 45 min · skips a run while the last one works',
    );
    const sentry = await card('Triage new Sentry issues');
    expect(sentry).toHaveTextContent('Off');
    expect(sentry).toHaveTextContent('Starts on a signed webhook');
    expect(sentry).toHaveTextContent('Runs the workflow wf-backend');
    expect(sentry).toHaveTextContent('by maya · version 1');
    expect(sentry).toHaveTextContent('https://api.ostrom.run/api/v1/automations/au-sentry/trigger');
    expect(within(nightly).queryByRole('button', { name: 'New webhook secret' })).toBeNull();
  });

  it('reads an automation without a schedule, an agent or a prompt', async () => {
    db.automations = [
      {
        id: 'au-x',
        name: 'Bare',
        owner: 'maya',
        enabled: true,
        trigger: { kind: 'cron' },
        action: {},
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'au-y',
        name: 'Other agent',
        owner: 'maya',
        enabled: true,
        trigger: { kind: 'cron', cron: '@hourly' },
        action: { agent: 'gemini', prompt: 'Hi' },
        overlap: 'queue',
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];
    visit('/automations');
    const bare = await card('Bare');
    expect(bare).toHaveTextContent('Starts on a schedule:');
    expect(bare).toHaveTextContent('The default agent:');
    const other = await card('Other agent');
    expect(other).toHaveTextContent('Starts on a schedule: @hourly');
    expect(other).toHaveTextContent('Gemini CLI: Hi');
    expect(other).not.toHaveTextContent('skips');
  });

  it('turns an automation on and off', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(await within(sentry).findByRole('button', { name: 'Turn on' }));
    expect(await within(sentry).findByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    await user.click(within(sentry).getByRole('button', { name: 'Turn off' }));
    expect(await within(sentry).findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('runs one now, then shows the new run in its runs', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const nightly = await card('Nightly dependency upgrades');
    await user.click(within(nightly).getByRole('button', { name: 'Show the runs' }));
    expect(await within(nightly).findAllByRole('listitem')).toHaveLength(2);
    expect(
      within(nightly).getByText('The plan’s agent hours are used up for this period.'),
    ).toBeInTheDocument();
    expect(within(nightly).getByText('Started')).toBeInTheDocument();
    await user.click(within(nightly).getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText('The run is queued (run-102).')).toBeInTheDocument();
    expect(await within(nightly).findAllByRole('listitem')).toHaveLength(3);
    await user.click(within(nightly).getByRole('button', { name: 'Hide the runs' }));
    expect(within(nightly).queryByRole('listitem')).toBeNull();
  });

  it('checks one without running it', async () => {
    const user = userEvent.setup();
    visit('/automations');
    await user.click(within(await card('Triage new Sentry issues')).getByRole('button', { name: 'Dry run' }));
    expect(await screen.findByText(/Dry run: the trigger and inputs are valid/)).toBeInTheDocument();
  });

  it('says how many inputs of a dry run do not fit, and shows a run state and a reason it has no word for as is', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/automations/:id/run', () =>
        HttpResponse.json({
          renderedPrompt: 'x',
          variables: [],
          problems: [
            { path: 'issue.id', rule: 'required' },
            { path: 'issue.title', rule: 'max_length' },
          ],
          nextRuns: [],
        }),
      ),
      http.get('*/api/v1/automations/:id/runs', () =>
        HttpResponse.json({
          items: [
            {
              id: 'run-9',
              automationId: 'au-sentry',
              source: 'webhook',
              status: 'paused_by_owner',
              version: 1,
              reason: 'quota_frozen',
              problems: [],
              createdAt: '2026-10-30T07:00:00.000Z',
              updatedAt: '2026-10-30T07:00:00.000Z',
            },
          ],
        }),
      ),
    );
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Dry run' }));
    expect(await screen.findByText('Dry run: 2 inputs do not fit, nothing ran.')).toBeInTheDocument();
    await user.click(within(sentry).getByRole('button', { name: 'Show the runs' }));
    expect(await within(sentry).findByText('paused_by_owner')).toBeInTheDocument();
    expect(within(sentry).getByText('quota_frozen')).toBeInTheDocument();
  });

  it('says when an automation has no run yet', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Show the runs' }));
    expect(await within(sentry).findByText('No run yet.')).toBeInTheDocument();
  });

  it('says while the runs load, and why they do not come', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/automations/au-nightly/runs', never),
      http.get('*/api/v1/automations/au-sentry/runs', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'not yours' } }, { status: 403 }),
      ),
    );
    visit('/automations');
    const nightly = await card('Nightly dependency upgrades');
    await user.click(within(nightly).getByRole('button', { name: 'Show the runs' }));
    expect(within(nightly).getByText('Loading the runs…')).toBeInTheDocument();
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Show the runs' }));
    expect(await within(sentry).findByText('not yours')).toBeInTheDocument();
  });

  it('shows a new webhook secret once, in the card, and copies it', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'New webhook secret' }));
    const secret = await within(sentry).findByText(/^whsec_mock_1/);
    expect(within(sentry).getByText(/Copy it now: it is never shown again/)).toBeInTheDocument();
    await user.click(within(sentry).getByRole('button', { name: 'Copy' }));
    expect(await within(sentry).findByText('Copied.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(secret.textContent);
    await user.click(within(sentry).getByRole('button', { name: 'Turn on' }));
    await vi.waitFor(() => {
      expect(within(sentry).queryByText(/^whsec_mock/)).toBeNull();
    });
  });

  it('says when the secret could not be copied', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'New webhook secret' }));
    await within(sentry).findByText(/^whsec_mock_1/);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(within(sentry).getByRole('button', { name: 'Copy' }));
    expect(await within(sentry).findByText('Could not copy: select it by hand.')).toBeInTheDocument();
  });

  it('says so when the browser has no clipboard here, rather than failing silently', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'New webhook secret' }));
    await within(sentry).findByText(/^whsec_mock_1/);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementationOnce(() => {
      throw new TypeError('the Clipboard API needs a secure context');
    });
    await user.click(within(sentry).getByRole('button', { name: 'Copy' }));
    expect(await within(sentry).findByText('Could not copy: select it by hand.')).toBeInTheDocument();
  });

  it('holds only the automation that changes', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/automations/:id/enable', async () => delay('infinite')));
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Turn on' }));
    expect(within(sentry).getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(
      within(await card('Nightly dependency upgrades')).getByRole('button', { name: 'Run now' }),
    ).toBeEnabled();
  });

  it('holds an automation while it is turned off or run', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/automations/:id/disable', async () => delay('infinite')),
      http.post('*/api/v1/automations/:id/run', async () => delay('infinite')),
    );
    visit('/automations');
    const nightly = await card('Nightly dependency upgrades');
    await user.click(within(nightly).getByRole('button', { name: 'Turn off' }));
    expect(within(nightly).getByRole('button', { name: 'Dry run' })).toBeDisabled();
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Run now' }));
    expect(within(sentry).getByRole('button', { name: 'Dry run' })).toBeDisabled();
  });

  it('holds an automation while its secret is rotated', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/automations/:id/webhook/rotate-secret', async () => delay('infinite')));
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'New webhook secret' }));
    expect(within(sentry).getByRole('button', { name: 'Dry run' })).toBeDisabled();
  });

  it('says why the server refused a change', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/automations/:id/run', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'already running' } }, { status: 409 }),
      ),
    );
    visit('/automations');
    await user.click(
      within(await card('Nightly dependency upgrades')).getByRole('button', { name: 'Run now' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('already running');
  });

  it('lets a member change only their own automations', async () => {
    asMember();
    visit('/automations');
    expect(
      within(await card('Triage new Sentry issues')).getByRole('button', { name: 'Run now' }),
    ).toBeInTheDocument();
    expect(
      within(await card('Nightly dependency upgrades')).queryByRole('button', { name: 'Run now' }),
    ).toBeNull();
  });

  it('says when there is no automation', async () => {
    db.automations = [];
    visit('/automations');
    expect(await screen.findByText('No automation yet.')).toBeInTheDocument();
  });
});
