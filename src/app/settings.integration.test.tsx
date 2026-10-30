// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

async function settings(): Promise<void> {
  expect(
    await screen.findByText('How Acme is named, who is signed in, and deleting it.'),
  ).toBeInTheDocument();
}

describe('the settings screen', () => {
  it('shows the organization’s name, short name and the time zone times are shown in', async () => {
    visit('/settings');
    await settings();
    const general = region('Organization');
    expect(within(general).getByRole('textbox', { name: 'Name' })).toHaveValue('Acme');
    expect(within(general).getByText('acme')).toHaveClass('o-mono');
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(within(general).getByText(`${zone} (this browser)`)).toBeInTheDocument();
  });

  it('lets an admin rename it, everywhere at once', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const general = region('Organization');
    const name = within(general).getByRole('textbox', { name: 'Name' });
    const save = within(general).getByRole('button', { name: 'Save the name' });
    // The same name, or none, is nothing to save.
    expect(save).toBeDisabled();
    await user.clear(name);
    expect(save).toBeDisabled();
    expect(within(general).getByText('A name is needed.')).toBeInTheDocument();
    await user.type(name, '  Acme Labs ');
    await user.click(save);
    expect(await within(general).findByRole('alert')).toHaveTextContent(
      'The organization is now called Acme Labs.',
    );
    expect(name).toHaveValue('Acme Labs');
    expect(
      screen.getByText('How Acme Labs is named, who is signed in, and deleting it.'),
    ).toBeInTheDocument();
    expect(db.organization.name).toBe('Acme Labs');
  });

  it('says why a name was not saved', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/orgs/:org', () =>
        HttpResponse.json(
          { error: { type: 'not_allowed', message: 'Only an owner or an admin can rename it.' } },
          {
            status: 403,
          },
        ),
      ),
    );
    visit('/settings');
    await settings();
    const general = region('Organization');
    await user.type(within(general).getByRole('textbox', { name: 'Name' }), ' Labs');
    await user.click(within(general).getByRole('button', { name: 'Save the name' }));
    expect(await within(general).findByRole('alert')).toHaveTextContent(
      'Only an owner or an admin can rename it.',
    );
  });

  it('shows a member the name without a form, and that only the owner deletes', async () => {
    setDemoRole(db, 'member');
    visit('/settings');
    await settings();
    const general = region('Organization');
    expect(within(general).queryByRole('textbox')).toBeNull();
    expect(within(general).getByText('Acme')).toBeInTheDocument();
    const danger = region('Danger zone');
    expect(within(danger).getByText('Only the owner can delete the organization.')).toBeInTheDocument();
    expect(within(danger).queryByRole('button')).toBeNull();
  });

  it('lets the owner delete it once its short name is typed again, then goes home', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    const router = visit('/settings');
    await settings();
    const danger = region('Danger zone');
    const typed = within(danger).getByRole('textbox', { name: 'Type acme to confirm' });
    const remove = within(danger).getByRole('button', { name: 'Delete Acme' });
    expect(remove).toBeDisabled();
    await user.type(typed, 'Acme');
    expect(remove).toBeDisabled();
    // Enter does nothing until the short name matches.
    await user.keyboard('{Enter}');
    expect(db.noOrganization).toBe(false);
    await user.clear(typed);
    await user.type(typed, 'acme');
    await user.click(remove);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(db.noOrganization).toBe(true);
  });

  it('asks the owner to sign in again when the server wants a fresh sign-in', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    server.use(
      http.delete('*/api/v1/orgs/:org', () =>
        HttpResponse.json(
          { error: { type: 'step_up_required', message: 'Sign in again to delete the organization.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/settings');
    await settings();
    const danger = region('Danger zone');
    await user.type(within(danger).getByRole('textbox', { name: 'Type acme to confirm' }), 'acme');
    await user.click(within(danger).getByRole('button', { name: 'Delete Acme' }));
    const alert = await within(danger).findByRole('alert');
    expect(alert).toHaveTextContent('Deleting needs a sign-in less than five minutes old.');
    expect(within(alert).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/signin?redirect=%2Fsettings',
    );
    expect(db.noOrganization).toBe(false);
  });

  it('says why a deletion failed', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    server.use(
      http.delete('*/api/v1/orgs/:org', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'deletion is down' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    await settings();
    const danger = region('Danger zone');
    await user.type(within(danger).getByRole('textbox', { name: 'Type acme to confirm' }), 'acme');
    await user.click(within(danger).getByRole('button', { name: 'Delete Acme' }));
    expect(await within(danger).findByRole('alert')).toHaveTextContent('deletion is down');
  });

  it('never shows another organization’s settings', async () => {
    const user = userEvent.setup();
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    visit('/settings');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const list = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(list).getByRole('button', { name: 'Globex' }));
    expect(
      await screen.findByText('How Globex is named, who is signed in, and deleting it.'),
    ).toBeInTheDocument();
    const general = region('Organization');
    expect(within(general).getByRole('textbox', { name: 'Name' })).toHaveValue('Globex');
    expect(within(general).queryByText('acme')).toBeNull();
    // Globex is the person's own: they may delete it, Acme stays.
    expect(
      within(region('Danger zone')).getByRole('textbox', { name: 'Type globex to confirm' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Acme/)).toBeNull();
    expect(db.orgMembers[ACME]).toBeDefined();
  });
});

describe('the security settings', () => {
  it('lists the signed-in sessions, this browser first, and ends another one', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const security = region('Security');
    expect(
      within(security).getByText('Approving a request needs a sign-in less than five minutes old.'),
    ).toBeInTheDocument();
    expect(within(security).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/signin?redirect=%2Fsettings',
    );
    const rows = await within(security).findAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Firefox on macOS',
      'Ostrom on iPhone',
      'Unknown device',
    ]);
    expect(within(rows[0] ?? security).getByText('This browser')).toBeInTheDocument();
    expect(rows[2]).not.toHaveTextContent('last seen');
    const phone = rows[1] ?? security;
    await user.click(within(phone).getByRole('button', { name: 'Sign out' }));
    await user.click(within(phone).getByRole('button', { name: 'Sign out Ostrom on iPhone' }));
    await waitFor(() => {
      expect(within(security).getAllByRole('listitem')).toHaveLength(2);
    });
    expect(db.signedIn).toBe(true);
  });

  it('signs this browser out, from its own row or everywhere at once', async () => {
    const user = userEvent.setup();
    const router = visit('/settings');
    await settings();
    const security = region('Security');
    const [here] = await within(security).findAllByRole('listitem');
    await user.click(within(here ?? security).getByRole('button', { name: 'Sign out' }));
    await user.click(within(here ?? security).getByRole('button', { name: 'Sign out of this browser' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/signin');
    });
    expect(router.state.location.search).toEqual({ redirect: '/settings' });
    expect(db.signedIn).toBe(false);
  });

  it('signs out everywhere, tokens kept', async () => {
    const user = userEvent.setup();
    const router = visit('/settings');
    await settings();
    const security = region('Security');
    expect(within(security).getByText(/Your tokens keep working/)).toBeInTheDocument();
    await user.click(within(security).getByRole('button', { name: 'Sign out everywhere' }));
    await user.click(within(security).getByRole('button', { name: 'Sign out of every session' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/signin');
    });
    expect(db.signedIn).toBe(false);
    expect(db.tokens).toHaveLength(2);
  });

  it('keeps signing out everywhere where the server lists no sessions', async () => {
    server.use(http.get('*/api/v1/auth/sessions', () => new HttpResponse(null, { status: 404 })));
    visit('/settings');
    await settings();
    const security = region('Security');
    await waitFor(() => {
      expect(security.querySelector('.o-skeleton')).toBeNull();
    });
    expect(within(security).queryByRole('listitem')).toBeNull();
    expect(within(security).queryByRole('alert')).toBeNull();
    expect(within(security).getByRole('button', { name: 'Sign out everywhere' })).toBeInTheDocument();
  });

  it('says why the sessions did not load', async () => {
    server.use(
      http.get('*/api/v1/auth/sessions', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'sessions are down' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    await settings();
    expect(await within(region('Security')).findByRole('alert')).toHaveTextContent('sessions are down');
  });

  it('says why a sign-out failed, and stays signed in', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/logout/everywhere', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'sign-out is down' } }, { status: 500 }),
      ),
    );
    const router = visit('/settings');
    await settings();
    const security = region('Security');
    await within(security).findAllByRole('listitem');
    await user.click(within(security).getByRole('button', { name: 'Sign out everywhere' }));
    await user.click(within(security).getByRole('button', { name: 'Sign out of every session' }));
    expect(await within(security).findByRole('alert')).toHaveTextContent('sign-out is down');
    expect(router.state.location.pathname).toBe('/settings');
    expect(db.signedIn).toBe(true);
  });
});
