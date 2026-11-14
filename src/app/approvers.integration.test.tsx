// SPDX-License-Identifier: Apache-2.0
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('who approves what', () => {
  it('lists every gate with its approvers, says which gate nobody may approve, and reads it per person', async () => {
    visit('/approvers');
    expect(await screen.findByRole('heading', { level: 1, name: 'Who approves what' })).toBeInTheDocument();
    const gates = await screen.findByRole('region', { name: 'By step' });
    const rows = within(gates).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Merge to main',
      'Deploy to production',
      'Run a migration',
      'Drop a table',
    ]);
    expect(rows[0]).toHaveTextContent('Backend changes · Merge into main');
    expect(rows[2]).toHaveTextContent('Database migrations · Migrate');
    expect(rows[0]).toHaveTextContent('Owners of acme/billing-api');
    expect(rows[0]).toHaveTextContent('Maya Lind, Samir Haddad');
    expect(rows[1]).toHaveTextContent('from 09:00-18:00 · on mon-fri');
    expect(within(gates).getAllByText('Nobody')).toHaveLength(1);
    expect(rows[3]).toHaveTextContent('Nobody');
    // Drop a table names nobody, but its workflow is only proposed: it is not enforced yet, so nothing is blocked.
    expect(screen.queryByText(/Nobody may approve/)).toBeNull();

    const people = within(region('By person')).getAllByRole('listitem');
    expect(people.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Maya Lind',
      'Samir Haddad',
    ]);
    // As the server reads its catalogue: a gate of a proposed workflow does not stop anyone yet.
    expect(people[0]).toHaveTextContent('Merge to main · Run a migration (not enforced yet)');
    expect(people[0]).toHaveTextContent('2 steps');
    expect(people[1]).toHaveTextContent('Deploy to production · Merge to main');
    // What no gate covers runs without asking anyone.
    expect(
      screen.getByText('No gate covers push-main: an agent does it without asking anyone.'),
    ).toBeInTheDocument();
    // The proposed gate naming nobody says it is not enforced yet, and is not marked as blocking.
    expect(rows[3]).toHaveTextContent('proposed, not enforced yet');
    expect(within(rows[3] ?? document.body).getByText('Nobody')).not.toHaveClass('o-badge--danger');
  });

  it('says how self-approval works and lets an admin change it', async () => {
    const user = userEvent.setup();
    visit('/approvers');
    const policy = await screen.findByRole('region', { name: 'When the asker is an approver' });
    // Never, by default (S2-15): the organization may let a sole approver approve their own request.
    expect(policy).toHaveTextContent('never approves their own request');
    await user.selectOptions(
      within(policy).getByRole('combobox', { name: 'Self-approval' }),
      'sole-approver',
    );
    expect(await within(policy).findByText(/only when nobody else can/)).toBeInTheDocument();
    expect(db.selfApproval).toBe('sole-approver');
    fireEvent.change(within(policy).getByRole('combobox', { name: 'Self-approval' }), {
      target: { value: 'sometimes' },
    });
    expect(db.selfApproval).toBe('sole-approver');
  });

  it('holds the policy while it saves, and says when it was not saved', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/gates/policy', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'owners only' } }, { status: 403 }),
      ),
    );
    visit('/approvers');
    const policy = await screen.findByRole('region', { name: 'When the asker is an approver' });
    await user.selectOptions(
      within(policy).getByRole('combobox', { name: 'Self-approval' }),
      'sole-approver',
    );
    expect(await within(policy).findByRole('alert')).toHaveTextContent('owners only');
  });

  it('disables the policy select while it saves', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/gates/policy', async () => delay('infinite')));
    visit('/approvers');
    const select = await screen.findByRole('combobox', { name: 'Self-approval' });
    await user.selectOptions(select, 'sole-approver');
    expect(select).toBeDisabled();
  });

  it('shows the policy without a control to someone who does not manage the organization', async () => {
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
    visit('/approvers');
    expect(await screen.findByText(/never approves their own request/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('gives an owner the same control', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          dev: { login: 'lena', verified: true, via: 'github' },
          member: { id: MEMBER_IDS.lena, login: 'lena', avatarUrl: '', role: 'owner' },
          capabilities: [],
        }),
      ),
    );
    visit('/approvers');
    expect(await screen.findByRole('combobox', { name: 'Self-approval' })).toBeInTheDocument();
  });

  it('shows a policy it does not know as the server says it', async () => {
    server.use(http.get('*/api/v1/gates/policy', () => HttpResponse.json({ selfApproval: 'quorum' })));
    visit('/approvers');
    expect(await screen.findByText('quorum')).toBeInTheDocument();
  });

  it('names approvers by login when the organization gives no name, and needs no warning when every gate has one', async () => {
    server.use(
      http.get('*/api/v1/orgs/:org/members', () =>
        HttpResponse.json({
          items: [
            {
              id: '8cbe4f6d-7091-4cd3-8e5f-60718293a4b5',
              login: 'ana',
              name: '',
              avatarUrl: '',
              email: null,
              role: 'approver',
              joinedAt: '2026-09-01T09:00:00.000Z',
            },
          ],
        }),
      ),
    );
    db.workflows = [
      {
        id: 'w',
        name: 'Docs',
        domain: 'acme/docs',
        status: 'accepted',
        foundAt: '2026-10-01T00:00:00.000Z',
        nodes: [
          {
            id: 'g',
            kind: 'gate',
            label: 'Publish',
            approvers: ['ana', 'zoe'],
            actions: [
              { class: 'publish', label: 'Publish', patterns: ['npm publish'], repos: ['acme/docs'] },
            ],
          },
        ],
        edges: [],
      },
    ];
    visit('/approvers');
    const gates = await screen.findByRole('region', { name: 'By step' });
    expect(within(gates).getByRole('listitem')).toHaveTextContent('ana, zoe');
    expect(screen.queryByText(/Nobody may approve/)).toBeNull();
    expect(region('By person')).toHaveTextContent('1 step');
  });

  it('says when no workflow has a gate yet', async () => {
    db.workflows = [];
    visit('/approvers');
    expect(await screen.findByText('No workflow asks for an approval yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'By person' })).toBeNull();
    // This is when it matters most: every action runs without asking anyone.
    expect(await screen.findByText(/No gate covers 5 actions/)).toBeInTheDocument();
  });

  it('counts several gates nobody may approve', async () => {
    db.workflows = db.workflows.map((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => ({ ...node, approvers: [] })),
    }));
    visit('/approvers');
    // Only the gates of the accepted workflow block: those of the proposed one stop nobody yet.
    expect(
      await screen.findByText(/Nobody may approve 2 steps \(Deploy to production, Merge to main\)/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'By person' })).toBeNull();
  });

  it('shows the shape of the page while it loads, and why it does not come', async () => {
    server.use(http.get('*/api/v1/workflows', never), http.get('*/api/v1/gates/policy', never));
    visit('/approvers');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('keeps the steps when the server does not say who approves what, and a gate covering no action says so', async () => {
    server.use(http.get('*/api/v1/gates/approvers', () => new HttpResponse(null, { status: 404 })));
    db.workflows = db.workflows.map((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => (node.id === 'm-orphan' ? { ...node, actions: [] } : node)),
    }));
    visit('/approvers');
    expect(
      await screen.findByText('The server does not say who approves what person by person yet.'),
    ).toBeInTheDocument();
    const rows = within(region('By step')).getAllByRole('listitem');
    expect(rows[3]).toHaveTextContent('covers no action, so it stops nothing');
    expect(screen.queryByRole('region', { name: 'By person' })).toBeNull();
  });

  it('puts the busiest approver first', async () => {
    db.workflows = db.workflows.map((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => {
        if (node.id === 'n-deploy') return { ...node, approvers: ['zed'] };
        if (node.id === 'n-merge') return { ...node, approvers: ['maya', 'samir', 'zed'] };
        return node.id === 'm-gate' ? { ...node, approvers: ['maya', 'zed'] } : node;
      }),
    }));
    visit('/approvers');
    const section = await screen.findByRole('region', { name: 'By person' });
    const people = within(section).getAllByRole('listitem');
    expect(people.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'zed',
      'Maya Lind',
      'Samir Haddad',
    ]);
  });

  it('says why the page does not come', async () => {
    server.use(http.get('*/api/v1/workflows', () => HttpResponse.error()));
    visit('/approvers');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });

  it('says nothing about uncovered actions when every action has a gate', async () => {
    server.use(
      http.get('*/api/v1/gates/approvers', () =>
        HttpResponse.json({ approvers: [], unanswered: [], ungated: [] }),
      ),
    );
    visit('/approvers');
    expect(
      await within(await screen.findByRole('region', { name: 'By step' })).findAllByRole('listitem'),
    ).toHaveLength(4);
    expect(screen.queryByText(/No gate covers/)).toBeNull();
    expect(screen.queryByText(/Nobody may approve/)).toBeNull();
  });

  it('says why who approves what does not come, rather than blaming an older server', async () => {
    server.use(
      http.get('*/api/v1/gates/approvers', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'graph is down' } }, { status: 500 }),
      ),
    );
    visit('/approvers');
    expect(await screen.findByText('graph is down')).toBeInTheDocument();
    expect(screen.queryByText(/does not say who approves/)).toBeNull();
    // The steps still show; only what the graph says is missing.
    expect(within(region('By step')).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('region', { name: 'By person' })).toBeNull();
  });
});
