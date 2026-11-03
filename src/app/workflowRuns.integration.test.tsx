// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkflowRun } from '@gen/api/types.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();
/** A handler that never answers, to hold a list in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

/** `count` finished runs of a workflow, newest first, a minute apart. */
function finishedRuns(workflowId: string, workflowName: string, count: number): WorkflowRun[] {
  return Array.from({ length: count }, (_, n) => {
    const started = Date.parse('2026-10-20T08:00:00.000Z') - n * 60_000;
    return {
      id: `run-old-${String(n).padStart(3, '0')}`,
      workflowId,
      workflowName,
      workflowVersion: 7,
      status: 'succeeded',
      startedBy: 'lena',
      source: 'console',
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(started + 30_000).toISOString(),
    };
  });
}

/** The rows of a list of runs, in the order shown. */
function runRows(region: HTMLElement): HTMLElement[] {
  return within(region).getAllByRole('listitem');
}

describe('the runs of a workflow', () => {
  it('lists its runs, newest first, with their status, start, end and session', async () => {
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    const rows = await within(runs).findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Running');
    expect(rows[0]).toHaveTextContent('Started by maya');
    expect(within(rows[0] ?? runs).getByRole('link', { name: 'Its session' })).toHaveAttribute(
      'href',
      '/sessions/ses-7f3a',
    );
    expect(rows[1]).toHaveTextContent('Succeeded');
    expect(rows[1]).toHaveTextContent('Started by lena · from an automation');
    expect(rows[1]).toHaveTextContent('42 min');
    expect(within(rows[1] ?? runs).queryByRole('link', { name: 'Its session' })).toBeNull();
    expect(rows[2]).toHaveTextContent('Failed');
    expect(rows[2]).toHaveTextContent('Tests fail on main');
    // Started when: the exact time, in the viewer's language.
    expect(within(rows[0] ?? runs).getByText(/Oct/)).toHaveAttribute('datetime', '2026-10-30T07:50:00.000Z');
  });

  it('says when a workflow never ran', async () => {
    db.workflowRuns = [];
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findByText('No run yet.')).toBeInTheDocument();
  });

  it('shows the shape of the runs while they load, and the workflow already', async () => {
    server.use(http.get('*/api/v1/workflows/:id/runs', never));
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(within(runs).getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Steps' })).toBeInTheDocument();
  });

  it('says why the runs did not come, and keeps the workflow', async () => {
    server.use(
      http.get('*/api/v1/workflows/:id/runs', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'runs are down' } }, { status: 500 }),
      ),
    );
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findByText('runs are down', {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Steps' })).toBeInTheDocument();
  });

  it('says the server refused the runs to this person', async () => {
    server.use(
      http.get('*/api/v1/workflows/:id/runs', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'Your role does not let you read the runs.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findByText('Your role does not let you read the runs.')).toBeInTheDocument();
    expect(within(runs).queryByRole('listitem')).toBeNull();
  });

  it('reads the older runs a page at a time, only when asked', async () => {
    db.workflowRuns = finishedRuns('wf-backend', 'Backend changes', 51);
    const asked: URL[] = [];
    traffic.onRequest((request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/workflows/wf-backend/runs')) asked.push(url);
    });
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findAllByRole('listitem')).toHaveLength(50);
    expect(asked.map((url) => url.searchParams.get('before'))).toEqual([null]);
    await userEvent.click(within(runs).getByRole('button', { name: 'Show older runs' }));
    await vi.waitFor(() => {
      expect(runRows(runs)).toHaveLength(51);
    });
    expect(asked.map((url) => url.searchParams.get('before'))).toEqual([null, 'run-old-049']);
    expect(within(runs).queryByRole('button', { name: 'Show older runs' })).toBeNull();
  });

  it('lets an owner run it: the run comes first in the list', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/workflows/wf-backend/runs'))
        void request
          .clone()
          .json()
          .then((body: unknown) => sent.push(body));
    });
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findAllByRole('listitem')).toHaveLength(3);
    await user.click(within(runs).getByRole('button', { name: 'Run it now' }));
    await vi.waitFor(() => {
      expect(runRows(runs)).toHaveLength(4);
    });
    expect(runRows(runs)[0]).toHaveTextContent('Queued');
    expect(runRows(runs)[0]).toHaveTextContent('Started by maya · from the console');
    expect(sent).toEqual([{ inputs: {} }]);
    expect(db.workflowRuns).toHaveLength(5);
  });

  it('holds the button while the run starts', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/workflows/:id/runs', never));
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    await user.click(await within(runs).findByRole('button', { name: 'Run it now' }));
    expect(within(runs).getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('says why a run did not start, and keeps the list as it was', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/workflows/:id/runs', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'Only owners and admins run workflows.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findAllByRole('listitem')).toHaveLength(3);
    await user.click(within(runs).getByRole('button', { name: 'Run it now' }));
    expect(await within(runs).findByRole('alert')).toHaveTextContent('Only owners and admins run workflows.');
    expect(runRows(runs)).toHaveLength(3);
    expect(within(runs).getByRole('button', { name: 'Run it now' })).toBeEnabled();
  });

  it('gives a member the runs to read, and no button to run it', async () => {
    setDemoRole(db, 'member');
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' });
    expect(await within(runs).findAllByRole('listitem')).toHaveLength(3);
    expect(within(runs).queryByRole('button', { name: 'Run it now' })).toBeNull();
  });
});

describe('the runs of every workflow', () => {
  it('lists the runs of the organization, newest first, each leading to its workflow', async () => {
    visit('/workflows');
    const runs = await screen.findByRole('region', { name: 'Recent runs' });
    const rows = await within(runs).findAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0] ?? runs).getByRole('link', { name: 'Backend changes' })).toHaveAttribute(
      'href',
      '/workflows/wf-backend',
    );
    expect(rows[0]).toHaveTextContent('Running');
    expect(rows[1]).toHaveTextContent('Database migrations');
    expect(rows[1]).toHaveTextContent('Cancelled');
    expect(within(rows[1] ?? runs).getByRole('link', { name: 'Database migrations' })).toHaveAttribute(
      'href',
      '/workflows/wf-migrations',
    );
  });

  it('says when nothing ran yet', async () => {
    db.workflowRuns = [];
    visit('/workflows');
    const runs = await screen.findByRole('region', { name: 'Recent runs' });
    expect(await within(runs).findByText('No run yet.')).toBeInTheDocument();
  });

  it('says why the runs did not come, and still lists the workflows', async () => {
    server.use(
      http.get('*/api/v1/runs', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'Your role does not let you read the runs.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/workflows');
    const runs = await screen.findByRole('region', { name: 'Recent runs' });
    expect(await within(runs).findByText('Your role does not let you read the runs.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Backend changes/ })).toBeInTheDocument();
  });

  it('reads the older runs a page at a time', async () => {
    db.workflowRuns = finishedRuns('wf-backend', 'Backend changes', 51);
    visit('/workflows');
    const runs = await screen.findByRole('region', { name: 'Recent runs' });
    expect(await within(runs).findAllByRole('listitem')).toHaveLength(50);
    await userEvent.click(within(runs).getByRole('button', { name: 'Show older runs' }));
    await vi.waitFor(() => {
      expect(runRows(runs)).toHaveLength(51);
    });
    expect(within(runs).queryByRole('button', { name: 'Show older runs' })).toBeNull();
  });

  it('shows the shape of the runs while they load', async () => {
    server.use(http.get('*/api/v1/runs', never));
    visit('/workflows');
    const runs = await screen.findByRole('region', { name: 'Recent runs' });
    expect(within(runs).getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
