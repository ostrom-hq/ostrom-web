// SPDX-License-Identifier: Apache-2.0
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

async function findProcess(server: string): Promise<HTMLElement> {
  const section = await screen.findByRole('region', { name: 'Hosted commands' });
  const row = (await within(section).findByText(server, { selector: '.o-row__title' })).closest('li');
  if (row === null) throw new Error(`no hosted process ${server}`);
  return row;
}

describe('the hosted commands of the MCP screen', () => {
  it('lists each process with its state, its last failure and the end of its stderr', async () => {
    visit('/mcp');
    const shared = await findProcess('filesystem');
    expect(shared).toHaveTextContent('Ready');
    expect(shared).toHaveTextContent('3 starts · 0 failures · Cold start 1840 ms · 96 MiB');
    const notes = await findProcess('notes · theo');
    expect(notes).toHaveTextContent('Backing off');
    expect(notes).toHaveTextContent('Last failure crashed');
    expect(notes).toHaveTextContent('Exit code 1');
    expect(within(notes).getByLabelText('End of the error output of notes')).toHaveTextContent(
      'ModuleNotFoundError',
    );
  });

  it('restarts a process and shows it idle, its failure lifted', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const notes = await findProcess('notes · theo');
    await user.click(within(notes).getByRole('button', { name: 'Restart notes' }));
    const after = await findProcess('notes · theo');
    await within(after).findByText('Idle');
    expect(after).not.toHaveTextContent('Last failure');
    expect(db.mcpHosted.find((process) => process.server === 'notes')?.state).toBe('idle');
  });

  it('asks to sign in again when the sign-in is too old', async () => {
    const user = userEvent.setup();
    db.signedInAt = 0;
    visit('/mcp');
    const notes = await findProcess('notes · theo');
    await user.click(within(notes).getByRole('button', { name: 'Restart notes' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This change needs a sign-in less than five minutes old.');
    expect(within(alert).getByRole('link', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('says when the host did not answer', async () => {
    server.use(
      http.get('*/api/v1/mcp/hosted', () =>
        HttpResponse.json({ hostReachable: false, items: structuredClone(db.mcpHosted) }),
      ),
    );
    visit('/mcp');
    expect(await screen.findByText(/did not answer: the states shown are the last ones/)).toBeInTheDocument();
  });

  it('has no section on an instance without an MCP host', async () => {
    server.use(
      http.get('*/api/v1/mcp/hosted', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'no MCP host' } }, { status: 409 }),
      ),
    );
    visit('/mcp');
    await screen.findByRole('heading', { level: 3, name: 'linear' });
    expect(screen.queryByRole('region', { name: 'Hosted commands' })).toBeNull();
  });

  it('shows a member the state and failure of their stdio server, and no host section', async () => {
    setDemoRole(db, 'member');
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          dev: { login: 'maya', verified: true, via: 'github' },
          member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
          capabilities: [],
        }),
      ),
    );
    db.mcpServers.push({
      name: 'notes',
      transport: 'stdio',
      enabled: true,
      scope: 'per-member',
      state: 'failed',
      failure: 'start_failed',
    });
    visit('/mcp');
    const card = (await screen.findByRole('heading', { level: 3, name: 'notes' })).closest('article');
    if (card === null) throw new Error('no card');
    expect(card).toHaveTextContent('Failed');
    expect(card).toHaveTextContent('Last failure start_failed');
    expect(screen.queryByRole('region', { name: 'Hosted commands' })).toBeNull();
  });
});
