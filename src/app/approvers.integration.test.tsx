// SPDX-License-Identifier: AGPL-3.0-only
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
    expect(rows[0]).toHaveTextContent('Owners of acme/billing-api');
    expect(rows[0]).toHaveTextContent('Maya Lind, Samir Haddad');
    expect(rows[1]).toHaveTextContent('from 09:00-18:00 · on mon-fri');
    expect(within(gates).getAllByText('Nobody')).toHaveLength(1);
    expect(rows[3]).toHaveTextContent('Nobody');
    expect(screen.getByText(/Nobody may approve Drop a table/)).toBeInTheDocument();

    const people = within(region('By person')).getAllByRole('listitem');
    expect(people.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Maya Lind',
      'Samir Haddad',
    ]);
    expect(people[0]).toHaveTextContent('Merge to main · Run a migration');
    expect(people[0]).toHaveTextContent('2 steps');
  });

  it('says how self-approval works and lets an admin change it', async () => {
    const user = userEvent.setup();
    visit('/approvers');
    const policy = await screen.findByRole('region', { name: 'When the asker is an approver' });
    expect(policy).toHaveTextContent('only when nobody else can');
    await user.selectOptions(within(policy).getByRole('combobox', { name: 'Self-approval' }), 'never');
    expect(await within(policy).findByText(/never approves their own request/)).toBeInTheDocument();
    expect(db.selfApproval).toBe('never');
    fireEvent.change(within(policy).getByRole('combobox', { name: 'Self-approval' }), {
      target: { value: 'sometimes' },
    });
    expect(db.selfApproval).toBe('never');
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
    await user.selectOptions(within(policy).getByRole('combobox', { name: 'Self-approval' }), 'never');
    expect(await within(policy).findByRole('alert')).toHaveTextContent('owners only');
  });

  it('disables the policy select while it saves', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/gates/policy', async () => delay('infinite')));
    visit('/approvers');
    const select = await screen.findByRole('combobox', { name: 'Self-approval' });
    await user.selectOptions(select, 'never');
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
    expect(await screen.findByText(/only when nobody else can/)).toBeInTheDocument();
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
      http.get('*/api/v1/members', () =>
        HttpResponse.json({
          items: [
            {
              id: '8cbe4f6d-7091-4cd3-8e5f-60718293a4b5',
              login: 'ana',
              name: '',
              avatarUrl: '',
              role: 'approver',
            },
          ],
        }),
      ),
      http.get('*/api/v1/workflows', () =>
        HttpResponse.json({
          items: [
            {
              id: 'w',
              name: 'Docs',
              domain: 'acme/docs',
              status: 'accepted',
              foundAt: '2026-10-01T00:00:00.000Z',
              nodes: [{ id: 'g', kind: 'gate', label: 'Publish', approvers: ['ana', 'zoe'] }],
              edges: [],
            },
          ],
        }),
      ),
    );
    visit('/approvers');
    const gates = await screen.findByRole('region', { name: 'By step' });
    expect(within(gates).getByRole('listitem')).toHaveTextContent('ana, zoe');
    expect(screen.queryByText(/Nobody may approve/)).toBeNull();
    expect(region('By person')).toHaveTextContent('1 step');
  });

  it('says when no workflow has a gate yet', async () => {
    server.use(http.get('*/api/v1/workflows', () => HttpResponse.json({ items: [] })));
    visit('/approvers');
    expect(await screen.findByText('No workflow asks for an approval yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'By person' })).toBeNull();
  });

  it('counts several gates nobody may approve', async () => {
    db.workflows = db.workflows.map((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => ({ ...node, approvers: [] })),
    }));
    visit('/approvers');
    expect(await screen.findByText(/Nobody may approve 4 steps/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'By person' })).toBeNull();
  });

  it('shows the shape of the page while it loads, and why it does not come', async () => {
    server.use(http.get('*/api/v1/workflows', never), http.get('*/api/v1/gates/policy', never));
    visit('/approvers');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says why the page does not come', async () => {
    server.use(http.get('*/api/v1/workflows', () => HttpResponse.error()));
    visit('/approvers');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});
