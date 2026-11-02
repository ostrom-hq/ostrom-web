// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function asMember(): void {
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

async function card(name: string): Promise<HTMLElement> {
  const found = (await screen.findByRole('heading', { level: 3, name }, { timeout: 4_000 })).closest(
    'article',
  );
  if (found === null) throw new Error(`no automation ${name}`);
  return found;
}

async function openNew(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: 'New automation' }));
  return screen.getByRole('region', { name: 'A new automation' });
}

describe('writing an automation', () => {
  it('creates a schedule, paused and owned by the person, and closes the form once the server took it', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const form = await openNew();
    const create = within(form).getByRole('button', { name: 'Create the automation' });
    expect(create).toBeDisabled();
    expect(within(form).getByText('Give it a name of 1 to 120 characters.')).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Weekly changelog');
    expect(within(form).getByText('Say what the agent does, in 1 to 32,000 characters.')).toBeInTheDocument();
    await user.type(
      within(form).getByRole('textbox', { name: 'What the agent does' }),
      'Write the changelog.',
    );
    expect(
      within(form).getByText('The agent starts with this prompt at each run, in its own cloud session.'),
    ).toBeInTheDocument();
    const cron = within(form).getByRole('textbox', { name: 'Schedule (cron)' });
    expect(cron).toHaveValue('0 9 * * 1-5');
    await user.clear(cron);
    await user.type(cron, '0 8 * *');
    expect(within(form).getByText(/Write the schedule as a cron of five fields/)).toBeInTheDocument();
    await user.type(cron, ' 1');
    const zone = within(form).getByRole('textbox', { name: 'Time zone' });
    await user.clear(zone);
    expect(within(form).getByText(/Name the schedule’s time zone/)).toBeInTheDocument();
    await user.type(zone, 'Europe/Paris');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Agent' }), 'Codex');
    await user.type(within(form).getByRole('textbox', { name: 'Model' }), 'gpt-6');
    const runtime = within(form).getByRole('textbox', { name: 'Stops after (minutes)' });
    await user.clear(runtime);
    expect(within(form).getByText('The run stops after 1 to 1,440 minutes.')).toBeInTheDocument();
    await user.type(runtime, '30');
    const perDay = within(form).getByRole('textbox', { name: 'Runs a day at most' });
    await user.clear(perDay);
    expect(within(form).getByText('Allow 1 to 1,000 runs a day.')).toBeInTheDocument();
    await user.type(perDay, '2');
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'While a run still works' }),
      'Start another run',
    );
    expect(create).toBeEnabled();
    await user.click(create);

    const created = await card('Weekly changelog');
    expect(screen.queryByRole('region', { name: 'A new automation' })).toBeNull();
    expect(created).toHaveTextContent('Off');
    expect(created).toHaveTextContent('Starts on a schedule: 0 8 * * 1 · Europe/Paris');
    expect(created).toHaveTextContent('Codex: Write the changelog.');
    expect(created).toHaveTextContent('by maya · version 1 · at most 2 runs a day · stops after 30 min');
    expect(created).not.toHaveTextContent('skips');
    expect(within(created).queryByText(/^whsec_/)).toBeNull();
  });

  it('creates a webhook with its variables and sample, and shows its secret once on its card', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const form = await openNew();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Triage alerts');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Starts on' }), 'A signed webhook');
    expect(within(form).queryByRole('textbox', { name: 'Schedule (cron)' })).toBeNull();
    expect(within(form).getByText(/Ostrom gives the webhook its address and a secret/)).toBeInTheDocument();
    expect(within(form).getByText(/for instance \{\{issue\.title\}\}/)).toBeInTheDocument();
    await user.type(
      within(form).getByRole('textbox', { name: 'What the agent does' }),
      'Triage {{{{level}} alert.',
    );
    await user.click(within(form).getByRole('button', { name: 'Add a variable' }));
    expect(within(form).getByText('Each variable has a name and a path.')).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Name of variable 1' }), 'level');
    await user.type(within(form).getByRole('textbox', { name: 'Path of variable 1' }), 'level');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Type of variable 1' }), 'enum');
    expect(within(form).getByText(/An enum variable lists its values/)).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Values of variable 1' }), 'low, high');
    await user.click(within(form).getByRole('checkbox', { name: 'Sensitive' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Required' }));
    await user.click(within(form).getByRole('button', { name: 'Add a variable' }));
    await user.click(within(form).getByRole('button', { name: 'Remove variable 2' }));
    expect(within(form).queryByRole('textbox', { name: 'Name of variable 2' })).toBeNull();
    const sample = within(form).getByRole('textbox', { name: 'Sample payload (JSON, optional)' });
    await user.type(sample, '{{');
    expect(within(form).getByText('The sample payload is a JSON object.')).toBeInTheDocument();
    await user.clear(sample);
    await user.type(sample, '{{"level": "low"}');
    await user.click(within(form).getByRole('button', { name: 'Create the automation' }));

    const created = await card('Triage alerts');
    expect(created).toHaveTextContent('Starts on a signed webhook');
    expect(created).toHaveTextContent('Claude Code: Triage {{level}} alert.');
    expect(created).toHaveTextContent('/api/v1/automations/au-102/trigger');
    expect(within(created).getByText(/^whsec_mock_au-102/)).toBeInTheDocument();
    expect(within(created).getByText(/The caller signs each request with it/)).toBeInTheDocument();
    expect(db.automations[0]?.variables).toEqual([
      {
        name: 'level',
        path: '$.level',
        type: 'enum',
        values: ['low', 'high'],
        required: false,
        sensitive: true,
      },
    ]);
    expect(db.automations[0]?.samplePayload).toEqual({ level: 'low' });
    // Another gesture never takes the secret away before it is copied.
    await user.click(screen.getByRole('button', { name: 'New automation' }));
    await user.click(
      within(screen.getByRole('region', { name: 'A new automation' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await user.click(within(await card('Triage new Sentry issues')).getByRole('button', { name: 'Edit' }));
    expect(within(created).getByText(/^whsec_mock_au-102/)).toBeInTheDocument();
  });

  it('shows the server’s refusal as it wrote it, keeps the form, and forgets it once a new form opens', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/automations', () =>
        HttpResponse.json(
          { error: { type: 'conflict', message: 'A member owns at most 50 automations.' } },
          { status: 409 },
        ),
      ),
    );
    visit('/automations');
    const form = await openNew();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'One too many');
    await user.type(within(form).getByRole('textbox', { name: 'What the agent does' }), 'Anything.');
    await user.click(within(form).getByRole('button', { name: 'Create the automation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A member owns at most 50 automations.');
    expect(screen.getByRole('region', { name: 'A new automation' })).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'A new automation' })).toBeNull();
    await openNew();
    expect(screen.queryByText('A member owns at most 50 automations.')).toBeNull();
  });

  it('says it is saving while the server takes the new automation', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/automations', async () => delay('infinite')));
    visit('/automations');
    const form = await openNew();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Slow');
    await user.type(within(form).getByRole('textbox', { name: 'What the agent does' }), 'Anything.');
    await user.click(within(form).getByRole('button', { name: 'Create the automation' }));
    expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('keeps a trigger and an overlap it is given, and ignores a value no option has', async () => {
    visit('/automations');
    const form = await openNew();
    const trigger = within(form).getByRole('combobox', { name: 'Starts on' });
    fireEvent.change(trigger, { target: { value: 'email' } });
    expect(within(form).getByRole('textbox', { name: 'Schedule (cron)' })).toBeInTheDocument();
    const overlap = within(form).getByRole('combobox', { name: 'While a run still works' });
    fireEvent.change(overlap, { target: { value: 'queue' } });
    expect(overlap).toHaveValue('skip');
  });
});

describe('editing an automation', () => {
  it('edits its own automation over the version it read, and a workflow one gets a prompt', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    expect(
      within(await card('Nightly dependency upgrades')).queryByRole('button', { name: 'Edit' }),
    ).toBeNull();
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    expect(within(sentry).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(
      within(sentry).getByText(/runs the workflow wf-backend\. Workflow runs cannot be started/),
    ).toBeInTheDocument();
    expect(within(sentry).getByRole('textbox', { name: 'Sample payload (JSON, optional)' })).toHaveValue(
      '{\n  "issue": {\n    "id": "SENTRY-1",\n    "title": "TypeError in invoice.ts"\n  }\n}',
    );
    await user.type(within(sentry).getByRole('textbox', { name: 'What the agent does' }), 'Triage it.');
    await user.click(within(sentry).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(within(sentry).queryByRole('button', { name: 'Save' })).toBeNull();
    });
    expect(sentry).toHaveTextContent('Claude Code: Triage it.');
    expect(sentry).toHaveTextContent('version 2');
  });

  it('switches a webhook to a schedule, and the webhook’s address goes', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    await user.selectOptions(within(sentry).getByRole('combobox', { name: 'Starts on' }), 'A schedule');
    await user.type(within(sentry).getByRole('textbox', { name: 'What the agent does' }), 'Look.');
    await user.click(within(sentry).getByRole('button', { name: 'Save' }));
    expect(await within(sentry).findByText(/Starts on a schedule: 0 9 \* \* 1-5/)).toBeInTheDocument();
    expect(sentry).not.toHaveTextContent('/trigger');
  });

  it('says why a save was refused, keeps the editor, and closes it on cancel', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/automations/:id', () =>
        HttpResponse.json(
          {
            error: {
              type: 'conflict',
              message: 'The automation changed since you read it: reload it and try again.',
            },
          },
          { status: 409 },
        ),
      ),
    );
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    await user.type(within(sentry).getByRole('textbox', { name: 'What the agent does' }), 'Triage it.');
    await user.click(within(sentry).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The automation changed since you read it');
    expect(within(sentry).getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(within(sentry).getByRole('button', { name: 'Cancel' }));
    expect(within(sentry).queryByRole('button', { name: 'Save' })).toBeNull();
    // Opening an editor again forgets the last refusal.
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('holds the automation while its change is saved', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/automations/:id', async () => delay('infinite')));
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    await user.type(within(sentry).getByRole('textbox', { name: 'What the agent does' }), 'Triage it.');
    await user.click(within(sentry).getByRole('button', { name: 'Save' }));
    expect(within(sentry).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(within(sentry).getByRole('button', { name: 'Dry run' })).toBeDisabled();
  });

  it('keeps an agent and a variable type it has no word for, and knows its owner by member id', async () => {
    const user = userEvent.setup();
    asMember();
    db.automations = [
      {
        id: 'au-z',
        name: 'Odd one',
        owner: MEMBER_IDS.maya,
        enabled: true,
        trigger: { kind: 'webhook' },
        action: { agent: 'aider', prompt: 'Go.' },
        variables: [{ name: 'when', path: '$.when', type: 'date' }],
        version: 3,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'au-t',
        name: 'Theo’s',
        owner: 'theo',
        enabled: true,
        trigger: { kind: 'cron', cron: '@daily', timezone: 'UTC' },
        action: { prompt: 'Hi.' },
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];
    visit('/automations');
    const odd = await card('Odd one');
    // A member changes only their own: another member's automation has no button.
    expect(within(await card('Theo’s')).queryByRole('button')).toHaveTextContent('Show the runs');
    expect(within(odd).getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    await user.click(within(odd).getByRole('button', { name: 'Edit' }));
    expect(within(odd).getByRole('combobox', { name: 'Agent' })).toHaveValue('aider');
    expect(within(odd).getByRole('option', { name: 'aider' })).toBeInTheDocument();
    expect(within(odd).getByRole('combobox', { name: 'Type of variable 1' })).toHaveValue('date');
    await user.click(within(odd).getByRole('checkbox', { name: 'Required' }));
    await user.click(within(odd).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(db.automations[0]?.version).toBe(4);
    });
    expect(db.automations[0]?.action.agent).toBe('aider');
    expect(db.automations[0]?.variables).toEqual([
      { name: 'when', path: '$.when', type: 'date', values: [], required: false, sensitive: false },
    ]);
  });
});
