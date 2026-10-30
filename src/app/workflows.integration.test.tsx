// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server } = setupMockApp();
const never = (): Promise<never> => new Promise<never>(() => undefined);

describe('the workflows', () => {
  it('lists each workflow with its repository, steps, approvals and status, and opens one', async () => {
    const user = userEvent.setup();
    visit('/workflows');
    const backend = await screen.findByRole('link', { name: /Backend changes/ });
    expect(backend).toHaveTextContent('acme/billing-api · 5 steps · 2 approvals');
    expect(within(backend).getByText('Accepted')).toBeInTheDocument();
    const migrations = screen.getByRole('link', { name: /Database migrations/ });
    expect(migrations).toHaveTextContent('2 steps · 2 approvals');
    expect(within(migrations).getByText('Proposed')).toBeInTheDocument();
    await user.click(backend);
    expect(await screen.findByRole('heading', { level: 1, name: 'Backend changes' })).toBeInTheDocument();
  });

  it('reads a workflow step by step, from the start, with its branches and approvers', async () => {
    visit('/workflows/wf-backend');
    expect(await screen.findByText('From a branch to production for the billing API.')).toBeInTheDocument();
    expect(screen.getByText('Repository').nextSibling).toHaveTextContent('acme/billing-api');
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
