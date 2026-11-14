// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a list in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

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

describe('an automation that starts a workflow', () => {
  it('chooses the workflow, gives its inputs as templates, and says what is missing first', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const form = await openNew();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Release on tag');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Starts on' }), 'A signed webhook');
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'What it starts' }),
      'A workflow run',
    );
    // the prompt, the agent and the duration belong to the other action
    expect(within(form).queryByRole('textbox', { name: 'What the agent does' })).toBeNull();
    const create = within(form).getByRole('button', { name: 'Create the automation' });
    expect(create).toBeDisabled();
    expect(within(form).getByText('Choose the workflow it starts.')).toBeInTheDocument();
    await user.selectOptions(within(form).getByRole('combobox', { name: 'The workflow' }), 'Release notes');
    expect(
      within(form).getByText('Give a template to each required input of the workflow.'),
    ).toBeInTheDocument();
    expect(within(form).getByText(/such as \{\{issue\.title\}\}/)).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Release tag (required)' }), '{{{{tag}}');
    await user.type(within(form).getByRole('textbox', { name: /Repository of its agent steps/ }), 'nope');
    expect(within(form).getByText('Write a repository as owner/name.')).toBeInTheDocument();
    await user.clear(within(form).getByRole('textbox', { name: /Repository of its agent steps/ }));
    await user.type(within(form).getByRole('textbox', { name: /Repository of its agent steps/ }), 'acme/api');
    await user.click(create);
    const created = await card('Release on tag');
    expect(created).toHaveTextContent('Runs the workflow wf-release');
    expect(db.automations[0]?.action).toEqual({
      workflowId: 'wf-release',
      inputs: { tag: '{{tag}}' },
      repository: 'acme/api',
    });
  });

  it('keeps the inputs of another workflow out of what it saves', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const form = await openNew();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Switch');
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'What it starts' }),
      'A workflow run',
    );
    await user.selectOptions(within(form).getByRole('combobox', { name: 'The workflow' }), 'Release notes');
    await user.type(within(form).getByRole('textbox', { name: 'Release tag (required)' }), 'x');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'The workflow' }), 'Backend changes');
    expect(within(form).queryByRole('textbox', { name: 'Release tag (required)' })).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Create the automation' }));
    await card('Switch');
    expect(db.automations[0]?.action).toEqual({ workflowId: 'wf-backend', inputs: {} });
  });

  it('ignores an action the form does not offer', async () => {
    visit('/automations');
    const form = await openNew();
    fireEvent.change(within(form).getByRole('combobox', { name: 'What it starts' }), {
      target: { value: 'nope' },
    });
    expect(within(form).getByRole('textbox', { name: 'What the agent does' })).toBeInTheDocument();
  });

  it('edits the action of an automation that already starts a workflow', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    expect(within(sentry).getByRole('combobox', { name: 'The workflow' })).toHaveValue('wf-backend');
    await user.selectOptions(within(sentry).getByRole('combobox', { name: 'The workflow' }), 'Release notes');
    await user.type(within(sentry).getByRole('textbox', { name: 'Release tag (required)' }), 'v1');
    await user.click(within(sentry).getByRole('button', { name: 'Save' }));
    await within(sentry).findByText('Runs the workflow wf-release');
  });

  it('keeps showing a workflow that is no longer accepted', async () => {
    const user = userEvent.setup();
    db.workflows = db.workflows.map((flow) =>
      flow.id === 'wf-backend' ? { ...flow, status: 'rejected' } : flow,
    );
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    expect(
      await within(sentry).findByRole('option', { name: 'wf-backend (no longer accepted)' }),
    ).toBeInTheDocument();
  });

  it('offers no workflow action when the server does not announce it, but keeps editing one that exists', async () => {
    const user = userEvent.setup();
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'workflows.deliver.v1'))),
      ),
    );
    visit('/automations');
    const form = await openNew();
    expect(within(form).queryByRole('combobox', { name: 'What it starts' })).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    expect(within(sentry).getByRole('combobox', { name: 'What it starts' })).toBeInTheDocument();
  });

  it('says the workflows are being read', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/workflows', never));
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Edit' }));
    expect(
      await within(sentry).findByRole('option', { name: 'Reading the organization’s workflows…' }),
    ).toBeInTheDocument();
  });
});

describe('the address of a webhook that pins a version', () => {
  it('gives the latest address, or the one of the version now saved', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    const choice = within(sentry).getByRole('combobox', { name: 'Address for a sender that pins a version' });
    expect(within(sentry).getByRole('textbox', { name: 'Versioned webhook address' })).toHaveValue(
      'https://api.ostrom.run/api/v1/automations/au-sentry/v/latest/trigger',
    );
    await user.selectOptions(choice, 'This version (1)');
    expect(within(sentry).getByRole('textbox', { name: 'Versioned webhook address' })).toHaveValue(
      'https://api.ostrom.run/api/v1/automations/au-sentry/v/1/trigger',
    );
    await user.selectOptions(choice, 'Always the latest version');
    expect(within(sentry).getByRole('textbox', { name: 'Versioned webhook address' })).toHaveValue(
      'https://api.ostrom.run/api/v1/automations/au-sentry/v/latest/trigger',
    );
  });

  it('shows none for an address that is not a trigger', async () => {
    db.automations = db.automations.map((one) =>
      one.id === 'au-sentry' ? { ...one, webhookUrl: 'https://x.io/hook' } : one,
    );
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    expect(
      within(sentry).queryByRole('combobox', { name: 'Address for a sender that pins a version' }),
    ).toBeNull();
  });
});

describe('the runs of an automation', () => {
  it('links a run that started a workflow to it, and cancels one that is queued', async () => {
    const user = userEvent.setup();
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Show the runs' }));
    const link = await within(sentry).findByRole('link', { name: 'Its workflow run' });
    expect(link).toHaveAttribute('href', '/runs/run-backend-3');
    // the started run and the queued one can both be ended
    const cancels = within(sentry).getAllByRole('button', { name: 'Cancel' });
    expect(cancels).toHaveLength(2);
    await user.click(cancels[1] ?? sentry);
    await user.click(within(sentry).getByRole('button', { name: 'Keep it' }));
    await user.click(within(sentry).getAllByRole('button', { name: 'Cancel' })[1] ?? sentry);
    await user.click(within(sentry).getByRole('button', { name: 'Cancel this run' }));
    expect(await within(sentry).findByText('Cancelled by a person.')).toBeInTheDocument();
    expect(within(sentry).getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  it('says a cancellation the server refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/automations/:id/runs/:runId/cancel', () =>
        HttpResponse.json({ error: { type: 'run_finished', message: 'already over' } }, { status: 409 }),
      ),
    );
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Show the runs' }));
    await user.click((await within(sentry).findAllByRole('button', { name: 'Cancel' }))[1] ?? sentry);
    await user.click(within(sentry).getByRole('button', { name: 'Cancel this run' }));
    expect(await within(sentry).findByText('already over')).toBeInTheDocument();
  });

  it('says it is cancelling while the server takes it', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/automations/:id/runs/:runId/cancel', never));
    visit('/automations');
    const sentry = await card('Triage new Sentry issues');
    await user.click(within(sentry).getByRole('button', { name: 'Show the runs' }));
    await user.click((await within(sentry).findAllByRole('button', { name: 'Cancel' }))[1] ?? sentry);
    await user.click(within(sentry).getByRole('button', { name: 'Cancel this run' }));
    expect(await within(sentry).findByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  });
});
