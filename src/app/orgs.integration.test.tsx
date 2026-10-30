// SPDX-License-Identifier: AGPL-3.0-only
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { ORG_STORAGE_KEY, readStoredChoice, storedChoice, useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const globex = otherOrganization();

/** Every `Ostrom-Org` the console sent to a route, in order; `null` for a call that named none. */
function watch(path: string): (string | null)[] {
  const named: (string | null)[] = [];
  server.events.on('request:start', ({ request }) => {
    if (new URL(request.url).pathname === path) named.push(request.headers.get('ostrom-org'));
  });
  return named;
}

function chosenBefore(id: string, login: string): void {
  act(() => {
    useOrgStore.getState().choose(id, login);
  });
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe('the organization the console acts in', () => {
  it('takes the only organization without asking, names it on the calls after, and keeps nothing', async () => {
    const user = userEvent.setup();
    const artifacts = watch('/api/v1/artifacts');
    const secrets = watch('/api/v1/secrets');
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
    expect(artifacts[0]).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Secrets' }));
    await waitFor(() => {
      expect(secrets).toEqual([db.organization.id]);
    });
  });

  it('asks a person in two organizations which one, then reads everything again in it', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    const named = watch('/api/v1/artifacts');
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(screen.getByRole('button', { name: 'Choose an organization' })).toHaveTextContent('Organization');
    const list = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(list).getByRole('button', { name: 'Globex' }));
    // Acme's artifacts are not Globex's: none of them shows.
    expect(await screen.findByText('No artifact yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Billing API: latency study' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Organization: Globex. Switch' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(named).toContain(globex.id);
    expect(readStoredChoice(window.localStorage)).toEqual({ id: globex.id, login: 'maya' });
  });

  it('switches from the top bar, a real modal that Escape or Not now closes', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    chosenBefore(globex.id, 'maya');
    visit('/artifacts');
    const opener = await screen.findByRole('button', { name: 'Organization: Globex. Switch' });
    await user.click(opener);
    const picker = screen.getByRole('dialog', { name: 'Which organization?' });
    expect(picker).toHaveFocus();
    expect(document.querySelector('[inert]')).not.toBeNull();
    const list = within(picker).getByRole('list', { name: 'Your organizations' });
    expect(within(list).getByRole('button', { name: 'Globex' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: 'Acme' })).not.toHaveAttribute('aria-current');
    await user.keyboard('a');
    expect(screen.getByRole('dialog', { name: 'Which organization?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    const screenInGlobex = screen.getByRole('main').firstElementChild;
    await user.click(opener);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Acme' }));
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toHaveFocus();
    // The screen opened in Globex is gone, with whatever was typed in it: nothing half done acts in Acme.
    expect(screen.getByRole('main').firstElementChild).not.toBe(screenInGlobex);
    expect(useOrgStore.getState().current).toBe(db.organization.id);
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Billing API: latency study' }),
    ).toBeInTheDocument();
  });

  it('does not reopen the picker the person closed, until they ask for it', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    await user.click(within(picker).getByRole('button', { name: 'Not now' }));
    let refused = false;
    server.events.on('response:mocked', ({ request, response }) => {
      if (new URL(request.url).pathname === '/api/v1/secrets' && response.status === 409) refused = true;
    });
    await user.click(screen.getByRole('link', { name: 'Secrets' }));
    await waitFor(() => {
      expect(refused).toBe(true);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Choose an organization' }));
    expect(screen.getByRole('dialog', { name: 'Which organization?' })).toBeInTheDocument();
  });

  it('drops a choice that is no longer the person’s, and says so when there is another to choose', async () => {
    db.otherOrganizations = [globex];
    chosenBefore('org-left', 'maya');
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(picker).toHaveTextContent('You are no longer a member of the organization chosen last.');
  });

  it('drops a choice that is no longer the person’s, takes the only one left, and says so', async () => {
    chosenBefore('org-left', 'maya');
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    const picker = screen.getByRole('dialog', { name: 'Which organization?' });
    expect(picker).toHaveTextContent('You are no longer a member of the organization chosen last.');
    expect(within(picker).getByRole('button', { name: 'Acme' })).toHaveAttribute('aria-current', 'true');
  });

  it('lists a second organization beside the only one the next time, without interrupting', async () => {
    const user = userEvent.setup();
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    // Invited to Globex meanwhile; the list is read again (here, by opening the console afresh in the same session).
    db.otherOrganizations = [globex];
    cleanup();
    visit('/artifacts');
    await user.click(await screen.findByRole('button', { name: 'Organization: Acme. Switch' }));
    const picker = screen.getByRole('dialog', { name: 'Which organization?' });
    expect(await within(picker).findByRole('button', { name: 'Globex' })).toBeInTheDocument();
  });

  it('never sends another account the organization chosen before in this browser', async () => {
    chosenBefore(db.organization.id, 'lena');
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    // Taken as Maya's only organization, for this session: Lena's choice is gone.
    expect(useOrgStore.getState().owner).toBeUndefined();
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
  });

  it('says while the organizations load', async () => {
    db.otherOrganizations = [globex];
    server.use(http.get('*/api/v1/me/organizations', async () => delay('infinite')));
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(picker).toHaveTextContent('Loading');
    expect(picker).toHaveAttribute('aria-busy', 'true');
  });

  it('says when the organizations cannot be read, and reads them again on demand', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    const down = (): Response =>
      HttpResponse.json({ error: { type: 'unavailable', message: 'down' } }, { status: 503 });
    // The first try and its one retry fail; the list answers when asked again.
    server.use(
      http.get('*/api/v1/me/organizations', down, { once: true }),
      http.get('*/api/v1/me/organizations', down, { once: true }),
    );
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(await within(picker).findByRole('alert')).toHaveTextContent(
      'Your organizations could not be read.',
    );
    expect(within(picker).queryByRole('list')).toBeNull();
    await user.click(within(picker).getByRole('button', { name: 'Try again' }));
    expect(await within(picker).findByRole('list', { name: 'Your organizations' })).toBeInTheDocument();
  });

  it('says when the person has no organization to choose', async () => {
    db.otherOrganizations = [globex];
    server.use(http.get('*/api/v1/me/organizations', () => HttpResponse.json({ items: [] })));
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(
      await within(picker).findByText(/You are not a member of any organization yet\./),
    ).toBeInTheDocument();
  });

  it('reads the list again when the organization named finds nothing, and says the choice is gone', async () => {
    db.otherOrganizations = [globex];
    chosenBefore(globex.id, 'maya');
    const router = visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Globex. Switch' })).toBeInTheDocument();
    // Removed from Globex meanwhile: the next call in it is not found.
    db.otherOrganizations = [];
    await act(async () => {
      await router.navigate({ to: '/secrets' });
    });
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(picker).toHaveTextContent('You are no longer a member of the organization chosen last.');
  });

  it('follows the organization chosen in another tab', async () => {
    db.otherOrganizations = [globex];
    chosenBefore(db.organization.id, 'maya');
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    act(() => {
      window.localStorage.setItem(ORG_STORAGE_KEY, storedChoice({ id: globex.id, login: 'maya' }));
      window.dispatchEvent(new StorageEvent('storage', { key: ORG_STORAGE_KEY }));
    });
    expect(await screen.findByRole('button', { name: 'Organization: Globex. Switch' })).toBeInTheDocument();
    expect(await screen.findByText('No artifact yet.')).toBeInTheDocument();
  });

  it('keeps the organization of someone signed in who opens the sign-in page', async () => {
    const router = visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: '/signin' });
    });
    expect(await screen.findByRole('textbox', { name: 'Your e-mail address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
  });

  it('asks nobody who is signing in who they are', async () => {
    const asked = watch('/api/v1/auth/me');
    const listed = watch('/api/v1/me/organizations');
    visit('/signin');
    expect(await screen.findByRole('textbox', { name: 'Your e-mail address' })).toBeInTheDocument();
    // A doubt with no list on screen reads nothing.
    act(() => {
      useOrgStore.getState().doubt();
    });
    expect(screen.queryByRole('button', { name: /Organization/ })).toBeNull();
    expect([asked, listed]).toEqual([[], []]);
  });
});
