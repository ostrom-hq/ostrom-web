// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { handleRenameOrg, handleRevokeAuthSession } from '@gen/api/msw.gen';
import { delay, http, HttpResponse } from 'msw';
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
    // The section starts again from the name the server now has, and says it was saved.
    expect(await within(region('Organization')).findByRole('alert')).toHaveTextContent(
      'The organization is now called Acme Labs.',
    );
    const renamed = within(region('Organization')).getByRole('textbox', { name: 'Name' });
    expect(renamed).toHaveValue('Acme Labs');
    expect(
      screen.getByText('How Acme Labs is named, who is signed in, and deleting it.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Organization: Acme Labs. Switch' }),
    ).toBeInTheDocument();
    // Typing again: what was said about the last save no longer applies.
    await user.type(renamed, '!');
    expect(within(region('Organization')).queryByRole('alert')).toBeNull();
    expect(db.organization.name).toBe('Acme Labs');
  });

  it('says why a name was not saved', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/orgs/:org', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'Only an owner or an admin can rename it.' } },
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
    // A submission does nothing until the short name matches.
    const form = typed.closest('form');
    if (form === null) throw new Error('no deletion form');
    fireEvent.submit(form);
    expect(db.noOrganization).toBe(false);
    await user.clear(typed);
    await user.type(typed, 'acme');
    await user.click(remove);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(db.noOrganization).toBe(true);
  });

  it('holds the name while the server saves it', async () => {
    const user = userEvent.setup();
    server.use(handleRenameOrg(async () => delay('infinite')));
    visit('/settings');
    await settings();
    const general = region('Organization');
    await user.type(within(general).getByRole('textbox', { name: 'Name' }), ' Labs');
    await user.click(within(general).getByRole('button', { name: 'Save the name' }));
    expect(await within(general).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(within(general).getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly');
  });

  it('holds every sign-out while one session is being ended', async () => {
    const user = userEvent.setup();
    server.use(handleRevokeAuthSession(async () => delay('infinite')));
    visit('/settings');
    await settings();
    const security = region('Security');
    const phone = (await within(security).findAllByRole('listitem'))[1] ?? security;
    await user.click(within(phone).getByRole('button', { name: 'Sign out' }));
    await user.click(within(phone).getByRole('button', { name: 'Sign out Ostrom on iPhone' }));
    await waitFor(() => {
      expect(within(security).getByRole('button', { name: 'Sign out everywhere' })).toBeDisabled();
    });
  });

  it('holds the deletion while the server deletes', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    server.use(http.delete('*/api/v1/orgs/:org', async () => delay('infinite')));
    visit('/settings');
    await settings();
    const danger = region('Danger zone');
    await user.type(within(danger).getByRole('textbox', { name: 'Type acme to confirm' }), 'acme');
    await user.click(within(danger).getByRole('button', { name: 'Delete Acme' }));
    expect(await within(danger).findByRole('button', { name: 'Deleting…' })).toBeDisabled();
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

  it('says a 403 that is not a step-up as the server said it, with no sign-in to offer', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    // A 403 is a step-up only when `error.type` says `step_up_required`: any other refusal is shown as said.
    server.use(
      http.delete('*/api/v1/orgs/:org', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'Only the owner deletes the organization.' } },
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
    expect(alert).toHaveTextContent('Only the owner deletes the organization.');
    expect(within(danger).queryByRole('link', { name: 'Sign in again' })).toBeNull();
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

  it('deletes the chosen organization, then acts in the one left without offering the deleted one', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [otherOrganization()];
    const router = visit('/settings');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const list = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(list).getByRole('button', { name: 'Globex' }));
    const danger = await screen.findByRole('region', { name: 'Danger zone' });
    await user.type(within(danger).getByRole('textbox', { name: 'Type globex to confirm' }), 'globex');
    await user.click(within(danger).getByRole('button', { name: 'Delete Globex' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(db.otherOrganizations).toEqual([]);
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

describe('the workstations', () => {
  it('lists where the CLI is signed in, the most recently seen first, and signs one out', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const devices = region('Workstations');
    const rows = await within(devices).findAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'maya-mbp',
      'ci-runner-3',
    ]);
    expect(rows[0]).toHaveTextContent('last seen');
    expect(rows[1]).toHaveTextContent('never seen');
    const runner = rows[1] ?? devices;
    await user.click(within(runner).getByRole('button', { name: 'Sign out' }));
    await user.click(within(runner).getByRole('button', { name: 'Sign out ci-runner-3' }));
    await waitFor(() => {
      expect(within(devices).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(db.devices.map((device) => device.id)).toEqual(['dev-1']);
  });

  it('marks the elevated token of ostrom login --admin', async () => {
    db.devices = [{ id: 'dev-9', name: 'maya-admin', kind: 'admin' }];
    visit('/settings');
    await settings();
    expect(await within(region('Workstations')).findByText('Admin')).toBeInTheDocument();
  });

  it('says when the CLI is signed in nowhere', async () => {
    db.devices = [];
    visit('/settings');
    expect(await screen.findByText('The CLI is signed in nowhere.')).toBeInTheDocument();
  });

  it('signs one workstation out at a time', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/devices/:id', async () => {
        await delay(200);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    visit('/settings');
    await settings();
    const devices = region('Workstations');
    const runner = (await within(devices).findAllByRole('listitem'))[1] ?? devices;
    await user.click(within(runner).getByRole('button', { name: 'Sign out' }));
    await user.click(within(runner).getByRole('button', { name: 'Sign out ci-runner-3' }));
    const laptop = within(devices).getAllByRole('listitem')[0] ?? devices;
    expect(within(laptop).getByRole('button', { name: 'Sign out' })).toBeDisabled();
  });

  it('says why a sign-out failed', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/devices/:id', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'devices are down' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    await settings();
    const devices = region('Workstations');
    const runner = (await within(devices).findAllByRole('listitem'))[1] ?? devices;
    await user.click(within(runner).getByRole('button', { name: 'Sign out' }));
    await user.click(within(runner).getByRole('button', { name: 'Sign out ci-runner-3' }));
    expect(await within(devices).findByRole('alert')).toHaveTextContent('devices are down');
  });

  it('says why the list did not load', async () => {
    server.use(
      http.get('*/api/v1/devices', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'no list today' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    expect(await screen.findByText('no list today')).toBeInTheDocument();
  });
});

describe('the service keys', () => {
  it('lists the organization’s keys, then creates one whose secret shows once', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    expect(within(keys).getByText(/For the CI of Acme/)).toBeInTheDocument();
    const first = await within(keys).findByRole('listitem');
    expect(first).toHaveTextContent('GitHub Actions');
    expect(first).toHaveTextContent('Read the rules · Report checks and sign workflow receipts');
    expect(first).toHaveTextContent('last used');
    expect(first).toHaveTextContent('never expires');
    const create = within(keys).getByRole('button', { name: 'Create the key' });
    expect(create).toBeDisabled();
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'Nightly');
    expect(within(keys).getByRole('checkbox', { name: 'Read the rules' })).not.toBeChecked();
    await user.click(
      within(keys).getByRole('checkbox', { name: 'Report checks and sign workflow receipts' }),
    );
    expect(within(keys).getByRole('combobox', { name: 'Expires' })).toHaveValue('90');
    await user.click(create);
    expect(await within(keys).findByText(/The secret of Nightly is shown once/)).toBeInTheDocument();
    expect(within(keys).getByRole('textbox', { name: 'Secret of Nightly' })).toHaveDisplayValue(/^osk_demo/);
    expect(db.serviceKeys[0]).toMatchObject({ name: 'Nightly', scopes: ['sessions:write'] });
    expect(db.serviceKeys[0]?.expiresAt).toBeDefined();
    expect(within(keys).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(keys).getAllByRole('button', { name: 'Delete' })[0]).toBeDisabled();
    await user.click(within(keys).getByRole('button', { name: 'I copied it' }));
    expect(within(keys).queryByText(/The secret of Nightly/)).toBeNull();
    const rows = await within(keys).findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('never used');
    expect(rows[0]).not.toHaveTextContent('never expires');
  });

  it('creates a key that never expires when asked to', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'Forever');
    await user.click(within(keys).getByRole('checkbox', { name: 'Read the rules' }));
    await user.selectOptions(within(keys).getByRole('combobox', { name: 'Expires' }), 'Never');
    await user.click(within(keys).getByRole('button', { name: 'Create the key' }));
    expect(await within(keys).findByText(/The secret of Forever is shown once/)).toBeInTheDocument();
    expect(db.serviceKeys[0]).toMatchObject({ name: 'Forever', scopes: ['rules:read'] });
    expect(db.serviceKeys[0]?.expiresAt).toBeUndefined();
  });

  it('says it is creating, and locks every change until the server answered', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/service-keys', async () => {
        await delay(200);
        return HttpResponse.json(
          { id: 'key-9', name: 'Slow', scopes: ['rules:read'], createdAt: '2026-10-30T00:00:00Z' },
          { status: 201 },
        );
      }),
    );
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'Slow');
    await user.click(within(keys).getByRole('checkbox', { name: 'Read the rules' }));
    await user.click(within(keys).getByRole('button', { name: 'Create the key' }));
    expect(await within(keys).findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(within(keys).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(await within(keys).findByRole('button', { name: 'Create the key' })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(keys).getAllByRole('button', { name: 'Delete' })[0]).toBeEnabled();
    });
  });

  it('needs at least one thing the key may do', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'CI');
    expect(within(keys).getByText('Tick at least one thing it may do.')).toBeInTheDocument();
    await user.click(within(keys).getByRole('checkbox', { name: 'Read the rules' }));
    expect(within(keys).queryByText('Tick at least one thing it may do.')).toBeNull();
    await user.click(within(keys).getByRole('checkbox', { name: 'Read the rules' }));
    expect(within(keys).getByRole('button', { name: 'Create the key' })).toBeDisabled();
  });

  it('deletes a key once confirmed', async () => {
    const user = userEvent.setup();
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    const row = await within(keys).findByRole('listitem');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(within(row).getByRole('button', { name: 'Delete GitHub Actions' }));
    expect(await within(keys).findByText('No service key yet.')).toBeInTheDocument();
    expect(db.serviceKeys).toEqual([]);
  });

  it('asks to sign in again when the sign-in is stale, then deletes and clears it', async () => {
    const user = userEvent.setup();
    db.signedInAt = 0;
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(keys).getByRole('checkbox', { name: 'Read the rules' }));
    await user.click(within(keys).getByRole('button', { name: 'Create the key' }));
    const alert = await within(keys).findByRole('alert');
    expect(alert).toHaveTextContent('This change needs a sign-in less than five minutes old.');
    expect(within(alert).getByRole('link', { name: 'Sign in again' })).toBeInTheDocument();
    const row = within(keys).getByRole('listitem');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(within(row).getByRole('button', { name: 'Delete GitHub Actions' }));
    expect(await within(keys).findByText('No service key yet.')).toBeInTheDocument();
    expect(within(keys).queryByRole('alert')).toBeNull();
  });

  it('shows a scope it has no words for as the server wrote it, and no banner for an answer without secret', async () => {
    const user = userEvent.setup();
    db.serviceKeys = [
      { id: 'key-7', name: 'Old', scopes: ['audit:read'], createdAt: '2026-10-01T00:00:00Z' },
    ];
    server.use(
      http.post('*/api/v1/service-keys', () =>
        HttpResponse.json(
          { id: 'key-8', name: 'CI', scopes: ['rules:read'], createdAt: '2026-10-30T00:00:00Z' },
          { status: 201 },
        ),
      ),
    );
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    expect(await within(keys).findByText('audit:read')).toBeInTheDocument();
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(keys).getByRole('checkbox', { name: 'Read the rules' }));
    await user.click(within(keys).getByRole('button', { name: 'Create the key' }));
    await waitFor(() => {
      expect(within(keys).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    });
    expect(within(keys).queryByText(/is shown once/)).toBeNull();
    // Nothing on screen to copy: the form and the rows stay usable.
    await user.type(within(keys).getByRole('textbox', { name: 'Name' }), 'Next');
    expect(within(keys).getByRole('button', { name: 'Create the key' })).toBeEnabled();
  });

  it('says why the keys did not load', async () => {
    server.use(
      http.get('*/api/v1/service-keys', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'keys are down' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    await settings();
    expect(await within(region('Service keys')).findByText('keys are down')).toBeInTheDocument();
  });

  it('tells a member who manages the keys, and asks the server nothing', async () => {
    let asked = false;
    server.use(
      http.get('*/api/v1/service-keys', () => {
        asked = true;
        return HttpResponse.json({ items: [] });
      }),
    );
    setDemoRole(db, 'member');
    visit('/settings');
    await settings();
    const keys = region('Service keys');
    expect(
      within(keys).getByText('Owners and admins manage the organization’s service keys.'),
    ).toBeInTheDocument();
    expect(within(keys).queryByRole('textbox')).toBeNull();
    expect(asked).toBe(false);
  });
});
