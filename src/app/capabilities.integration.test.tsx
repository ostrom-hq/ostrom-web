// SPDX-License-Identifier: AGPL-3.0-only
import { handleCapabilities, handleLogout } from '@gen/api/msw.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { Feature } from '@/shared/capabilities';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server } = setupMockApp();

function serving(features: readonly string[]): void {
  server.use(handleCapabilities(() => HttpResponse.json(demoCapabilities(features))));
}

function withoutRoute(): void {
  server.use(
    handleCapabilities(() =>
      HttpResponse.json({ error: { type: 'not_found', message: 'no such route' } }, { status: 404 }),
    ),
  );
}

async function home(): Promise<void> {
  expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
}

describe('a server that speaks another API version', () => {
  it('replaces the console with an explanation, and still lets the person sign out', async () => {
    const user = userEvent.setup();
    server.use(
      handleCapabilities(() => HttpResponse.json({ apiVersion: 2, serverVersion: '2.0.0', features: [] })),
    );
    const router = visit('/billing');
    expect(
      await screen.findByRole('heading', { name: 'This server speaks another API version' }),
    ).toBeVisible();
    expect(screen.getByText(/speaks API v1 and this server speaks API v2/)).toBeVisible();
    // No shell: no navigation, no organization, nothing to act with but the two buttons.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Check again',
      'Sign out',
    ]);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/signin');
    });
    // Signed out, nobody is asked what the server speaks: the sign-in page shows.
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('is lifted once the server is updated and the person checks again', async () => {
    const user = userEvent.setup();
    server.use(
      handleCapabilities(() => HttpResponse.json({ apiVersion: 2, serverVersion: '2.0.0', features: [] })),
    );
    visit('/');
    await user.click(await screen.findByRole('button', { name: 'Check again' }));
    server.use(handleCapabilities(() => HttpResponse.json(demoCapabilities())));
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await home();
  });

  it('says so when signing out fails', async () => {
    const user = userEvent.setup();
    server.use(
      handleCapabilities(() => HttpResponse.json({ apiVersion: 3, serverVersion: '3.1.0', features: [] })),
    );
    server.use(
      handleLogout(() =>
        HttpResponse.json({ error: { type: 'internal', message: 'try later' } }, { status: 500 }),
      ),
    );
    visit('/');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('try later');
  });
});

describe('a server without the capabilities route', () => {
  it('is refused as too old when the console requires the route', async () => {
    vi.stubEnv('VITE_OSTROM_REQUIRE_CAPABILITIES', 'true');
    withoutRoute();
    visit('/');
    expect(
      await screen.findByRole('heading', { name: 'This server is too old for this console' }),
    ).toBeVisible();
    expect(screen.queryByRole('navigation')).toBeNull();
    vi.unstubAllEnvs();
  });

  it('keeps the console usable otherwise, with every screen offered and the versions unknown', async () => {
    withoutRoute();
    visit('/settings');
    await home();
    expect(screen.getByRole('link', { name: 'Billing' })).toBeVisible();
    const about = await screen.findByRole('region', { name: 'About this server' });
    expect(within(about).getByText('The server did not report its version.')).toBeVisible();
  });
});

describe('a server that cannot be asked', () => {
  it.each([
    ['fails', () => HttpResponse.json({ error: { type: 'internal', message: 'down' } }, { status: 500 })],
    ['drops the connection', () => HttpResponse.error()],
  ])('never blocks the console when it %s', async (_name, answer) => {
    server.use(handleCapabilities(answer));
    visit('/settings');
    await home();
    const about = await screen.findByRole('region', { name: 'About this server' });
    await waitFor(() => {
      expect(within(about).getByText('The server did not report its version.')).toBeVisible();
    });
    expect(screen.getByRole('link', { name: 'Billing' })).toBeVisible();
  });
});

describe('features the server does not serve', () => {
  it('hides their navigation entries, in the bar and in the phone menu', async () => {
    const user = userEvent.setup();
    serving(['github.v1']);
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    await waitFor(() => {
      expect(within(bar).queryByRole('link', { name: 'Billing' })).toBeNull();
    });
    for (const name of ['Import', 'Cloud agents', 'Artifacts']) {
      expect(within(bar).queryByRole('link', { name })).toBeNull();
    }
    expect(within(bar).getByRole('link', { name: 'GitHub' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).queryByRole('link', { name: 'Billing' })).toBeNull();
    expect(within(menu).getByRole('link', { name: 'GitHub' })).toBeVisible();
  });

  it.each([
    ['/billing', 'Billing'],
    ['/automations', 'Automations'],
    ['/cloud', 'Cloud agents'],
    ['/import', 'Import'],
  ])('tells a direct address to %s that the screen is not available here', async (path, name) => {
    serving(['github.v1']);
    visit(path);
    expect(
      await screen.findByRole('heading', { name: `${name} is not available on this server` }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the console' })).toBeVisible();
  });

  it('shows them where the server serves them', async () => {
    visit('/billing');
    await home();
    expect(screen.getByRole('link', { name: 'Billing' })).toBeVisible();
    expect(screen.queryByText(/is not available on this server/)).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  });

  it('leaves the screens that need no feature alone', async () => {
    serving([]);
    visit('/settings');
    expect(await screen.findByText('How Acme is named, who is signed in, and deleting it.')).toBeVisible();
  });

  it('is a component too: its children where served, its fallback (or nothing) elsewhere', async () => {
    serving(['billing.v1']);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Feature name="billing.v1">served</Feature>
        <Feature name="slack.v1" fallback="fallback">
          slack
        </Feature>
        <Feature name="slack.v1">silent</Feature>
      </QueryClientProvider>,
    );
    // Before the server has answered, nothing is hidden.
    expect(screen.getByText(/served/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/slack/)).toBeNull();
    });
    expect(screen.getByText(/fallback/)).toBeInTheDocument();
    expect(screen.queryByText(/silent/)).toBeNull();
    expect(FEATURES).toContain('slack.v1');
  });
});

describe('the versions in the settings', () => {
  it('shows the server’s, the API’s and the console’s own', async () => {
    vi.stubEnv('VITE_OSTROM_CONSOLE_VERSION', '0.9.1');
    server.use(
      handleCapabilities(() =>
        HttpResponse.json({ apiVersion: 1, serverVersion: '1.4.0', features: [...FEATURES] }),
      ),
    );
    visit('/settings');
    const about = await screen.findByRole('region', { name: 'About this server' });
    expect(await within(about).findByText('1.4.0')).toBeVisible();
    expect(within(about).getByText('Server version')).toBeVisible();
    expect(within(about).getByText('v1')).toBeVisible();
    expect(within(about).getByText('0.9.1')).toBeVisible();
    vi.unstubAllEnvs();
  });

  it('leaves out the console’s version when the build does not know it', async () => {
    vi.stubEnv('VITE_OSTROM_CONSOLE_VERSION', '');
    visit('/settings');
    const about = await screen.findByRole('region', { name: 'About this server' });
    expect(await within(about).findByText('1.4.0')).toBeVisible();
    expect(within(about).queryByText('Console version')).toBeNull();
    vi.unstubAllEnvs();
  });
});
