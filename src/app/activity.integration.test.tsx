// SPDX-License-Identifier: Apache-2.0
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function rows(): HTMLElement[] {
  return within(within(screen.getByRole('main')).getByRole('list')).getAllByRole('listitem');
}

describe('the activity', () => {
  it('lists what happened, newest first, each line leading to its request or session', async () => {
    visit('/activity');
    expect(await screen.findByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(
      await screen.findByText('claude-code asked for a yes: Merge PR #412 into main'),
    ).toBeInTheDocument();
    const lines = rows();
    expect(lines).toHaveLength(5);
    expect(within(lines[0] ?? document.body).getByText('Yes asked')).toHaveClass('o-badge--warning');
    expect(within(lines[0] ?? document.body).getByRole('link')).toHaveAttribute('href', '/yes/apr-merge-412');
    expect(within(lines[1] ?? document.body).getByRole('link')).toHaveAttribute('href', '/sessions/ses-7f3a');
    // The summary names the agent; the line adds its repository, not the agent again.
    expect(lines[1]).toHaveTextContent('acme/billing-api');
    expect(lines[1]).not.toHaveTextContent('· claude-code');
    // A workflow change leads nowhere yet, and names the person.
    expect(within(lines[3] ?? document.body).queryByRole('link')).toBeNull();
    expect(lines[3]).toHaveTextContent('Workflow changed');
    expect(lines[4]).toHaveTextContent('$1.07');
  });

  it('shows the older lines on demand, then says nothing more', async () => {
    const user = userEvent.setup();
    let release = (): void => undefined;
    server.use(
      http.get('*/api/v1/activity', async ({ request }) => {
        if (new URL(request.url).searchParams.has('before'))
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return undefined;
      }),
    );
    visit('/activity');
    await user.click(await screen.findByRole('button', { name: 'Show older' }));
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    release();
    expect(
      await screen.findByText('theo said no to: Run migration 0042_add_credit_notes'),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(8);
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
  });

  it('keeps what was read when the older lines do not come', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/activity', ({ request }) =>
        new URL(request.url).searchParams.has('before')
          ? HttpResponse.json(
              { error: { type: 'internal', message: 'older lines are down' } },
              { status: 500 },
            )
          : undefined,
      ),
    );
    visit('/activity');
    await user.click(await screen.findByRole('button', { name: 'Show older' }));
    expect(await screen.findByText('older lines are down')).toBeInTheDocument();
    expect(rows()).toHaveLength(5);
  });

  it('keeps one repository’s sessions, says what that leaves out, and goes back to all', async () => {
    const user = userEvent.setup();
    const router = visit('/activity');
    await screen.findByText('claude-code asked for a yes: Merge PR #412 into main');
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), '  acme/web ');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByText('samir started a claude-code session in acme/web')).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(screen.getByText(/requests and workflow changes are left out for acme\/web/)).toBeInTheDocument();
    // The filter is in the address: Back and a shared link keep it.
    expect(router.state.location.search).toEqual({ repo: 'acme/web' });
    await user.click(screen.getByRole('button', { name: 'All repositories' }));
    expect(
      await screen.findByText('claude-code asked for a yes: Merge PR #412 into main'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Repository' })).toHaveValue('');
    expect(screen.queryByText(/left out/)).toBeNull();
  });

  it('opens on the repository the address names, and Back goes to the filter before', async () => {
    const user = userEvent.setup();
    const router = visit('/activity?repo=acme%2Fweb');
    expect(await screen.findByText('samir started a claude-code session in acme/web')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Repository' })).toHaveValue('acme/web');
    await user.clear(screen.getByRole('textbox', { name: 'Repository' }));
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'acme/billing-api{Enter}');
    expect(await screen.findByText('maya started a codex session in acme/billing-api')).toBeInTheDocument();
    router.history.back();
    expect(await screen.findByText('samir started a claude-code session in acme/web')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Repository' })).toHaveValue('acme/web');
  });

  it('says the lines on screen may be out of date when they cannot be read again', async () => {
    const user = userEvent.setup();
    visit('/activity');
    await screen.findByText('claude-code asked for a yes: Merge PR #412 into main');
    await user.click(screen.getByRole('link', { name: 'Decisions' }));
    await screen.findByRole('heading', { level: 1, name: 'Decisions' });
    server.use(
      http.get('*/api/v1/activity', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'feed is down' } }, { status: 500 }),
      ),
    );
    await user.click(screen.getByRole('link', { name: 'Activity' }));
    expect(await screen.findByText('feed is down')).toBeInTheDocument();
    expect(screen.getByText('Maybe out of date')).toBeInTheDocument();
    expect(rows()).toHaveLength(5);
  });

  it('marks the previous filter’s lines as not this one’s while its own come, without their older lines', async () => {
    const user = userEvent.setup();
    let hold = true;
    let release = (): void => undefined;
    server.use(
      http.get('*/api/v1/activity', async ({ request }) => {
        if (hold && new URL(request.url).searchParams.has('repo'))
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return undefined;
      }),
    );
    visit('/activity');
    await screen.findByText('claude-code asked for a yes: Merge PR #412 into main');
    expect(screen.getByRole('button', { name: 'Show older' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'acme/web{Enter}');
    expect(await screen.findByText(/left out for acme\/web/)).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('list').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
    hold = false;
    release();
    expect(await screen.findByText('samir started a claude-code session in acme/web')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('list').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });

  it('reads the same filter again when asked, after it failed', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get('*/api/v1/activity', () =>
        fail
          ? HttpResponse.json({ error: { type: 'internal', message: 'feed is down' } }, { status: 500 })
          : undefined,
      ),
    );
    const router = visit('/activity?repo=acme%2Fweb');
    expect(await screen.findByText('feed is down')).toBeInTheDocument();
    const entries = router.history.length;
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByText('samir started a claude-code session in acme/web')).toBeInTheDocument();
    expect(router.history.length).toBe(entries);
  });

  it('says the activity is not served from a filtered link too, and keeps the filter to clear it', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/activity', ({ request }) =>
        new URL(request.url).searchParams.has('repo')
          ? HttpResponse.json({ error: { type: 'not_found', message: 'Not Found' } }, { status: 404 })
          : undefined,
      ),
    );
    visit('/activity?repo=acme%2Fweb');
    expect(await screen.findByText('This server does not serve the activity yet.')).toBeInTheDocument();
    expect(screen.queryByText(/left out/)).toBeNull();
    // Nothing to filter on a server without the route: only the way back to the whole feed.
    expect(screen.queryByRole('search')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All repositories' }));
    expect(
      await screen.findByText('claude-code asked for a yes: Merge PR #412 into main'),
    ).toBeInTheDocument();
  });

  it('shows another organization nothing of this one’s activity', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [otherOrganization()];
    visit('/activity');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const organizations = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(organizations).getByRole('button', { name: 'Globex' }));
    expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Merge PR #412/)).toBeNull();
  });

  it('says when a repository has no session', async () => {
    const user = userEvent.setup();
    visit('/activity');
    await screen.findByText('claude-code asked for a yes: Merge PR #412 into main');
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'acme/nope{Enter}');
    expect(await screen.findByText('No session in acme/nope.')).toBeInTheDocument();
  });

  it('says when nothing has happened yet', async () => {
    db.activity = [];
    visit('/activity');
    expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
  });

  it('shows a kind and an actor it has no words for as the server wrote them', async () => {
    db.activity = [
      {
        id: 'x',
        at: '2026-10-30T07:00:00.000Z',
        kind: 'repo.archived',
        actor: { kind: 'service', name: 'janitor' },
        summary: 'janitor archived acme/old',
      },
    ];
    visit('/activity');
    const line = (await screen.findByText('janitor archived acme/old')).closest('li');
    expect(line).toHaveTextContent('repo.archived');
    expect(line).toHaveTextContent('janitor (service) ·');
  });

  it('says plainly when the server does not serve the activity yet', async () => {
    server.use(
      http.get('*/api/v1/activity', () =>
        HttpResponse.json({ error: { type: 'not_found', message: 'no such route' } }, { status: 404 }),
      ),
    );
    visit('/activity');
    expect(await screen.findByText('This server does not serve the activity yet.')).toBeInTheDocument();
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('says why the activity does not come', async () => {
    server.use(
      http.get('*/api/v1/activity', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'activity is down' } }, { status: 500 }),
      ),
    );
    visit('/activity');
    expect(await screen.findByText('activity is down')).toBeInTheDocument();
  });

  it('shows the shape of the feed while it loads', async () => {
    server.use(http.get('*/api/v1/activity', async () => delay('infinite')));
    visit('/activity');
    expect(await screen.findByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
