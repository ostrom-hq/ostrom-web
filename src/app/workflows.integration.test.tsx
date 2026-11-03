// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

describe('the workflows', () => {
  it('lists each workflow with its repository, steps, approvals and status, and opens one', async () => {
    const user = userEvent.setup();
    visit('/workflows');
    const backend = await screen.findByRole('link', { name: /Backend changes/ });
    expect(backend).toHaveTextContent('acme/billing-api · All repositories · 5 steps · 2 approvals');
    expect(within(backend).getByText('Accepted')).toBeInTheDocument();
    const migrations = screen.getByRole('link', { name: /Database migrations/ });
    expect(migrations).toHaveTextContent('All repositories · 2 steps · 2 approvals');
    expect(within(migrations).getByText('Proposed')).toBeInTheDocument();
    await user.click(backend);
    expect(await screen.findByRole('heading', { level: 1, name: 'Backend changes' })).toBeInTheDocument();
  });

  it('reads a workflow step by step, from the start, with its branches and approvers', async () => {
    visit('/workflows/wf-backend');
    expect(await screen.findByText('From a branch to production for the billing API.')).toBeInTheDocument();
    expect(screen.getByText('Domain').nextSibling).toHaveTextContent('acme/billing-api');
    expect(screen.getByText('Repositories').nextSibling).toHaveTextContent('All repositories');
    expect(screen.getByText('Version').nextSibling).toHaveTextContent('7');
    expect(screen.getByText('Last change').nextSibling).toHaveTextContent(/^maya · /);
    const steps = within(screen.getByRole('region', { name: 'Steps' })).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('.o-row__title')?.textContent)).toEqual([
      'A branch is pushed',
      'Tests pass',
      'Merge to main',
      'The agent fixes the failing tests',
      'Deploy to production',
    ]);
    expect(steps[0]).toHaveTextContent('Then: Tests pass');
    expect(steps[1]).toHaveTextContent('pnpm test on the pushed commit');
    expect(steps[1]).toHaveTextContent('Rules R-3');
    expect(steps[1]).toHaveTextContent('success: Merge to main');
    expect(steps[1]).toHaveTextContent('Tests fail: The agent fixes the failing tests');
    expect(steps[2]).toHaveTextContent('Approved by maya, samir');
    expect(steps[2]).toHaveTextContent('Owners of acme/billing-api');
    expect(steps[4]).toHaveTextContent('From 09:00-18:00');
    expect(steps[4]).toHaveTextContent('On mon-fri');
    expect(steps[4]).toHaveTextContent('Then: the workflow ends');
    expect(steps[2]).toHaveTextContent('Approval');
  });

  it('says a step nobody may approve stops the agent for good', async () => {
    visit('/workflows/wf-migrations');
    expect(await screen.findByText(/Nobody may approve this step/)).toBeInTheDocument();
    expect(screen.queryByText('Version')).toBeNull();
    expect(screen.queryByText('Last change')).toBeNull();
  });

  it('reads a workflow without steps, and a change without its author', async () => {
    server.use(
      http.get('*/api/v1/workflows/:id', () =>
        HttpResponse.json({
          id: 'w',
          name: 'Empty',
          domain: 'acme/x',
          status: 'edited',
          foundAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
          nodes: [],
          edges: [],
        }),
      ),
    );
    visit('/workflows/w');
    expect(await screen.findByText('This workflow has no step yet.')).toBeInTheDocument();
    expect(screen.getByText('Accepted with changes')).toBeInTheDocument();
    expect(screen.getByText('Last change').nextSibling).not.toHaveTextContent('·');
  });

  it('says when there is no workflow', async () => {
    server.use(http.get('*/api/v1/workflows', () => HttpResponse.json({ items: [] })));
    visit('/workflows');
    expect(await screen.findByText(/No workflow yet/)).toBeInTheDocument();
  });

  it('shows the shape of the list while it loads', async () => {
    server.use(http.get('*/api/v1/workflows', never));
    visit('/workflows');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says a workflow does not exist', async () => {
    visit('/workflows/nope');
    expect(await screen.findByText('workflow not found')).toBeInTheDocument();
  });
});

describe('changing the workflows', () => {
  const field = (name: string): HTMLElement => screen.getByLabelText(name);

  it('writes a new workflow, step by step, and opens it once the server took it', async () => {
    const user = userEvent.setup();
    visit('/workflows');
    await user.click(await screen.findByRole('link', { name: 'New workflow' }));
    const form = await screen.findByRole('form', { name: 'A new workflow' });
    const create = within(form).getByRole('button', { name: 'Create the workflow' });
    // What keeps it from being saved is said, in order.
    expect(within(form).getByText('Name the workflow.')).toBeInTheDocument();
    expect(create).toBeDisabled();
    await user.type(field('Name'), 'Release train');
    expect(within(form).getByText('Say which domain it covers.')).toBeInTheDocument();
    await user.type(field('Domain'), 'Mobile');
    // No repository picked yet: the editor says the workflow then reaches every repository its words point to.
    expect(within(form).getByRole('note')).toHaveTextContent(/No repository picked/);
    await user.click(await within(form).findByRole('checkbox', { name: 'web' }));
    expect(within(form).queryByRole('note')).toBeNull();
    await user.click(within(form).getByRole('checkbox', { name: 'api' }));
    await user.click(within(form).getByRole('checkbox', { name: 'api' }));
    expect(within(form).getByText('Say what each step is.')).toBeInTheDocument();
    await user.type(field('Step 1: What it is'), 'A tag is pushed');
    await user.type(field('What it is for'), 'From a tag to the store.');
    // A second step, an approval nobody may give yet: the editor says it.
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    await user.selectOptions(field('What step 2 does'), 'Approval');
    await user.type(field('Step 2: What it is'), 'Ship it');
    expect(within(form).getByText(/Nobody may approve this step/)).toBeInTheDocument();
    await user.type(field('Step 2: Who may approve'), 'maya, samir');
    expect(within(form).queryByText(/Nobody may approve this step/)).toBeNull();
    // A third, moved above the approval, then a fourth removed.
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    await user.type(field('Step 3: What it is'), 'Tests pass');
    await user.type(field('Step 3: The command'), 'pnpm test');
    expect(within(form).getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Move step 3 down' })).toBeDisabled();
    await user.click(within(form).getByRole('button', { name: 'Move step 3 up' }));
    await user.click(within(form).getByRole('button', { name: 'Move step 1 down' }));
    await user.click(within(form).getByRole('button', { name: 'Move step 2 up' }));
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    await user.click(within(form).getByRole('button', { name: 'Remove step 4' }));
    expect(within(form).queryByRole('listitem', { name: 'Step 4' })).toBeNull();
    await user.click(create);
    expect(await screen.findByRole('heading', { level: 1, name: 'Release train' })).toBeInTheDocument();
    const steps = within(screen.getByRole('region', { name: 'Steps' })).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('.o-row__title')?.textContent)).toEqual([
      'A tag is pushed',
      'Tests pass',
      'Ship it',
    ]);
    expect(steps[1]).toHaveTextContent('Then: Ship it');
    expect(steps[2]).toHaveTextContent('Approved by maya, samir');
    expect(screen.getByText('Version').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Repositories').nextSibling).toHaveTextContent(/^web$/);
    expect(db.workflows.find((workflow) => workflow.id === 'wf-release-train')).toMatchObject({
      status: 'accepted',
      repos: ['*/web'],
      description: 'From a tag to the store.',
      start: 'n-1',
    });
    expect(db.decisions[0]).toMatchObject({
      action: 'edit',
      subject: { kind: 'workflow', id: 'wf-release-train' },
    });
  });

  it('writes a check’s condition, a wait’s question and a called workflow, and refuses a bad one before sending', async () => {
    const user = userEvent.setup();
    visit('/workflows/new');
    const form = await screen.findByRole('form', { name: 'A new workflow' });
    const create = within(form).getByRole('button', { name: 'Create the workflow' });
    await user.type(field('Name'), 'Checked release');
    await user.type(field('Domain'), 'Mobile');
    await user.type(field('Step 1: What it is'), 'Tests run');
    // a check that reads the step before it
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    await user.selectOptions(field('What step 2 does'), 'Check');
    await user.type(field('Step 2: What it is'), 'Tests passed');
    expect(within(form).getByRole('option', { name: 'Step 1 · Tests run' })).toBeInTheDocument();
    await user.selectOptions(field('Step 2: The step it reads'), 'Step 1 · Tests run');
    // half written: refused before sending, with what to change
    expect(
      within(form).getByText(
        'A check reads outcome, output, or up to 10 keys of the output, such as output.status.',
      ),
    ).toBeInTheDocument();
    // what each outcome does in a line of steps
    expect(
      within(form).getByText(
        'Read true, the run goes on to the next step; read false, it fails here, with the reason.',
      ),
    ).toBeInTheDocument();
    expect(create).toBeDisabled();
    await user.type(field('Step 2: Where in its output'), '$.status');
    expect(create).toBeDisabled();
    await user.clear(field('Step 2: Where in its output'));
    await user.type(field('Step 2: Where in its output'), 'output.status');
    await user.selectOptions(field('Step 2: How it compares'), 'matches the pattern');
    await user.type(field('Step 2: With what'), 'v{{2}');
    expect(
      within(form).getByText(
        'A pattern takes no “{”, no back-reference and no look-around, in at most 200 characters.',
      ),
    ).toBeInTheDocument();
    await user.clear(field('Step 2: With what'));
    await user.type(field('Step 2: With what'), '^passed$');
    await user.selectOptions(field('Step 2: How it compares'), 'exists');
    expect(screen.queryByLabelText('Step 2: With what')).toBeNull();
    // a comparison the contract does not have changes nothing
    fireEvent.change(field('Step 2: How it compares'), { target: { value: 'contains' } });
    expect(field('Step 2: How it compares')).toHaveValue('exists');
    await user.selectOptions(field('Step 2: How it compares'), 'equals');
    // a wait asks a question; none written is said
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    await user.selectOptions(field('What step 3 does'), 'Waits for a person');
    await user.type(field('Step 3: What it is'), 'QA');
    expect(within(form).getByText('Say what each wait asks.')).toBeInTheDocument();
    await user.type(field('Step 3: What it asks'), 'Ship it?');
    await user.type(field('Step 3: More about the question'), 'QA looked at the build.');
    // a workflow step runs one of the organization's workflows
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    await user.selectOptions(field('What step 4 does'), 'Workflow');
    await user.type(field('Step 4: What it is'), 'Deploy');
    expect(within(form).getByText('Choose the workflow each workflow step runs.')).toBeInTheDocument();
    await user.selectOptions(field('Step 4: The workflow it runs'), 'Backend changes');
    expect(create).toBeEnabled();
    await user.click(create);
    expect(await screen.findByRole('heading', { level: 1, name: 'Checked release' })).toBeInTheDocument();
    const saved = db.workflows.find((workflow) => workflow.id === 'wf-checked-release');
    expect(saved?.nodes.slice(1)).toEqual([
      {
        id: 'n-2',
        kind: 'check',
        label: 'Tests passed',
        condition: { step: 'n-1', path: 'output.status', op: 'equals', value: '^passed$' },
      },
      { id: 'n-3', kind: 'wait', label: 'QA', wait: { title: 'Ship it?', body: 'QA looked at the build.' } },
      { id: 'n-4', kind: 'workflow', label: 'Deploy', workflowId: 'wf-backend' },
    ]);
    // the check goes on when it reads true; read false, no path: the run fails there
    expect(saved?.edges).toEqual([
      { from: 'n-1', to: 'n-2' },
      { from: 'n-2', to: 'n-3', on: 'true' },
      { from: 'n-3', to: 'n-4' },
      { from: 'n-4', to: null },
    ]);
  });

  it('never offers a workflow that would run the one edited again, and shows one no longer listed', async () => {
    const user = userEvent.setup();
    const migrations = db.workflows.find((workflow) => workflow.id === 'wf-migrations');
    const backend = db.workflows.find((workflow) => workflow.id === 'wf-backend');
    if (migrations === undefined || backend === undefined) throw new Error('fixtures');
    // wf-migrations runs wf-backend, and wf-backend ran a workflow deleted since
    db.workflows = [
      {
        ...migrations,
        nodes: [
          ...migrations.nodes,
          { id: 'm-call', kind: 'workflow', label: 'Backend', workflowId: 'wf-backend' },
        ],
      },
      {
        ...backend,
        nodes: [...backend.nodes, { id: 'b-call', kind: 'workflow', label: 'Gone', workflowId: 'wf-gone' }],
      },
    ];
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const count = backend.nodes.length + 1;
    const gone = field(`Step ${String(count)}: The workflow it runs`);
    expect(gone).toHaveValue('wf-gone');
    expect(
      within(gone)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a workflow', 'wf-gone (no longer listed)']);
    await user.selectOptions(field('What step 1 does'), 'Workflow');
    const calls = field('Step 1: The workflow it runs');
    expect(
      within(calls)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a workflow']);
  });

  it('gives a new workflow a name another one has its own id, and says a refusal', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(
        '*/api/v1/workflows',
        () =>
          HttpResponse.json(
            { error: { type: 'conflict', message: 'A workflow with this id exists.' } },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    visit('/workflows/new');
    await user.type(await screen.findByLabelText('Name'), 'Backend changes');
    await user.type(field('Domain'), 'acme/billing-api');
    await user.type(field('Step 1: What it is'), 'Pushed');
    await user.click(screen.getByRole('button', { name: 'Create the workflow' }));
    expect(
      await screen.findByText(
        'A workflow with this id exists. Another workflow took this id meanwhile: create again and this one gets its own.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create the workflow' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Backend changes' })).toBeInTheDocument();
    expect(db.workflows.map((workflow) => workflow.id)).toContain('wf-backend-changes');
  });

  it('leaves a new workflow unwritten on Cancel', async () => {
    const user = userEvent.setup();
    visit('/workflows/new');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Workflows' })).toBeInTheDocument();
  });

  it('changes the words of a workflow that branches, and keeps its paths', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit the workflow' });
    expect(within(form).getByText(/This workflow branches/)).toBeInTheDocument();
    expect(within(form).queryByRole('button', { name: 'Add a step' })).toBeNull();
    expect(within(form).queryByRole('button', { name: 'Remove step 1' })).toBeNull();
    const label = field('Step 2: What it is');
    await user.clear(label);
    await user.type(label, 'Unit tests pass');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Unit tests pass')).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByText('Version').nextSibling).toHaveTextContent('8');
    expect(screen.getByText('Tests fail: The agent fixes the failing tests')).toBeInTheDocument();
    expect(db.decisions[0]).toMatchObject({ action: 'edit', subject: { id: 'wf-backend' } });
  });

  it('says a version saved in between, and saves nothing over it until the editor starts again', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    // Someone else saves version 8 meanwhile.
    const current = db.workflows.find((workflow) => workflow.id === 'wf-backend');
    if (current === undefined) throw new Error('wf-backend');
    db.workflows = db.workflows.map((workflow) =>
      workflow.id === 'wf-backend' ? { ...current, version: 8, name: 'Theirs' } : workflow,
    );
    await user.type(field('Name'), ' (mine)');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/workflow_conflict: someone saved this workflow in between\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cancel to read their version/)).toBeInTheDocument();
    // The draft stays as typed, and a second save is still checked against the version it started from.
    expect(field('Name')).toHaveValue('Backend changes (mine)');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findAllByText(/workflow_conflict/)).toHaveLength(1);
    expect(db.workflows.find((workflow) => workflow.id === 'wf-backend')?.name).toBe('Theirs');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/workflow_conflict/)).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Theirs' })).toBeInTheDocument();
  });

  it('accepts a proposed workflow as found', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(db.decisions[0]).toMatchObject({ action: 'accept', subject: { id: 'wf-migrations' } });
  });

  it('accepts a proposed workflow with the changes made to it', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit the workflow' });
    expect(within(form).getByText(/run in this order/)).toBeInTheDocument();
    await user.type(field('Step 2: Who may approve'), 'samir');
    await user.click(within(form).getByRole('button', { name: 'Save and accept' }));
    expect(await screen.findByText('Accepted with changes')).toBeInTheDocument();
    expect(db.decisions[0]).toMatchObject({ action: 'edit' });
  });

  it('turns a step into another kind with its own fields, and keeps a wait untouched as it is', async () => {
    const user = userEvent.setup();
    const base = db.workflows.find((workflow) => workflow.id === 'wf-migrations');
    if (base === undefined) throw new Error('wf-migrations');
    db.workflows = [
      {
        ...base,
        nodes: [...base.nodes, { id: 'm-wait', kind: 'wait', label: 'Wait for QA', wait: { title: 'QA' } }],
        edges: [...base.edges, { from: 'm-orphan', to: 'm-wait' }],
      },
    ];
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const third = screen.getByRole('listitem', { name: 'Step 3' });
    // a wait reads as its kind, with the question it asks
    expect(field('What step 3 does')).toHaveValue('wait');
    expect(within(third).getByLabelText('Step 3: What it asks')).toHaveValue('QA');
    await user.selectOptions(field('What step 1 does'), 'Notify');
    expect(field('Step 1: Where to tell')).toBeInTheDocument();
    expect(screen.queryByLabelText('Step 1: Who may approve')).toBeNull();
    await user.type(field('Step 1: Where to tell'), '#db');
    await user.type(field('Step 1: What to say'), 'A migration is waiting.');
    await user.selectOptions(field('What step 2 does'), 'Agent');
    await user.type(field('Step 2: What the agent does'), 'Write the migration.');
    await user.click(screen.getByRole('button', { name: 'Save and accept' }));
    await screen.findByText('Accepted with changes');
    const saved = db.workflows.find((workflow) => workflow.id === 'wf-migrations');
    expect(saved?.nodes.map((node) => [node.kind, node.run, node.approvers])).toEqual([
      ['notify', { channel: '#db', message: 'A migration is waiting.' }, undefined],
      ['agent', { instructions: 'Write the migration.' }, undefined],
      ['wait', undefined, undefined],
    ]);
    expect(saved?.nodes[0]).not.toHaveProperty('actions');
  });

  it('deletes a workflow after a second click that names it, and goes back to the list', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete this workflow' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Workflows' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Database migrations/ })).toBeNull();
    expect(db.decisions[0]).toMatchObject({ action: 'delete', subject: { id: 'wf-migrations' } });
  });

  it('says a deletion something still uses, and an acceptance someone changed in between, and keeps the screen', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(
        '*/api/v1/workflows/:id',
        () =>
          HttpResponse.json(
            {
              error: {
                type: 'conflict',
                message: 'workflow_in_use: a pinned package compiles this workflow.',
              },
            },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete this workflow' }));
    expect(
      await screen.findByText(
        'workflow_in_use: a pinned package compiles this workflow. Something still uses it: delete it again once nothing does.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Database migrations' })).toBeInTheDocument();
    const current = db.workflows.find((workflow) => workflow.id === 'wf-migrations');
    if (current === undefined) throw new Error('wf-migrations');
    db.workflows = db.workflows.map((workflow) =>
      workflow.id === 'wf-migrations' ? { ...current, version: 2 } : workflow,
    );
    server.use(
      http.put(
        '*/api/v1/workflows/:id',
        () =>
          HttpResponse.json(
            {
              error: {
                type: 'conflict',
                message: 'workflow_conflict: someone saved this workflow in between.',
              },
            },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(
      await screen.findByText(
        /someone saved this workflow in between\. Someone changed it in between: its saved version/,
      ),
    ).toBeInTheDocument();
  });

  it('accepts a proposed workflow saved unchanged as found', async () => {
    const user = userEvent.setup();
    const base = db.workflows.find((workflow) => workflow.id === 'wf-migrations');
    if (base === undefined) throw new Error('wf-migrations');
    db.workflows = db.workflows.map((workflow) =>
      workflow.id === 'wf-migrations'
        ? { ...base, edges: [...base.edges, { from: 'm-orphan', to: null }] }
        : workflow,
    );
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save and accept' }));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    expect(db.decisions[0]).toMatchObject({ action: 'accept', subject: { id: 'wf-migrations' } });
  });

  it("shows the repositories a workflow is limited to, and changes them among the organization's", async () => {
    const user = userEvent.setup();
    db.workflows = db.workflows.map((workflow) =>
      workflow.id === 'wf-backend' ? { ...workflow, repos: ['acme/payments', '*/api'] } : workflow,
    );
    visit('/workflows');
    const backend = await screen.findByRole('link', { name: /Backend changes/ });
    expect(backend).toHaveTextContent('acme/billing-api · acme/payments, api · 5 steps');
    await user.click(backend);
    expect(await screen.findByText('Repositories')).toBeInTheDocument();
    expect(screen.getByText('Repositories').nextSibling).toHaveTextContent('acme/payments, api');
    const before = db.decisions.length;
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit the workflow' });
    // The organization's, by name, then the one written elsewhere that GitHub does not list: it can still be taken out.
    const api = await within(form).findByRole('checkbox', { name: 'api' });
    expect(api).toBeChecked();
    expect(within(form).getByRole('checkbox', { name: 'web' })).not.toBeChecked();
    const payments = within(form).getByRole('checkbox', { name: 'acme/payments' });
    expect(payments).toBeChecked();
    await user.click(payments);
    await user.click(api);
    expect(within(form).getByRole('note')).toHaveTextContent(
      'No repository picked: this workflow applies to every repository of the organization its gates or its words point to.',
    );
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Repositories').nextSibling).toHaveTextContent('All repositories');
    const saved = db.workflows.find((workflow) => workflow.id === 'wf-backend');
    expect(saved).not.toHaveProperty('repos');
    // The repositories are a decided part: changing them alone is signed.
    expect(db.decisions).toHaveLength(before + 1);
  });

  it("keeps the repositories already picked when the organization's cannot be read", async () => {
    db.workflows = db.workflows.map((workflow) =>
      workflow.id === 'wf-backend' ? { ...workflow, repos: ['*/api'] } : workflow,
    );
    server.use(
      http.get('*/api/v1/repos', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'down' } }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit the workflow' });
    expect(
      await within(form).findByText(/could not be read\. Those already picked stay\./),
    ).toBeInTheDocument();
    expect(within(form).getByRole('checkbox', { name: 'api' })).toBeChecked();
  });

  it('says the repositories are being read, then that there are none to pick', async () => {
    server.use(http.get('*/api/v1/repos', never, { once: true }));
    visit('/workflows/new');
    const form = await screen.findByRole('form', { name: 'A new workflow' });
    expect(within(form).getByText('Reading the organization’s repositories…')).toBeInTheDocument();
    expect(within(form).queryByRole('checkbox')).toBeNull();
  });

  it('says there is no repository to pick when GitHub lists none', async () => {
    server.use(http.get('*/api/v1/repos', () => HttpResponse.json({ items: [] })));
    visit('/workflows/new');
    const form = await screen.findByRole('form', { name: 'A new workflow' });
    expect(await within(form).findByText(/No repository read/)).toBeInTheDocument();
    expect(within(form).getByRole('note')).toHaveTextContent(/No repository picked/);
  });

  it("reads the organization's repositories a page at a time", async () => {
    const repo = (name: string) => ({ name, defaultBranch: 'main', archived: false, owners: [] });
    server.use(
      http.get('*/api/v1/repos', ({ request }) =>
        new URL(request.url).searchParams.get('after') === null
          ? HttpResponse.json({ items: [repo('first')], next: 'first' })
          : HttpResponse.json({ items: [repo('second')] }),
      ),
    );
    const user = userEvent.setup();
    visit('/workflows/new');
    const form = await screen.findByRole('form', { name: 'A new workflow' });
    expect(await within(form).findByRole('checkbox', { name: 'first' })).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'More repositories' }));
    expect(await within(form).findByRole('checkbox', { name: 'second' })).toBeInTheDocument();
    expect(within(form).queryByRole('button', { name: 'More repositories' })).toBeNull();
  });

  it('signs nothing for a save that changes no decided part', async () => {
    const user = userEvent.setup();
    const before = db.decisions.length;
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText('What it is for'), ' Read it first.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Read it first\./)).toBeInTheDocument();
    expect(db.decisions).toHaveLength(before);
  });

  it('never shows a deleted workflow again, not even from what the screen had read', async () => {
    const user = userEvent.setup();
    const router = visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete this workflow' }));
    await screen.findByRole('heading', { level: 1, name: 'Workflows' });
    // Its old address, the server slow to answer: nothing of it is drawn from the cache.
    server.use(http.get('*/api/v1/workflows/:id', never));
    await router.navigate({ to: '/workflows/$workflowId', params: { workflowId: 'wf-migrations' } });
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Database migrations' })).toBeNull();
  });

  it('opens another workflow without the editor nor the refusal of the first, and the first again without either', async () => {
    const user = userEvent.setup();
    const router = visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    server.use(
      http.put(
        '*/api/v1/workflows/:id',
        () =>
          HttpResponse.json({ error: { type: 'invalid_request', message: 'refused here' } }, { status: 400 }),
        { once: true },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('refused here')).toBeInTheDocument();
    await router.navigate({ to: '/workflows/$workflowId', params: { workflowId: 'wf-migrations' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Database migrations' })).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByText('refused here')).toBeNull();
    // Back to the first: it starts again from what the server has, without its old editor.
    await router.navigate({ to: '/workflows/$workflowId', params: { workflowId: 'wf-backend' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Backend changes' })).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('accepts as found a proposed workflow the editor spells otherwise but nobody touched', async () => {
    const user = userEvent.setup();
    const base = db.workflows.find((workflow) => workflow.id === 'wf-migrations');
    if (base === undefined) throw new Error('wf-migrations');
    db.workflows = db.workflows.map((workflow) =>
      workflow.id === 'wf-migrations'
        ? {
            ...base,
            name: ' Database migrations ',
            nodes: base.nodes.map((node) =>
              node.id === 'm-orphan' ? { ...node, approvers: [], run: {} } : node,
            ),
          }
        : workflow,
    );
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save and accept' }));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
  });

  it('says what is being sent while the server answers', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/workflows/:id', never), http.delete('*/api/v1/workflows/:id', never));
    visit('/workflows/wf-migrations');
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('button', { name: 'Accepting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('says a deletion in progress, and an edit being saved', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/workflows/:id', never), http.put('*/api/v1/workflows/:id', never));
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete this workflow' }));
    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });

  it('says a save in progress in the editor', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/workflows/:id', never));
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('lets a member read the workflows, never change them', async () => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          dev: { login: 'maya', verified: true, via: 'github' },
          member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
          capabilities: [],
        }),
      ),
    );
    visit('/workflows');
    expect(await screen.findByRole('link', { name: /Backend changes/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New workflow' })).toBeNull();
    visit('/workflows/wf-backend');
    expect(await screen.findByText('Owners and admins change workflows.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('never offers a member the editor of a new workflow', async () => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          dev: { login: 'maya', verified: true, via: 'github' },
          member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
          capabilities: [],
        }),
      ),
    );
    visit('/workflows/new');
    expect(await screen.findByText('Owners and admins change workflows.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('says a failure that is not a conflict in the server’s words alone, and ignores a kind it does not know', async () => {
    // (a kind the contract does not have, such as `loop`, is not offered and changes nothing)
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/workflows/:id', () =>
        HttpResponse.json(
          { error: { type: 'invalid_request', message: 'a step has no label' } },
          { status: 400 },
        ),
      ),
    );
    visit('/workflows/wf-backend');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const kind = field('What step 1 does');
    fireEvent.change(kind, { target: { value: 'loop' } });
    expect(kind).toHaveValue('trigger');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('a step has no label')).toBeInTheDocument();
    expect(screen.queryByText(/in between/)).toBeNull();
  });
});
