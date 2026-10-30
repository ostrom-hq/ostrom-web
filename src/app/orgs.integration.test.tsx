// SPDX-License-Identifier: AGPL-3.0-only
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { useAuthStore } from '@/shared/auth/authStore';
import { ORG_STORAGE_KEY, useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const globex = otherOrganization();

/** Every `Ostrom-Org` the console sent to the artifacts, in order; `null` for a call that named none. */
function watchArtifacts(): (string | null)[] {
  const named: (string | null)[] = [];
  server.events.on('request:start', ({ request }) => {
    if (new URL(request.url).pathname === '/api/v1/artifacts') named.push(request.headers.get('ostrom-org'));
  });
  return named;
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe('the organization the console acts in', () => {
  it('adopts the only organization and names it on every call after', async () => {
    const named = watchArtifacts();
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBe(db.organization.id);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(named[0]).toBeNull();
  });

  it('asks a person in two organizations which one, then reads everything again in it', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    const named = watchArtifacts();
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    expect(screen.getByRole('button', { name: 'Choose an organization' })).toHaveTextContent('Organization');
    expect(within(picker).queryByRole('list')).toBeNull();
    await user.type(within(picker).getByRole('textbox', { name: 'Organization id' }), globex.id);
    await user.click(within(picker).getByRole('button', { name: 'Use this organization' }));
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Billing API: latency study' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Organization: Globex. Switch' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(named).toContain(globex.id);
  });

  it('says when what was typed is not an id, until it is changed', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    visit('/artifacts');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const field = within(picker).getByRole('textbox', { name: 'Organization id' });
    await user.type(field, 'two words');
    await user.click(within(picker).getByRole('button', { name: 'Use this organization' }));
    expect(within(picker).getByRole('alert')).toHaveTextContent('This is not an organization id.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user.type(field, 'x');
    expect(within(picker).queryByRole('alert')).toBeNull();
  });

  it('switches to an organization already named, and closes with Escape or Not now', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [globex];
    act(() => {
      useOrgStore.getState().choose(globex.id);
      useOrgStore.getState().adopt(db.organization);
    });
    visit('/artifacts');
    await user.click(await screen.findByRole('button', { name: 'Organization: Globex. Switch' }));
    let picker = screen.getByRole('dialog', { name: 'Which organization?' });
    expect(picker).toHaveFocus();
    const list = within(picker).getByRole('list', { name: 'Your organizations' });
    expect(within(list).getByRole('button', { name: 'Globex' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: 'Acme' })).not.toHaveAttribute('aria-current');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Organization: Globex. Switch' }));
    picker = screen.getByRole('dialog', { name: 'Which organization?' });
    await user.click(within(picker).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Organization: Globex. Switch' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Acme' }));
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    expect(useOrgStore.getState().current).toBe(db.organization.id);
  });

  it('drops an organization the server no longer knows the person in, and asks the server again', async () => {
    act(() => {
      useOrgStore.getState().choose('org-left');
    });
    visit('/artifacts');
    expect(await screen.findByRole('button', { name: 'Organization: Acme. Switch' })).toBeInTheDocument();
    expect(useOrgStore.getState().current).toBe(db.organization.id);
  });

  it('forgets the organization when another account signs in', async () => {
    visit('/artifacts');
    await screen.findByRole('button', { name: 'Organization: Acme. Switch' });
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ error: { type: 'x', message: 'x' } }, { status: 500 }),
      ),
    );
    act(() => {
      useAuthStore.getState().signIn('opk_another_account');
    });
    expect(useOrgStore.getState().current).toBeUndefined();
    expect(await screen.findByRole('button', { name: 'Choose an organization' })).toBeInTheDocument();
  });
});
