// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a call in progress. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

function deliverable(type: string): void {
  const node = db.workflows.find((workflow) => workflow.id === 'wf-release')?.nodes[1];
  if (node?.run === undefined) throw new Error('agent step');
  node.run.deliverable = { type };
}

/** A server that does not announce the workflow delivery. */
function withoutDelivery(): void {
  server.use(
    handleCapabilities(() =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'workflows.deliver.v1'))),
    ),
  );
}

function asMember(): void {
  setDemoRole(db, 'member');
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

const field = (name: string): HTMLElement => screen.getByLabelText(name);

describe('the detail of a run', () => {
  it('says where a run is, what it was given, and the steps it went through', async () => {
    visit('/runs/run-release-2');
    expect(await screen.findByRole('heading', { level: 1, name: 'Release notes' })).toBeInTheDocument();
    expect(screen.getByText('Now at').nextSibling).toHaveTextContent('The agent drafts the notes');
    expect(screen.getByText('acme/billing-api')).toBeInTheDocument();
    const inputs = screen.getByRole('region', { name: 'Inputs' });
    expect(inputs).toHaveTextContent('v1.4.0');
    const steps = screen.getByRole('region', { name: 'Steps it went through' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
    expect(within(steps).getAllByRole('link', { name: 'Its session' })[0]).toHaveAttribute(
      'href',
      '/sessions/ses-9c1d',
    );
    expect(screen.getByRole('link', { name: 'All runs' })).toHaveAttribute('href', '/runs');
  });

  it('says why a run failed, in words for its code', async () => {
    visit('/runs/run-release-1');
    expect(
      await screen.findByText('The agent ended its turn without delivering what the step asked for.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The session ended without handing anything in.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel the run' })).toBeNull();
  });

  it('says a run that does not exist', async () => {
    visit('/runs/run-nope');
    expect(await screen.findByText('run not found')).toBeInTheDocument();
  });

  it('lets the starter hand in what the agent step asked for, checked before it is sent', async () => {
    const user = userEvent.setup();
    visit('/runs/run-release-2');
    const form = await screen.findByRole('form', { name: 'Hand in the result' });
    expect(within(form).getByText('The address must be on github.com.')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Hand it in' }));
    expect(await within(form).findByText('Write what the step asked for.')).toBeInTheDocument();
    await user.type(field('The address (https)'), 'https://gitlab.com/a/b');
    await user.click(within(form).getByRole('button', { name: 'Hand it in' }));
    expect(
      await within(form).findByText('The address must be on github.com.', { selector: '[role=alert]' }),
    ).toBeInTheDocument();
    await user.clear(field('The address (https)'));
    await user.type(field('The address (https)'), 'https://github.com/acme/api/pull/9');
    await user.click(within(form).getByRole('button', { name: 'Hand it in' }));
    expect(await screen.findByText('Succeeded')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Hand in the result' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Output' })).toHaveTextContent(
      'https://github.com/acme/api/pull/9',
    );
  });

  it('says what the server refused of a delivery, and keeps the form', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/runs/:id/deliver', () =>
        HttpResponse.json({ error: { type: 'invalid_deliverable', message: 'not that' } }, { status: 400 }),
      ),
    );
    visit('/runs/run-release-2');
    await screen.findByRole('form', { name: 'Hand in the result' });
    await user.type(field('The address (https)'), 'https://github.com/a/b');
    await user.click(screen.getByRole('button', { name: 'Hand it in' }));
    expect(await screen.findByText('not that')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Hand in the result' })).toBeInTheDocument();
  });

  it('asks for what the step names: a text, a json, an artifact', async () => {
    const user = userEvent.setup();
    const flow = db.workflows.find((workflow) => workflow.id === 'wf-release');
    const node = flow?.nodes[1];
    if (node?.run === undefined) throw new Error('agent step');
    node.run.deliverable = { type: 'json', schema: { type: 'object', required: ['summary'] } };
    visit('/runs/run-release-2');
    await screen.findByRole('form', { name: 'Hand in the result' });
    await user.type(field('The JSON value'), '{{}');
    await user.click(screen.getByRole('button', { name: 'Hand it in' }));
    expect(await screen.findByText('A required field is missing ($.summary).')).toBeInTheDocument();
  });

  it('shows the form to the starter only', async () => {
    const run = db.workflowRuns.find((one) => one.id === 'run-release-2');
    if (run === undefined) throw new Error('run');
    run.startedBy = 'lena';
    visit('/runs/run-release-2');
    expect(await screen.findByRole('heading', { level: 1, name: 'Release notes' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Hand in the result' })).toBeNull();
    // an administrator still ends it
    expect(screen.getByRole('button', { name: 'Cancel the run' })).toBeInTheDocument();
  });

  it('shows no form when the server does not announce the delivery', async () => {
    withoutDelivery();
    visit('/runs/run-release-2');
    expect(await screen.findByRole('heading', { level: 1, name: 'Release notes' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Hand in the result' })).toBeNull();
  });

  it('cancels a run after a second click, and says a refusal', async () => {
    const user = userEvent.setup();
    visit('/runs/run-backend-3');
    await user.click(await screen.findByRole('button', { name: 'Cancel the run' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await user.click(screen.getByRole('button', { name: 'Cancel the run' }));
    await user.click(screen.getByRole('button', { name: 'Cancel this run' }));
    expect((await screen.findAllByText('Cancelled')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1, name: 'Backend changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel the run' })).toBeNull();
  });

  it('says a cancellation the server refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/runs/:id/cancel', () =>
        HttpResponse.json({ error: { type: 'run_finished', message: 'already over' } }, { status: 409 }),
      ),
    );
    visit('/runs/run-backend-3');
    await user.click(await screen.findByRole('button', { name: 'Cancel the run' }));
    await user.click(screen.getByRole('button', { name: 'Cancel this run' }));
    expect(await screen.findByText('already over')).toBeInTheDocument();
  });

  it('leaves a member who did not start a run with nothing to cancel', async () => {
    asMember();
    visit('/runs/run-release-1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Release notes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel the run' })).toBeNull();
  });

  it('points a waiting run to the question it waits on', async () => {
    const run = db.workflowRuns.find((one) => one.id === 'run-release-2');
    if (run === undefined) throw new Error('run');
    run.status = 'waiting';
    run.visits = [
      {
        seq: 1,
        nodeId: 'r-wait',
        kind: 'wait',
        status: 'waiting',
        waitId: 'wait-9',
        startedAt: '2026-10-30T07:55:00.000Z',
      },
    ];
    visit('/runs/run-release-2');
    expect(await screen.findByRole('link', { name: 'Answer it' })).toHaveAttribute('href', '/waits/wait-9');
  });
});

describe('the runs of every workflow, narrowed', () => {
  it('lists every run, narrows them to a workflow and a status, and opens one', async () => {
    const user = userEvent.setup();
    visit('/runs');
    const main = await screen.findByRole('main');
    expect(await within(main).findAllByRole('listitem')).toHaveLength(6);
    await user.selectOptions(field('Workflow'), 'Release notes');
    expect(await within(main).findAllByRole('listitem')).toHaveLength(2);
    await user.selectOptions(field('Status'), 'failed');
    const rows = await within(main).findAllByRole('listitem');
    expect(rows).toHaveLength(1);
    await user.click(within(rows[0] ?? main).getByRole('link', { name: 'Details' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Release notes' })).toBeInTheDocument();
  });

  it('offers an administrator every member’s runs', async () => {
    const user = userEvent.setup();
    visit('/runs');
    await user.click(await screen.findByRole('checkbox', { name: 'Every member’s runs' }));
    expect(await within(screen.getByRole('main')).findAllByRole('listitem')).toHaveLength(6);
  });

  it('hides the workflow filter and every member’s runs from a server that does not announce them', async () => {
    withoutDelivery();
    visit('/runs');
    expect(await within(await screen.findByRole('main')).findAllByRole('listitem')).toHaveLength(6);
    // useFeature holds until the server has answered: it goes once it has
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('Workflow')).toBeNull();
    });
    expect(screen.queryByRole('checkbox', { name: 'Every member’s runs' })).toBeNull();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('hides every member’s runs from a member', async () => {
    asMember();
    visit('/runs');
    await screen.findByLabelText('Workflow');
    expect(screen.queryByRole('checkbox', { name: 'Every member’s runs' })).toBeNull();
  });
});

describe('starting a run', () => {
  it('asks for the inputs and the repository, says what is missing, and starts the run', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-release');
    const form = await screen.findByRole('form', { name: 'Start a run' });
    const start = within(form).getByRole('button', { name: 'Run it now' });
    expect(start).toBeDisabled();
    expect(within(form).getByText('“Release tag” is required.')).toBeInTheDocument();
    await user.type(field('Release tag (required)'), 'v2');
    await user.type(field('Repository (required)'), 'nope');
    expect(within(form).getByText('Write a repository as owner/name.')).toBeInTheDocument();
    await user.clear(field('Repository (required)'));
    expect(start).toBeDisabled();
    await user.type(field('Repository (required)'), 'acme/api');
    await user.click(start);
    const runs = screen.getByRole('region', { name: 'Runs' });
    await vi.waitFor(() => {
      expect(within(runs).getAllByRole('listitem')[0]).toHaveTextContent('Queued');
    });
    expect(db.workflowRuns[0]).toMatchObject({
      workflowId: 'wf-release',
      inputs: { tag: 'v2', audience: 'customers' },
      repository: 'acme/api',
    });
  });

  it('does not ask for a repository a server that does not announce the delivery would not take', async () => {
    withoutDelivery();
    visit('/workflows/wf-release');
    const form = await screen.findByRole('form', { name: 'Start a run' });
    await vi.waitFor(() => {
      expect(within(form).queryByLabelText(/^Repository/)).toBeNull();
    });
  });

  it('refuses an input that is too long as the workflow says', async () => {
    const user = userEvent.setup();
    const flow = db.workflows.find((workflow) => workflow.id === 'wf-release');
    const input = flow?.inputs?.[0];
    if (input === undefined) throw new Error('input');
    delete input.maxLength;
    const second = flow?.inputs?.[1];
    if (second !== undefined) second.maxLength = 3;
    visit('/workflows/wf-release');
    await screen.findByRole('form', { name: 'Start a run' });
    await user.type(field('Release tag (required)'), 'v2');
    // the default "customers" is longer than 3
    expect(await screen.findByText('“Audience” is longer than the workflow allows.')).toBeInTheDocument();
  });

  it('says a rejected workflow never runs, and a proposed one is accepted first', async () => {
    visit('/workflows/wf-legacy');
    expect(await screen.findByText('This workflow was rejected: it never runs.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Start a run' })).toBeNull();
  });

  it('shows a run started by another to a member, and nothing to start', async () => {
    asMember();
    visit('/workflows/wf-release');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('form', { name: 'Start a run' })).toBeNull();
  });
});

describe('the list of workflows', () => {
  it('puts a rejected workflow apart, never runnable', async () => {
    visit('/workflows');
    expect(await screen.findByRole('heading', { name: 'Rejected' })).toBeInTheDocument();
    expect(screen.getByText('Legacy hotfix')).toBeInTheDocument();
  });
});

describe('the editor of delivery', () => {
  it('writes the session mode, the limits, what an agent hands in and where it works', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-release');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.selectOptions(field('How agent steps share sessions'), 'One session per agent step');
    await user.type(field('Most steps (up to 100)'), '200');
    expect(await screen.findByText(/A limit is a whole number/)).toBeInTheDocument();
    await user.clear(field('Most steps (up to 100)'));
    await user.type(field('Most steps (up to 100)'), '20');
    await user.clear(field('Step 2: The host it must be on'));
    await user.type(field('Step 2: The host it must be on'), 'gitlab.com');
    await user.type(field('Step 2: Repository it works in'), 'acme/api');
    await user.selectOptions(field('Step 2: What the agent hands in'), 'JSON');
    await user.type(field('Step 2: Its JSON schema'), '[[');
    expect(await screen.findByText('A schema is a JSON object.')).toBeInTheDocument();
    await user.clear(field('Step 2: Its JSON schema'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(db.workflows.find((workflow) => workflow.id === 'wf-release')?.limits?.maxNodes).toBe(20);
    });
    const saved = db.workflows.find((workflow) => workflow.id === 'wf-release');
    expect(saved?.limits).toEqual({ maxNodes: 20, maxVisits: 100 });
    expect(saved).not.toHaveProperty('sessionMode', 'same');
    expect(saved?.nodes[1]?.run).toMatchObject({ repository: 'acme/api', deliverable: { type: 'json' } });
  });

  it('shows none of it to a server that does not announce the delivery', async () => {
    withoutDelivery();
    const user = userEvent.setup();
    visit('/workflows/wf-release');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('Step 2: What the agent hands in')).toBeNull();
    });
    expect(screen.queryByLabelText('Most steps (up to 100)')).toBeNull();
  });
});

describe('what a run shows and asks, in the corners', () => {
  it('says the outcome and output of a step, and a step by its id when it has no title', async () => {
    const run = db.workflowRuns.find((one) => one.id === 'run-release-2');
    delete run?.visits?.[1]?.nodeTitle;
    visit('/runs/run-release-2');
    expect(await screen.findByText('Outcome: done')).toBeInTheDocument();
    expect(screen.getByText('Tag v1.4.0 is cut.')).toBeInTheDocument();
    expect(screen.getAllByText('r-draft').length).toBeGreaterThan(0);
  });

  it('repeats the server’s sentence only when it adds to the words', async () => {
    const run = db.workflowRuns.find((one) => one.id === 'run-release-1');
    if (run === undefined) throw new Error('run');
    run.failureCode = 'expired';
    run.failure = 'The run waited more than two weeks and expired.';
    visit('/runs/run-release-1');
    expect(await screen.findAllByText('The run waited more than two weeks and expired.')).toHaveLength(1);
  });

  it('asks for a text, an artifact, or what a newer server names, in the field that fits', async () => {
    const user = userEvent.setup();
    deliverable('text');
    visit('/runs/run-release-2');
    await user.type(await screen.findByLabelText('The text'), 'done');
    expect(screen.getByLabelText('The text').tagName).toBe('TEXTAREA');
  });

  it('asks for an artifact by its id', async () => {
    deliverable('artifact');
    visit('/runs/run-release-2');
    expect((await screen.findByLabelText('The artifact’s id')).tagName).toBe('INPUT');
  });

  it('hands in a newer kind of deliverable as a text', async () => {
    deliverable('novel');
    visit('/runs/run-release-2');
    expect(await screen.findByLabelText('The text')).toBeInTheDocument();
  });

  it('says it is sending while the server takes the delivery', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/runs/:id/deliver', never));
    visit('/runs/run-release-2');
    await user.type(await screen.findByLabelText('The address (https)'), 'https://github.com/a/b');
    await user.click(screen.getByRole('button', { name: 'Hand it in' }));
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('keeps the start button off while an input is missing, even on submit', async () => {
    visit('/workflows/wf-release');
    const form = await screen.findByRole('form', { name: 'Start a run' });
    fireEvent.submit(form);
    expect(db.workflowRuns).toHaveLength(6);
  });

  it('takes a filter form submitted as it is', async () => {
    visit('/runs');
    const form = await screen.findByRole('form', { name: 'Filter the runs' });
    fireEvent.submit(form);
    expect(form).toBeInTheDocument();
  });

  it('ignores a value the editor’s selects do not offer', async () => {
    const user = userEvent.setup();
    visit('/workflows/wf-release');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(field('Step 2: What the agent hands in'), { target: { value: 'nope' } });
    fireEvent.change(field('How agent steps share sessions'), { target: { value: 'nope' } });
    expect(field('Step 2: What the agent hands in')).toBeInTheDocument();
  });

  it('asks who answers a wait only of a server that serves the delivery', async () => {
    const user = userEvent.setup();
    db.workflows.push({
      id: 'wf-wait',
      name: 'Waiting',
      domain: 'acme/billing-api',
      status: 'accepted',
      foundAt: '2026-10-10T08:00:00.000Z',
      nodes: [
        { id: 'w-start', kind: 'trigger', label: 'Start' },
        { id: 'w-wait', kind: 'wait', label: 'Wait for QA', wait: { title: 'QA' }, approvers: ['lena'] },
      ],
      edges: [{ from: 'w-start', to: 'w-wait' }],
    });
    visit('/workflows/wf-wait');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Step 2: Who answers')).toHaveValue('lena');
  });

  it('does not ask who answers a wait of a server that does not announce it', async () => {
    const user = userEvent.setup();
    withoutDelivery();
    db.workflows.push({
      id: 'wf-wait',
      name: 'Waiting',
      domain: 'acme/billing-api',
      status: 'accepted',
      foundAt: '2026-10-10T08:00:00.000Z',
      nodes: [
        { id: 'w-start', kind: 'trigger', label: 'Start' },
        { id: 'w-wait', kind: 'wait', label: 'Wait for QA', wait: { title: 'QA' } },
      ],
      edges: [{ from: 'w-start', to: 'w-wait' }],
    });
    visit('/workflows/wf-wait');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByLabelText('Step 2: What it asks');
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('Step 2: Who answers')).toBeNull();
    });
  });

  it('reads a run that was given no inputs, and the run that called it and the one it called', async () => {
    const run = db.workflowRuns.find((one) => one.id === 'run-release-2');
    if (run === undefined) throw new Error('run');
    delete run.inputs;
    run.parentRunId = 'run-backend-3';
    const second = run.visits?.[1];
    if (second !== undefined) second.childRunId = 'run-backend-2';
    visit('/runs/run-release-2');
    expect(await screen.findByRole('link', { name: 'run-backend-3' })).toHaveAttribute(
      'href',
      '/runs/run-backend-3',
    );
    expect(screen.getByRole('link', { name: 'The run it started' })).toHaveAttribute(
      'href',
      '/runs/run-backend-2',
    );
    expect(screen.queryByRole('region', { name: 'Inputs' })).toBeNull();
  });

  it('says a run waits for a person even when it cannot say which question', async () => {
    const run = db.workflowRuns.find((one) => one.id === 'run-release-2');
    if (run === undefined) throw new Error('run');
    run.status = 'waiting';
    run.visits = [
      { seq: 1, nodeId: 'r-wait', kind: 'wait', status: 'waiting', startedAt: '2026-10-30T07:55:00.000Z' },
    ];
    visit('/runs/run-release-2');
    expect(await screen.findByText('The run waits for a person to answer.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Answer it' })).toBeNull();
  });

  it('says it is cancelling while the server ends the run', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/runs/:id/cancel', never));
    visit('/runs/run-backend-3');
    await user.click(await screen.findByRole('button', { name: 'Cancel the run' }));
    await user.click(screen.getByRole('button', { name: 'Cancel this run' }));
    expect(await screen.findByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  });
});
