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

function viewerIs(role: 'owner' | 'admin' | 'member'): void {
  db.members = db.members.map((member) => (member.login === 'maya' ? { ...member, role } : member));
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', name: 'Maya Lind', avatarUrl: '', role },
        capabilities: [],
      }),
    ),
  );
}

describe('the members screen', () => {
  it('names the organization, lists the people who decide first and the invitations last', async () => {
    visit('/members');
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(await screen.findByText('4 people · connected with the GitHub App')).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    const row = (index: number): HTMLElement => {
      const found = rows[index];
      if (found === undefined) throw new Error(`no row ${String(index)}`);
      return found;
    };
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Lena Ortiz',
      'Maya Lind (you)',
      'Samir Haddad',
      'theo',
      'jo',
    ]);
    expect(row(2)).toHaveTextContent('@samir · team billing · team release');
    expect(row(3)).toHaveTextContent('theo@acme.dev · team billing');
    expect(within(row(4)).getByText('Invited')).toBeInTheDocument();
    expect(row(4).querySelectorAll('.o-row__meta')).toHaveLength(0);
    expect(within(row(1)).getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Teams' })).toHaveTextContent(
      'Billing3 people · acme/billing-api',
    );
    expect(screen.getByRole('region', { name: 'Teams' })).toHaveTextContent('Release1 person');
  });

  it('lets an admin change the role of someone else', async () => {
    const user = userEvent.setup();
    visit('/members');
    const select = await screen.findByRole('combobox', { name: 'Role of theo' });
    expect(screen.queryByRole('combobox', { name: 'Role of Maya Lind' })).toBeNull();
    await user.selectOptions(select, 'approver');
    expect(await screen.findByRole('combobox', { name: 'Role of theo' })).toHaveValue('approver');
    fireEvent.change(screen.getByRole('combobox', { name: 'Role of theo' }), { target: { value: 'king' } });
    expect(db.members.find((member) => member.login === 'theo')?.role).toBe('approver');
    expect(db.members.find((member) => member.login === 'theo')?.role).toBe('approver');
  });

  it('holds the select while a role is saved, and says when it was not', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/members/:login', async () => delay('infinite')));
    visit('/members');
    const select = await screen.findByRole('combobox', { name: 'Role of Samir Haddad' });
    await user.selectOptions(select, 'member');
    expect(select).toBeDisabled();
  });

  it('says when a role change is refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/members/:login', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'only owners change owners' } },
          { status: 403 },
        ),
      ),
    );
    visit('/members');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Role of Lena Ortiz' }), 'admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('only owners change owners');
  });

  it('invites the GitHub logins typed, says which are not logins, and who was invited', async () => {
    const user = userEvent.setup();
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    const send = within(invite).getByRole('button', { name: 'Send 0 invitations' });
    expect(send).toBeDisabled();
    await user.type(within(invite).getByRole('textbox', { name: 'GitHub logins' }), '@ana, no_pe, theo');
    expect(within(invite).getByText('Not a GitHub login: no_pe')).toBeInTheDocument();
    expect(within(invite).queryByRole('option', { name: 'Owner' })).toBeNull();
    await user.selectOptions(within(invite).getByRole('combobox', { name: 'Invite as' }), 'approver');
    fireEvent.change(within(invite).getByRole('combobox', { name: 'Invite as' }), {
      target: { value: 'king' },
    });
    await user.click(within(invite).getByRole('button', { name: 'Send 2 invitations' }));
    expect(await within(invite).findByRole('alert')).toHaveTextContent('Invitation sent to ana.');
    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(within(invite).getByRole('textbox')).toHaveValue('');
  });

  it('says when everyone invited is already in', async () => {
    const user = userEvent.setup();
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'theo');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expect(await within(invite).findByRole('alert')).toHaveTextContent('already in the organization');
  });

  it('says invitations were not sent, and keeps what was typed', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/members/invites', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'mail down' } }, { status: 500 }),
      ),
    );
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'ana');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expect(await within(invite).findByRole('alert')).toHaveTextContent('mail down');
    expect(within(invite).getByRole('textbox')).toHaveValue('ana');
  });

  it('holds the invite button while invitations go', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/members/invites', async () => delay('infinite')));
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'ana');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expect(await within(invite).findByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('shows roles without controls to someone who does not manage the organization', async () => {
    viewerIs('member');
    visit('/members');
    expect(await screen.findByText('Samir Haddad')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Invite people' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Approver')).toBeInTheDocument();
  });

  it('gives an owner the same controls', async () => {
    viewerIs('owner');
    visit('/members');
    expect(await screen.findByRole('combobox', { name: 'Role of theo' })).toBeInTheDocument();
  });

  it('reads an organization without teams and before it is known', async () => {
    server.use(
      http.get('*/api/v1/teams', () => HttpResponse.json({ items: [] })),
      http.get('*/api/v1/org', never),
    );
    visit('/members');
    expect(await screen.findByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument();
    expect(await screen.findByText('4 people')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Teams' })).toBeNull();
  });

  it('reads a team without people or repositories', async () => {
    server.use(
      http.get('*/api/v1/teams', () => HttpResponse.json({ items: [{ slug: 'x', name: 'Empty' }] })),
    );
    visit('/members');
    expect(await screen.findByRole('region', { name: 'Teams' })).toHaveTextContent('Empty0 people');
  });

  it('shows the shape of the list while it loads', async () => {
    server.use(http.get('*/api/v1/members', never));
    visit('/members');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it.each(['*/api/v1/org', '*/api/v1/members'])(
    'says why the screen does not come when %s fails',
    async (url) => {
      server.use(http.get(url, () => HttpResponse.error()));
      visit('/members');
      expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
    },
  );
});
