// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { MockInstance } from 'vitest';
import { DEMO_GITHUB_CONSENT } from '@/mocks/account';
import { freshAccount } from '@/mocks/handlers';
import { exit } from '@/shared/lib/leave';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

afterEach(() => {
  vi.restoreAllMocks();
});

/** The page cannot leave in a test: the way out to GitHub is watched instead. */
function leaving(): MockInstance<(url: string) => void> {
  return vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
}

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

async function account(): Promise<void> {
  expect(await screen.findByText(/^Signed in as maya\./)).toBeInTheDocument();
}

describe('my account', () => {
  it('is in the navigation', async () => {
    visit('/account');
    await account();
    expect(screen.getAllByRole('link', { name: 'My account' })[0]).toHaveAttribute('href', '/account');
    expect(screen.getByRole('heading', { level: 1, name: 'My account' })).toBeInTheDocument();
  });

  it('shows the person’s sessions and their own workstations, never an organization’s elevated tokens', async () => {
    db.devices = [
      { id: 'dev-1', name: 'maya-mbp', kind: 'cli', lastSeenAt: '2026-10-30T08:05:00Z' },
      { id: 'dev-9', name: 'samir-admin', kind: 'admin', orgId: 'org-1' },
    ];
    visit('/account');
    await account();
    const security = region('Security');
    expect(await within(security).findAllByRole('listitem')).toHaveLength(3);
    expect(within(security).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/signin?redirect=%2Faccount',
    );
    const workstations = region('Workstations');
    expect(await within(workstations).findByText('maya-mbp')).toBeInTheDocument();
    expect(within(workstations).queryByText('samir-admin')).toBeNull();
    expect(within(workstations).getAllByRole('listitem')).toHaveLength(1);
  });

  it('is read by a person in no organization yet', async () => {
    freshAccount(db);
    visit('/account');
    await account();
    expect(await within(region('Security')).findAllByRole('listitem')).toHaveLength(3);
    expect(await within(region('Workstations')).findByText('maya-mbp')).toBeInTheDocument();
    expect(screen.queryByText('No organization yet')).toBeNull();
  });

  it('says the person’s GitHub is linked', async () => {
    visit('/account');
    await account();
    const github = region('GitHub');
    expect(await within(github).findByText('Linked')).toBeInTheDocument();
    expect(within(github).queryByRole('button', { name: 'Link GitHub' })).toBeNull();
  });

  it('invites a person who signed up by e-mail to link GitHub, and leaves for GitHub’s consent page', async () => {
    const user = userEvent.setup();
    const assign = leaving();
    db.providers = ['email'];
    visit('/account');
    await account();
    const github = region('GitHub');
    expect(within(github).getByText(/Link your GitHub: a gate then knows/)).toBeInTheDocument();
    await user.click(within(github).getByRole('button', { name: 'Link GitHub' }));
    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith(DEMO_GITHUB_CONSENT);
    });
    // Leaving: no second click, until the page comes back out of the browser's cache.
    expect(within(github).getByRole('button', { name: 'Opening GitHub…' })).toBeDisabled();
    window.dispatchEvent(new Event('pageshow'));
    await vi.waitFor(() => {
      expect(within(github).getByRole('button', { name: 'Link GitHub' })).toBeEnabled();
    });
  });

  it('asks the server once while it answers', async () => {
    const user = userEvent.setup();
    leaving();
    db.providers = ['email'];
    server.use(
      http.post('*/api/v1/auth/:provider/link', async () => {
        await delay(200);
        return HttpResponse.json({ authorizationUrl: DEMO_GITHUB_CONSENT });
      }),
    );
    visit('/account');
    await account();
    const github = region('GitHub');
    await user.click(within(github).getByRole('button', { name: 'Link GitHub' }));
    expect(within(github).getByRole('button', { name: 'Opening GitHub…' })).toBeDisabled();
  });

  it('stays when the server names a page that is not https', async () => {
    const user = userEvent.setup();
    const assign = leaving();
    db.providers = ['email'];
    server.use(
      http.post('*/api/v1/auth/:provider/link', () =>
        HttpResponse.json({ authorizationUrl: 'http://github.example/login/oauth/authorize' }),
      ),
    );
    visit('/account');
    await account();
    const github = region('GitHub');
    await user.click(within(github).getByRole('button', { name: 'Link GitHub' }));
    expect(await within(github).findByRole('alert')).toHaveTextContent('not https');
    expect(assign).not.toHaveBeenCalled();
    expect(within(github).getByRole('button', { name: 'Link GitHub' })).toBeEnabled();
  });

  it('says why the link did not start', async () => {
    const user = userEvent.setup();
    db.providers = ['email'];
    server.use(
      http.post('*/api/v1/auth/:provider/link', () =>
        HttpResponse.json(
          { error: { type: 'unavailable', message: 'GitHub sign-in is not configured' } },
          { status: 400 },
        ),
      ),
    );
    visit('/account');
    await account();
    const github = region('GitHub');
    await user.click(within(github).getByRole('button', { name: 'Link GitHub' }));
    expect(await within(github).findByRole('alert')).toHaveTextContent('GitHub sign-in is not configured');
  });

  it('says why the account did not load', async () => {
    server.use(
      http.get('*/api/v1/auth/me/account', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'accounts are down' } }, { status: 500 }),
      ),
    );
    visit('/account');
    expect(await screen.findByText('accounts are down')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your account, whatever organization you act in: GitHub, browser sessions and workstations.',
      ),
    ).toBeInTheDocument();
  });
});
