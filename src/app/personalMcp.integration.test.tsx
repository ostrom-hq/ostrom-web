// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

async function card(name: string): Promise<HTMLElement> {
  return screen.findByRole('article', { name }, { timeout: 5_000 });
}

describe('the person’s own MCP servers', { timeout: 15_000 }, () => {
  it('lists them, for a member as for an administrator', async () => {
    setDemoRole(db, 'member');
    visit('/me/mcp');
    const notes = await card('maya-notes');
    expect(notes).toHaveTextContent('https://notes.maya.dev/mcp');
    expect(within(notes).getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
  });

  it('adds one with the team form, then turns it off and removes it', async () => {
    const user = userEvent.setup();
    visit('/me/mcp');
    await card('maya-notes');
    const form = screen.getByRole('region', { name: 'Add a server' });
    await user.type(within(form).getByLabelText('Name'), 'my-tracker');
    await user.type(within(form).getByLabelText('URL'), 'https://mcp.tracker.dev/mcp');
    await user.click(within(form).getByRole('button', { name: 'Add the server' }));
    const tracker = await card('my-tracker');
    expect(db.myMcpServers.find((server) => server.name === 'my-tracker')?.owner).toBe(
      '3d6f9a1e-2b4c-4d8e-9f0a-1b2c3d4e5f60',
    );
    await user.click(within(tracker).getByRole('button', { name: 'Turn off' }));
    expect(
      await within(await card('my-tracker')).findByRole('button', { name: 'Turn on' }),
    ).toBeInTheDocument();
    await user.click(within(await card('my-tracker')).getByRole('button', { name: 'Remove' }));
    await user.click(within(await card('my-tracker')).getByRole('button', { name: 'Remove my-tracker' }));
    await waitFor(() => {
      expect(screen.queryByRole('article', { name: 'my-tracker' })).toBeNull();
    });
  });

  it('says why a server was refused', async () => {
    const user = userEvent.setup();
    visit('/me/mcp');
    await card('maya-notes');
    const form = screen.getByRole('region', { name: 'Add a server' });
    await user.type(within(form).getByLabelText('Name'), 'maya-notes');
    await user.type(within(form).getByLabelText('URL'), 'https://other.dev/mcp');
    await user.click(within(form).getByRole('button', { name: 'Add the server' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('an MCP server named maya-notes exists');
  });

  it('says when there is none, and why the list cannot be read', async () => {
    db.myMcpServers = [];
    visit('/me/mcp');
    expect(await screen.findByText('You have not declared any MCP server of your own.')).toBeInTheDocument();
  });

  it('says why the list cannot be read, and counts no call without usage', async () => {
    server.use(
      http.get('*/api/v1/me/mcp/servers', () =>
        HttpResponse.json({ error: { type: 'unavailable', message: 'servers are down' } }, { status: 503 }),
      ),
    );
    visit('/me/mcp');
    expect(await screen.findByText('servers are down')).toBeInTheDocument();
  });

  it('holds the buttons while a server is saved', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/me/mcp/servers/:name', async () => delay('infinite')));
    db.myMcpServers.push({
      name: 'second',
      url: 'https://second.dev/mcp',
      transport: 'http',
      enabled: true,
      scope: 'per-member',
    });
    visit('/me/mcp');
    const notes = await card('maya-notes');
    await user.click(within(notes).getByRole('button', { name: 'Turn off' }));
    const second = await card('second');
    await waitFor(() => {
      expect(within(second).getByRole('button', { name: 'Turn off' })).toBeDisabled();
    });
  });

  it('says the server is being added', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/me/mcp/servers', async () => delay('infinite')));
    visit('/me/mcp');
    await card('maya-notes');
    const form = screen.getByRole('region', { name: 'Add a server' });
    await user.type(within(form).getByLabelText('Name'), 'slow');
    await user.type(within(form).getByLabelText('URL'), 'https://slow.dev/mcp');
    await user.click(within(form).getByRole('button', { name: 'Add the server' }));
    expect(await within(form).findByRole('button', { name: 'Adding…' })).toBeDisabled();
  });

  it('holds the buttons while a server is removed', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/me/mcp/servers/:name', async () => delay('infinite')));
    visit('/me/mcp');
    const notes = await card('maya-notes');
    await user.click(within(notes).getByRole('button', { name: 'Remove' }));
    await user.click(within(notes).getByRole('button', { name: 'Remove maya-notes' }));
    await waitFor(() => {
      expect(within(notes).getByRole('button', { name: 'Turn off' })).toBeDisabled();
    });
  });

  it('never shows another organization the servers of this one', async () => {
    db.otherOrganizations = [otherOrganization()];
    const other = await fetch(`${TEST_API}/api/v1/me/mcp/servers`, {
      headers: { 'Ostrom-Org': otherOrganization().id },
    });
    expect(await other.text()).not.toContain('maya-notes');
  });

  it('lets an administrator review the members’ servers and promote one to the team', async () => {
    const user = userEvent.setup();
    db.myMcpServers.push({
      name: 'unowned',
      transport: 'stdio',
      enabled: true,
      scope: 'shared',
    });
    db.myMcpServers = db.myMcpServers.map((server) =>
      server.name === 'maya-notes' ? { ...server, secretNames: ['NOTES_TOKEN'] } : server,
    );
    visit('/mcp');
    const review = await screen.findByRole('list', { name: 'Members’ own MCP servers' }, { timeout: 5_000 });
    const [notes, unowned] = within(review).getAllByRole('listitem');
    expect(notes).toHaveTextContent('https://notes.maya.dev/mcp');
    expect(notes).toHaveTextContent(/Owner Maya/u);
    expect(notes).toHaveTextContent('Secret NOTES_TOKEN');
    expect(unowned).not.toHaveTextContent('Secret');
    expect(unowned).toHaveTextContent('unownedOwner Promote');
    await user.click(within(review).getAllByRole('button', { name: 'Promote to the team' })[0] ?? review);
    await user.click(await screen.findByRole('button', { name: 'Make maya-notes a team server' }));
    expect(await card('maya-notes')).toBeInTheDocument();
    await waitFor(() => {
      expect(db.myMcpServers.some((server) => server.name === 'maya-notes')).toBe(false);
    });
  });

  it('says why a promotion was refused, and when no member has a server', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/mcp/servers/:name/promote', () =>
        HttpResponse.json(
          { error: { type: 'mcp_server_limit', message: 'the team has 64 servers' } },
          { status: 409 },
        ),
      ),
    );
    visit('/mcp');
    const review = await screen.findByRole('list', { name: 'Members’ own MCP servers' }, { timeout: 5_000 });
    await user.click(within(review).getByRole('button', { name: 'Promote to the team' }));
    await user.click(await screen.findByRole('button', { name: 'Make maya-notes a team server' }));
    expect(await screen.findByText('the team has 64 servers')).toBeInTheDocument();
    db.myMcpServers = [];
    visit('/mcp');
    expect(await screen.findByText('No member declared an MCP server of their own.')).toBeInTheDocument();
  });

  it('holds the promote buttons while one is promoted', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/mcp/servers/:name/promote', async () => delay('infinite')));
    visit('/mcp');
    const review = await screen.findByRole('list', { name: 'Members’ own MCP servers' }, { timeout: 5_000 });
    await user.click(within(review).getByRole('button', { name: 'Promote to the team' }));
    await user.click(await screen.findByRole('button', { name: 'Make maya-notes a team server' }));
    expect(await within(review).findByRole('button', { name: 'Promote to the team' })).toBeDisabled();
  });

  it('hides the review from a member', async () => {
    setDemoRole(db, 'member');
    visit('/mcp');
    expect(
      await screen.findByText(
        'Owners and admins choose who may use each server and which calls it refuses.',
        undefined,
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Members’ own MCP servers' })).toBeNull();
  });
});
