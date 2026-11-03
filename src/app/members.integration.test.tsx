// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { largeMembers } from '@/mocks/fixtures/large';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

function rowsOf(list: HTMLElement): HTMLElement[] {
  return within(list).getAllByRole('listitem');
}

function rowNamed(name: string): HTMLElement {
  const row = screen.getAllByRole('listitem').find((item) => item.textContent.includes(name));
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
}

async function people(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'People' });
  const list = heading.parentElement?.querySelector('ul');
  if (list === null || list === undefined) throw new Error('no list of people');
  return list;
}

function members(): { login: string; role: string }[] {
  return (db.orgMembers[ACME] ?? []).map(({ login, role }) => ({ login, role }));
}

describe('the members screen', () => {
  it('names the organization and the viewer’s role, and lists the people who decide first', async () => {
    visit('/members');
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(await screen.findByText('5 people · you are Admin')).toBeInTheDocument();
    const rows = rowsOf(await people());
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Lena Ortiz',
      'Maya Lind (you)',
      'Samir Haddad',
      'theo',
      'Inès Morel',
    ]);
    expect(rows[0]).toHaveTextContent('@lena');
    expect(rows[3]).toHaveTextContent('theo@acme.dev');
    // Nobody changes the owner, and nobody changes their own role.
    expect(within(rowNamed('Lena Ortiz')).getByText('Owner')).toBeInTheDocument();
    expect(within(rowNamed('Maya Lind')).getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Role of Lena Ortiz' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Role of Maya Lind' })).toBeNull();
  });

  it('shows a person without a name or an address by their login alone, and a role it does not know as is', async () => {
    db.orgMembers[ACME] = [
      ...(db.orgMembers[ACME] ?? []),
      {
        id: '9dcf5a7e-81a2-4de4-9f60-718293a4b5c6',
        login: 'kim',
        name: '',
        avatarUrl: '',
        email: null,
        role: 'auditor',
        joinedAt: '2026-10-01T00:00:00Z',
      },
    ];
    visit('/members');
    await people();
    const row = rowNamed('kim');
    expect(row.querySelectorAll('.o-row__meta')).toHaveLength(0);
    expect(within(row).getByText('auditor')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('lets an admin give the roles an admin can give, never owner nor admin', async () => {
    const user = userEvent.setup();
    visit('/members');
    const select = await screen.findByRole('combobox', { name: 'Role of theo' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Approver', 'Member', 'Billing']);
    await user.selectOptions(select, 'approver');
    expect(await screen.findByRole('combobox', { name: 'Role of theo' })).toHaveValue('approver');
    fireEvent.change(screen.getByRole('combobox', { name: 'Role of theo' }), { target: { value: 'king' } });
    expect(members().find((member) => member.login === 'theo')?.role).toBe('approver');
  });

  it('lets the owner make an admin', async () => {
    setDemoRole(db, 'owner');
    visit('/members');
    expect(await screen.findByText('5 people · you are Owner')).toBeInTheDocument();
    const select = await screen.findByRole('combobox', { name: 'Role of theo' });
    expect(within(select).getByRole('option', { name: 'Admin' })).toBeInTheDocument();
  });

  it('holds the row while a role is saved', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/orgs/:org/members/:login', async () => delay('infinite')));
    visit('/members');
    const select = await screen.findByRole('combobox', { name: 'Role of Samir Haddad' });
    await user.selectOptions(select, 'member');
    expect(select).toBeDisabled();
    expect(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('says when a role change is refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/orgs/:org/members/:login', () =>
        HttpResponse.json(
          { error: { type: 'not_allowed', message: 'Your role does not allow this change.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/members');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Role of theo' }), 'billing');
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this change.');
  });

  it('removes a person after a second click that names them, and can be taken back', async () => {
    const user = userEvent.setup();
    visit('/members');
    await people();
    await user.click(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Remove' }));
    await user.click(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Keep' }));
    expect(members().map((member) => member.login)).toContain('samir');
    await user.click(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Remove' }));
    await user.click(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Remove Samir Haddad' }));
    expect(await screen.findByText('4 people · you are Admin')).toBeInTheDocument();
    expect(members().map((member) => member.login)).not.toContain('samir');
  });

  it('holds the row while a person is removed, and says when it was refused', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/orgs/:org/members/theo', async () => delay('infinite')));
    server.use(
      http.delete('*/api/v1/orgs/:org/members/samir', () =>
        HttpResponse.json({ error: { type: 'not_allowed', message: 'not this one' } }, { status: 403 }),
      ),
    );
    visit('/members');
    await people();
    await user.click(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Remove' }));
    await user.click(within(rowNamed('Samir Haddad')).getByRole('button', { name: 'Remove Samir Haddad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not this one');
    await user.click(within(rowNamed('theo')).getByRole('button', { name: 'Remove' }));
    await user.click(within(rowNamed('theo')).getByRole('button', { name: 'Remove theo' }));
    expect(screen.getByRole('combobox', { name: 'Role of theo' })).toBeDisabled();
  });

  it('invites the addresses typed, says which are not addresses, and who was invited', async () => {
    const user = userEvent.setup();
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    const send = within(invite).getByRole('button', { name: 'Send 0 invitations' });
    expect(send).toBeDisabled();
    await user.type(
      within(invite).getByRole('textbox', { name: 'E-mail addresses' }),
      'Ana@acme.dev, no.pe, theo@acme.dev',
    );
    expect(within(invite).getByText('Not an e-mail address: no.pe')).toBeInTheDocument();
    const role = within(invite).getByRole('combobox', { name: 'Invite as' });
    expect(within(role).queryByRole('option', { name: 'Owner' })).toBeNull();
    await user.selectOptions(role, 'approver');
    fireEvent.change(role, { target: { value: 'king' } });
    await user.click(within(invite).getByRole('button', { name: 'Send 2 invitations' }));
    expect(await within(invite).findByRole('alert')).toHaveTextContent(
      'Invitation sent to ana@acme.dev. The link works for the account that holds this address.',
    );
    expect(within(invite).getByRole('textbox')).toHaveValue('');
    const waiting = await screen.findByRole('heading', { level: 2, name: 'Waiting invitations' });
    expect(waiting.parentElement).toHaveTextContent('ana@acme.dev');
    expect(db.invitations.find((item) => item.email === 'ana@acme.dev')?.role).toBe('approver');
  });

  it('says when everyone invited is already in', async () => {
    const user = userEvent.setup();
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'theo@acme.dev');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expect(await within(invite).findByRole('alert')).toHaveTextContent('already in the organization');
  });

  it('says invitations were not sent, and keeps what was typed', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/orgs/:org/members/invites', () =>
        HttpResponse.json(
          { error: { type: 'rate_limited', message: 'too many invitations' } },
          { status: 429 },
        ),
      ),
    );
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'ana@acme.dev');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expect(await within(invite).findByRole('alert')).toHaveTextContent('too many invitations');
    expect(within(invite).getByRole('textbox')).toHaveValue('ana@acme.dev');
  });

  it('holds the invite button while invitations go', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/orgs/:org/members/invites', async () => delay('infinite')));
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'ana@acme.dev');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expect(within(invite).getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('makes an invitation link, shows it once, and copies it', async () => {
    const user = userEvent.setup();
    visit('/members');
    const link = await screen.findByRole('region', { name: 'Invitation link' });
    const uses = within(link).getByRole('spinbutton', { name: 'Uses' });
    expect(uses).toHaveValue(10);
    // Cleared to type another number, the field stays empty until it is left.
    await user.clear(uses);
    expect(uses).toHaveValue(null);
    await user.type(uses, '500');
    await user.tab();
    expect(uses).toHaveValue(100);
    await user.clear(uses);
    await user.tab();
    expect(uses).toHaveValue(1);
    await user.clear(uses);
    await user.type(uses, '3');
    await user.selectOptions(within(link).getByRole('combobox', { name: 'Joins as' }), 'approver');
    await user.click(within(link).getByRole('button', { name: 'Create a link' }));
    expect(
      await within(link).findByText('This link lets 3 people join. It is shown once: copy it now.'),
    ).toBeInTheDocument();
    const url = within(link).getByRole('textbox', { name: 'Invitation link' });
    expect(url).toHaveDisplayValue(/^http:\/\/ostrom\.test\/invite#token=inv_\d+$/);
    await user.click(within(link).getByRole('button', { name: 'Copy Invitation link' }));
    expect(await within(link).findByText('Copied')).toBeInTheDocument();
    expect(url).toHaveValue(await navigator.clipboard.readText());
    expect(rowNamed('Invitation link · 0 of 3 used')).toHaveTextContent('Approver');
    // Focused, the link is selected whole, ready to copy by hand.
    await user.click(url);
    expect(url).toHaveProperty('selectionStart', 0);
    // A second link was never copied: nothing says it was.
    await user.click(within(link).getByRole('button', { name: 'Create a link' }));
    await vi.waitFor(() => {
      expect(within(link).queryByText('Copied')).toBeNull();
    });
  });

  it('says how many can join when the server leaves the uses open, and when the copy failed', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/orgs/:org/invitations/links', () =>
        HttpResponse.json(
          {
            invitation: {
              id: 'inv-x',
              email: null,
              role: 'member',
              createdAt: '2026-10-30T09:00:00Z',
              expiresAt: '2026-11-06T09:00:00Z',
              maxUses: null,
              uses: 0,
            },
            url: 'http://ostrom.test/invite#token=inv_x',
          },
          { status: 201 },
        ),
      ),
    );
    visit('/members');
    const link = await screen.findByRole('region', { name: 'Invitation link' });
    await user.click(within(link).getByRole('button', { name: 'Create a link' }));
    expect(
      await within(link).findByText('This link lets 10 people join. It is shown once: copy it now.'),
    ).toBeInTheDocument();
    const copy = within(link).getByRole('button', { name: 'Copy Invitation link' });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(copy);
    expect(await within(link).findByText('Copy failed: select it and copy by hand')).toBeInTheDocument();
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementationOnce(() => {
      throw new TypeError('no clipboard');
    });
    await user.click(copy);
    expect(within(link).getByText('Copy failed: select it and copy by hand')).toBeInTheDocument();
  });

  it('says when a link was not made, and holds the button meanwhile', async () => {
    const user = userEvent.setup();
    let answer = 0;
    server.use(
      http.post('*/api/v1/orgs/:org/invitations/links', async () => {
        answer += 1;
        if (answer === 1)
          return HttpResponse.json(
            { error: { type: 'rate_limited', message: 'slow down' } },
            { status: 429 },
          );
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/members');
    const link = await screen.findByRole('region', { name: 'Invitation link' });
    await user.click(within(link).getByRole('button', { name: 'Create a link' }));
    expect(await within(link).findByRole('alert')).toHaveTextContent('slow down');
    await user.click(within(link).getByRole('button', { name: 'Create a link' }));
    expect(within(link).getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('lists the waiting invitations and revokes one after a second click', async () => {
    const user = userEvent.setup();
    db.invitations = [
      ...db.invitations,
      {
        id: 'inv-open',
        orgId: ACME,
        token: 'inv_open',
        email: null,
        role: 'member',
        createdAt: '2026-10-29T09:00:00.000Z',
        expiresAt: '2027-10-29T09:00:00.000Z',
        maxUses: null,
        uses: 2,
      },
      {
        id: 'inv-audit',
        orgId: ACME,
        token: 'inv_audit',
        email: 'kim@acme.dev',
        role: 'auditor',
        createdAt: '2026-10-29T09:00:00.000Z',
        expiresAt: '2027-10-29T09:00:00.000Z',
        maxUses: 1,
        uses: 0,
      },
    ];
    visit('/members');
    await screen.findByRole('heading', { level: 2, name: 'Waiting invitations' });
    expect(rowNamed('Invitation link · 2 of unlimited used')).toHaveTextContent('Member');
    expect(rowNamed('kim@acme.dev')).toHaveTextContent('auditor');
    const jo = rowNamed('jo@acme.dev');
    expect(jo).toHaveTextContent('Expires Oct 28, 2027');
    await user.click(within(jo).getByRole('button', { name: 'Revoke' }));
    await user.click(within(rowNamed('jo@acme.dev')).getByRole('button', { name: 'Revoke the invitation' }));
    await vi.waitFor(() => {
      expect(screen.queryByText('jo@acme.dev')).toBeNull();
    });
    expect(db.invitations.map((item) => item.id)).not.toContain('inv-jo');
  });

  it('says when an invitation was not revoked, and holds it meanwhile', async () => {
    const user = userEvent.setup();
    let answer = 0;
    server.use(
      http.delete('*/api/v1/orgs/:org/invitations/:id', async () => {
        answer += 1;
        if (answer === 1)
          return HttpResponse.json(
            { error: { type: 'not_found', message: 'already gone' } },
            { status: 404 },
          );
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/members');
    await screen.findByRole('heading', { level: 2, name: 'Waiting invitations' });
    await user.click(within(rowNamed('jo@acme.dev')).getByRole('button', { name: 'Revoke' }));
    await user.click(within(rowNamed('jo@acme.dev')).getByRole('button', { name: 'Revoke the invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already gone');
    await user.click(within(rowNamed('jo@acme.dev')).getByRole('button', { name: 'Revoke' }));
    await user.click(within(rowNamed('jo@acme.dev')).getByRole('button', { name: 'Revoke the invitation' }));
    expect(within(rowNamed('jo@acme.dev')).getByRole('button', { name: 'Revoke' })).toBeDisabled();
  });

  it('shows roles without controls, invitations nor forms to someone who does not manage the organization', async () => {
    setDemoRole(db, 'member');
    visit('/members');
    expect(await screen.findByText('5 people · you are Member')).toBeInTheDocument();
    await people();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Invite people' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Invitation link' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Waiting invitations' })).toBeNull();
  });

  it('says the role as the server wrote it when the console does not know it', async () => {
    setDemoRole(db, 'member');
    server.use(
      http.get('*/api/v1/orgs', () =>
        HttpResponse.json({
          items: [
            { id: ACME, slug: 'acme', name: 'Acme', role: 'auditor', createdAt: '2026-09-01T09:00:00Z' },
          ],
        }),
      ),
    );
    visit('/members');
    expect(await screen.findByText('5 people · you are auditor')).toBeInTheDocument();
  });

  it('says why the people did not load', async () => {
    server.use(
      http.get('*/api/v1/orgs/:org/members', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'members are down' } }, { status: 500 }),
      ),
    );
    visit('/members');
    expect(await screen.findByText('members are down')).toBeInTheDocument();
  });

  it('says the invitations did not load in their own section, and still lists the people', async () => {
    server.use(
      http.get('*/api/v1/orgs/:org/invitations', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'invitations are down' } }, { status: 500 }),
      ),
    );
    visit('/members');
    const waiting = await screen.findByRole('heading', { level: 2, name: 'Waiting invitations' });
    expect(await within(waiting.parentElement ?? document.body).findByRole('alert')).toHaveTextContent(
      'invitations are down',
    );
    expect(rowsOf(await people())).toHaveLength(5);
    expect(within(waiting.parentElement ?? document.body).queryByRole('list')).toBeNull();
  });

  it('says why the organization did not load', async () => {
    server.use(
      http.get('*/api/v1/orgs', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'orgs are down' } }, { status: 500 }),
      ),
    );
    visit('/members');
    expect(await screen.findByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument();
    expect(await screen.findByText('orgs are down')).toBeInTheDocument();
  });

  it('offers to create an organization to a person in none', async () => {
    db.noOrganization = true;
    visit('/members');
    expect(await screen.findByText('No organization yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create yours' })).toHaveAttribute('href', '/');
  });

  it('asks which organization to a person in several who chose none', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [otherOrganization()];
    visit('/members');
    expect(
      await screen.findByText('Which organization?', { selector: '.o-empty__title' }),
    ).toBeInTheDocument();
    // The picker opens by itself; closed, the screen's own button opens it again.
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    await user.click(
      within(screen.getByRole('main')).getByRole('button', { name: 'Choose an organization' }),
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('a change of the people the server holds for a confirmation', () => {
  const HELD = {
    confirmationId: 'gc-held',
    confirmUrl: 'https://ostrom.test/confirm/gc-held',
    expiresAt: '2026-11-03T18:00:00.000Z',
  };

  /** The console's own writes apply at once; a 202 is still said, with where to confirm, never swallowed. */
  async function heldNotice(): Promise<void> {
    const link = await screen.findByRole('link', { name: 'Open the confirmation' });
    expect(link).toHaveAttribute('href', '/confirm/gc-held');
    expect(
      screen.getByText(/Ostrom holds this change until an owner or an admin confirms it\./),
    ).toBeInTheDocument();
  }

  it('says a role change waits for a confirmation', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/orgs/:org/members/:login', () => HttpResponse.json(HELD, { status: 202 })),
    );
    visit('/members');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Role of theo' }), 'billing');
    await heldNotice();
  });

  it('says invitations wait for a confirmation, and names nobody as invited', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/orgs/:org/members/invites', () => HttpResponse.json(HELD, { status: 202 })),
    );
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox', { name: 'E-mail addresses' }), 'ana@acme.dev');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    await heldNotice();
    expect(screen.queryByText(/Invitation sent to/)).toBeNull();
    expect(screen.queryByText('Everyone on the list is already in the organization.')).toBeNull();
  });

  it('says a link waits for a confirmation, and shows no address', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/orgs/:org/invitations/links', () => HttpResponse.json(HELD, { status: 202 })),
    );
    visit('/members');
    const link = await screen.findByRole('region', { name: 'Invitation link' });
    await user.click(within(link).getByRole('button', { name: 'Create a link' }));
    await heldNotice();
    expect(within(link).queryByRole('button', { name: 'Copy Invitation link' })).toBeNull();
  });
});

describe('the members of a large organization', () => {
  beforeEach(() => {
    db.orgMembers[ACME] = [...(db.orgMembers[ACME] ?? []), ...largeMembers()];
  });

  /**
   * Searches for `text` in one input event. Typed letter by letter, each letter filters and draws the rows again,
   * which costs jsdom seconds and proves nothing more.
   */
  async function find(text: string): Promise<void> {
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Find someone' }));
    await userEvent.paste(text);
  }

  /** The people on screen, once there are `count` of them. */
  async function shown(count: number): Promise<void> {
    await waitFor(async () => {
      expect(rowsOf(await people())).toHaveLength(count);
    });
  }

  it('asks for the first hundred on load, and for the next hundred only when asked', async () => {
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).slice(0, 250);
    const asked: URL[] = [];
    traffic.onRequest((request) => {
      const url = new URL(request.url);
      if (/\/api\/v1\/orgs\/[^/]+\/members$/.test(url.pathname)) asked.push(url);
    });
    visit('/members');
    await shown(100);
    expect(asked.map((url) => url.search)).toEqual(['?limit=100']);
    await userEvent.click(screen.getByRole('button', { name: 'Show more people' }));
    await shown(200);
    expect(asked).toHaveLength(2);
    expect(asked[1]?.searchParams.get('limit')).toBe('100');
    expect(asked[1]?.searchParams.get('after')).toBe(db.orgMembers[ACME][99]?.id);
  });

  it('says more than the people read until every page is in, then finds anyone by name, login or address', async () => {
    // 101 people: the second page holds one, so the count is known only once both pages are read.
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).slice(0, 101);
    visit('/members');
    expect(await screen.findByText('More than 100 people · you are Admin')).toBeInTheDocument();
    await shown(100);
    await userEvent.click(screen.getByRole('button', { name: 'Show more people' }));
    await shown(101);
    expect(screen.getByText('101 people · you are Admin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more people' })).toBeNull();
    await find('developer 01');
    expect(rowsOf(await people())).toHaveLength(10);
    // The one person of the second page: the search covers a page read later.
    await find('DEV-095@ACME');
    expect(rowsOf(await people())).toHaveLength(1);
    await find('  nobody  ');
    expect(screen.getByText('Nobody matches “nobody”.')).toBeInTheDocument();
  });

  it('says nobody matches among the people read, and still offers the next hundred', async () => {
    visit('/members');
    // Search once the first hundred are read, so the message counts them.
    expect(await screen.findByText('More than 100 people · you are Admin')).toBeInTheDocument();
    await find('  dev-499  ');
    expect(
      await screen.findByText('Nobody matches “dev-499” among the 100 people read so far.'),
    ).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 2, name: 'People' });
    expect(heading.parentElement?.querySelector('ul')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show more people' })).toBeInTheDocument();
  });
});
