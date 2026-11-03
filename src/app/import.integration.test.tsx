// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';

const { server, db, traffic } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';
const GLOBEX = otherOrganization().id;

/** What `ostrom import teamcode` read: two servers, a mapped and an unmapped member, a live and an expired account. */
const EXPORT = {
  members: [
    { id: 'tc-1', username: 'maya' },
    { id: 'tc-2', username: 'ghost' },
  ],
  mcpServers: [
    {
      id: 'v-1',
      target: 'linear',
      variant: 'default',
      url: 'https://mcp.linear.app/mcp',
      sharedSecret: 's3cret',
    },
    { id: 'v-2', target: 'github', variant: 'default', url: 'https://api.githubcopilot.com/mcp/' },
  ],
  assignments: [
    { memberId: 'tc-1', serverId: 'v-1' },
    { memberId: 'tc-2', serverId: 'v-1' },
    { memberId: 'tc-1', serverId: 'v-9' },
  ],
  accounts: [
    {
      provider: 'claude',
      providerAccountId: 'acc-1',
      label: 'Team Claude',
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: '2099-01-01T00:00:00Z',
    },
    {
      provider: 'codex',
      providerAccountId: 'acc-2',
      label: 'Old Codex',
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      expiresAt: '2020-01-01T00:00:00Z',
    },
  ],
  memberMap: { 'tc-1': MEMBER_IDS.maya },
};

function exportFile(content: unknown = EXPORT, name = 'teamcode.json'): File {
  return new File([typeof content === 'string' ? content : JSON.stringify(content)], name, {
    type: 'application/json',
  });
}

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

async function choose(file: File = exportFile()): Promise<void> {
  const user = userEvent.setup();
  await user.upload(await screen.findByLabelText('Export file (JSON)'), file);
}

async function plan(): Promise<HTMLElement> {
  const user = userEvent.setup();
  await choose();
  await user.click(
    await within(await screen.findByRole('region', { name: '1. The plan' })).findByRole('button', {
      name: 'Show the plan',
    }),
  );
  await within(region('1. The plan')).findByRole('list', { name: 'The plan, line by line' });
  return region('1. The plan');
}

async function runImport(): Promise<HTMLElement> {
  const user = userEvent.setup();
  await plan();
  const step = region('2. The import');
  await user.click(within(step).getByRole('button', { name: 'Import' }));
  await user.click(within(step).getByRole('button', { name: 'Write 4 changes into Acme' }));
  await within(step).findByRole('list', { name: 'The import, line by line' });
  return step;
}

describe('the TeamCode import', () => {
  it('is for owners and admins', async () => {
    setDemoRole(db, 'member');
    visit('/import');
    expect(await screen.findByText('Owners and admins import')).toBeInTheDocument();
    expect(screen.queryByLabelText('Export file (JSON)')).toBeNull();
  });

  it('is reached from the navigation', async () => {
    const user = userEvent.setup();
    visit('/');
    await user.click(await screen.findByRole('link', { name: 'Import' }));
    expect(await screen.findByText(/Move a TeamCode team into Acme/)).toBeInTheDocument();
    // Read once the screen is in: the title of its waiting state is another node, replaced by this one.
    expect(screen.getByRole('heading', { level: 1, name: 'Import from TeamCode' })).toBeInTheDocument();
  });

  it('sums up the file in counts, names the unmapped members, and shows no credential', async () => {
    visit('/import');
    await choose();
    const file = region('TeamCode export');
    expect(await within(file).findByText('teamcode.json')).toBeInTheDocument();
    expect(file).toHaveTextContent('TeamCode members2MCP servers2Assignments3Shared accounts2');
    expect(within(file).getByText(/ghost has no Ostrom member in the file’s map/)).toBeInTheDocument();
    expect(screen.queryByText(/s3cret|at-1|rt-1/)).toBeNull();
    expect(region('2. The import')).toHaveTextContent('See the plan first.');
    expect(region('3. The cutover')).toHaveTextContent('Only an owner runs the cutover.');
  });

  it('says when the file is not JSON, not an export, or unreadable, and forgets the last one', async () => {
    visit('/import');
    await choose();
    await choose(exportFile('{nope'));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is not JSON.');
    expect(screen.queryByText('teamcode.json')).toBeNull();
    expect(screen.queryByRole('region', { name: '1. The plan' })).toBeNull();
    await choose(exportFile({ mcpServers: [{ id: 1 }] }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is not a TeamCode export');
    const broken = exportFile();
    Object.defineProperty(broken, 'text', { value: async () => Promise.reject(new Error('gone')) });
    await choose(broken);
    expect(await screen.findByRole('alert')).toHaveTextContent('The file could not be read.');
  });

  it('shows the plan without writing, imports it, and a second plan reads unchanged', async () => {
    const user = userEvent.setup();
    visit('/import');
    const planned = await plan();
    expect(within(planned).getByRole('list', { name: 'The plan in numbers' })).toHaveTextContent(
      '4 planned2 skipped1 waits for the cutover',
    );
    const lines = within(within(planned).getByRole('list', { name: 'The plan, line by line' })).getAllByRole(
      'listitem',
    );
    expect(lines.map((line) => line.textContent)).toEqual([
      'linearMCP serverPlanned',
      'githubMCP serverPlanned',
      'linear/mayaAssignmentPlanned',
      'linear/ghostAssignment · ghost has no Ostrom member.Skipped',
      'mayaAssignment · Unknown TeamCode server.Skipped',
      'Team ClaudeShared accountPlanned',
      'Old CodexShared account · Waits for a reconnection until the cutover run.At the cutover',
    ]);
    expect(db.imported[ACME]).toBeUndefined();

    const step = region('2. The import');
    await user.click(within(step).getByRole('button', { name: 'Import' }));
    await user.click(within(step).getByRole('button', { name: 'Not now' }));
    expect(db.imported[ACME]).toBeUndefined();
    await user.click(within(step).getByRole('button', { name: 'Import' }));
    await user.click(within(step).getByRole('button', { name: 'Write 4 changes into Acme' }));
    const counts = await within(step).findByRole('list', { name: 'The import in numbers' });
    expect(counts).toHaveTextContent('4 created2 skipped1 waits for the cutover');
    expect(db.imported[ACME]).toHaveLength(4);

    await user.click(within(planned).getByRole('button', { name: 'Show the plan' }));
    await waitFor(() => {
      expect(within(planned).getByRole('list', { name: 'The plan in numbers' })).toHaveTextContent(
        '4 unchanged',
      );
    });
  });

  it('says what a run did not do, and holds the buttons while one runs', async () => {
    const user = userEvent.setup();
    visit('/import');
    await choose();
    server.use(
      http.post('*/api/v1/import/teamcode', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'import is down' } }, { status: 500 }),
      ),
    );
    await user.click(await within(region('1. The plan')).findByRole('button', { name: 'Show the plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('import is down');
    server.use(http.post('*/api/v1/import/teamcode', async () => delay('infinite')));
    await user.click(within(region('1. The plan')).getByRole('button', { name: 'Show the plan' }));
    expect(within(region('1. The plan')).getByRole('button', { name: 'Reading…' })).toBeDisabled();
    expect(within(region('TeamCode export')).getByRole('button', { name: 'Forget the file' })).toBeDisabled();
    expect(screen.getByLabelText('Export file (JSON)')).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the file chosen last, even when an earlier one is read after it', async () => {
    visit('/import');
    const late: { resolve: (text: string) => void; reject: (error: Error) => void }[] = [];
    function slow(name: string): File {
      const file = exportFile(EXPORT, name);
      Object.defineProperty(file, 'text', {
        value: async () =>
          new Promise<string>((resolve, reject) => {
            late.push({ resolve, reject });
          }),
      });
      return file;
    }
    await choose(slow('first.json'));
    await choose(slow('broken.json'));
    await choose(exportFile(EXPORT, 'last.json'));
    expect(await screen.findByText('last.json')).toBeInTheDocument();
    late[0]?.resolve(JSON.stringify(EXPORT));
    late[1]?.reject(new Error('gone'));
    await waitFor(() => {
      expect(late).toHaveLength(2);
    });
    expect(screen.queryByText('first.json')).toBeNull();
    expect(screen.getByText('last.json')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does nothing when the chooser closes with no file', async () => {
    visit('/import');
    fireEvent.change(await screen.findByLabelText('Export file (JSON)'), { target: { files: [] } });
    expect(screen.queryByRole('region', { name: '1. The plan' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when there is nothing to import', async () => {
    const user = userEvent.setup();
    visit('/import');
    await choose(exportFile({}));
    await user.click(await within(region('1. The plan')).findByRole('button', { name: 'Show the plan' }));
    expect(await within(region('1. The plan')).findByText('Nothing to import.')).toBeInTheDocument();
  });

  it('forgets the file and its reports', async () => {
    const user = userEvent.setup();
    visit('/import');
    await plan();
    await user.click(within(region('TeamCode export')).getByRole('button', { name: 'Forget the file' }));
    expect(screen.queryByText('teamcode.json')).toBeNull();
    expect(screen.queryByRole('region', { name: '1. The plan' })).toBeNull();
  });
});

describe('the cutover', () => {
  it('is the owner’s, once imported and TeamCode stopped; it revives the waiting accounts', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    visit('/import');
    await choose();
    expect(await within(region('3. The cutover')).findByText('Import first.')).toBeInTheDocument();
    await user.click(within(region('1. The plan')).getByRole('button', { name: 'Show the plan' }));
    await within(region('1. The plan')).findByRole('list', { name: 'The plan, line by line' });
    const step = region('2. The import');
    await user.click(within(step).getByRole('button', { name: 'Import' }));
    await user.click(within(step).getByRole('button', { name: 'Write 4 changes into Acme' }));
    const cutover = region('3. The cutover');
    const ask = await within(cutover).findByRole('button', { name: 'Run the cutover' });
    expect(ask).toBeDisabled();
    await user.click(within(cutover).getByRole('checkbox', { name: 'TeamCode is stopped' }));
    await user.click(ask);
    await user.click(within(cutover).getByRole('button', { name: 'Cut Acme over, in my name' }));
    expect(await within(cutover).findByText('The cutover ran and is in the audit log.')).toBeInTheDocument();
    expect(within(cutover).getByRole('list', { name: 'The cutover in numbers' })).toHaveTextContent(
      '1 updated4 unchanged2 skipped',
    );
    expect(within(cutover).getByRole('list', { name: 'The cutover, line by line' })).toHaveTextContent(
      'Old CodexShared accountUpdated',
    );
    // It rotated TeamCode's tokens: it is not offered again for this file.
    expect(within(cutover).queryByRole('button', { name: 'Run the cutover' })).toBeNull();
    expect(within(cutover).queryByRole('checkbox')).toBeNull();
  });

  it('asks again whether TeamCode is stopped for a new file', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    visit('/import');
    await runImport();
    await user.click(within(region('3. The cutover')).getByRole('checkbox', { name: 'TeamCode is stopped' }));
    await choose();
    await user.click(
      await within(await screen.findByRole('region', { name: '1. The plan' })).findByRole('button', {
        name: 'Show the plan',
      }),
    );
    await within(region('1. The plan')).findByRole('list', { name: 'The plan in numbers' });
    await user.click(within(region('2. The import')).getByRole('button', { name: 'Import' }));
    await user.click(within(region('2. The import')).getByRole('button', { name: /^Write .* into Acme$/ }));
    await within(region('2. The import')).findByRole('list', { name: 'The import in numbers' });
    expect(
      within(region('3. The cutover')).getByRole('checkbox', { name: 'TeamCode is stopped' }),
    ).not.toBeChecked();
    expect(within(region('3. The cutover')).getByRole('button', { name: 'Run the cutover' })).toBeDisabled();
  });

  it('says when the server cannot cut over, or refuses the person', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    db.cutoverAvailable = false;
    visit('/import');
    await runImport();
    const cutover = region('3. The cutover');
    await user.click(within(cutover).getByRole('checkbox', { name: 'TeamCode is stopped' }));
    await user.click(within(cutover).getByRole('button', { name: 'Run the cutover' }));
    await user.click(within(cutover).getByRole('button', { name: 'Cut Acme over, in my name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This server keeps no audit log, so it cannot run the cutover. Nothing was written.',
    );
    // The role changed since the screen opened: the server refuses, the screen says so.
    setDemoRole(db, 'admin');
    await user.click(within(cutover).getByRole('button', { name: 'Run the cutover' }));
    await user.click(within(cutover).getByRole('button', { name: 'Cut Acme over, in my name' }));
    expect(
      await screen.findByText('Only an owner runs the cutover. Nothing was written.'),
    ).toBeInTheDocument();
    // A server without shared accounts says so too.
    setDemoRole(db, 'owner');
    server.use(
      http.post(
        '*/api/v1/import/teamcode',
        () =>
          HttpResponse.json(
            {
              error: {
                type: 'unavailable',
                message: 'This server does not import shared accounts, so it has no cutover to run.',
              },
            },
            { status: 503 },
          ),
        { once: true },
      ),
      // Any other failure of the cutover, even with the same error type, may come after a write.
      http.post(
        '*/api/v1/import/teamcode',
        () =>
          HttpResponse.json(
            { error: { type: 'unavailable', message: 'Agent sessions are not available.' } },
            { status: 503 },
          ),
        { once: true },
      ),
      http.post('*/api/v1/import/teamcode', () => new HttpResponse('Service Unavailable', { status: 503 }), {
        once: true,
      }),
    );
    const cutAgain = async () => {
      await user.click(within(cutover).getByRole('button', { name: 'Run the cutover' }));
      await user.click(within(cutover).getByRole('button', { name: 'Cut Acme over, in my name' }));
    };
    await cutAgain();
    expect(
      await screen.findByText(
        'This server does not import shared accounts, so it has no cutover to run. Nothing was written.',
      ),
    ).toBeInTheDocument();
    await cutAgain();
    expect(
      await screen.findByText(
        'The cutover may have run: look at the audit log before running it again. Error: Agent sessions are not available.',
      ),
    ).toBeInTheDocument();
    await cutAgain();
    expect(
      await screen.findByText(
        'The cutover may have run: look at the audit log before running it again. Error: HTTP 503',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was written/)).toBeNull();
  });

  it('holds the button while the cutover runs, and says another failure as the server words it', async () => {
    const user = userEvent.setup();
    setDemoRole(db, 'owner');
    visit('/import');
    await runImport();
    const cutover = region('3. The cutover');
    await user.click(within(cutover).getByRole('checkbox', { name: 'TeamCode is stopped' }));
    server.use(
      http.post('*/api/v1/import/teamcode', () =>
        HttpResponse.json({ error: { type: 'invalid_request', message: 'bad export' } }, { status: 400 }),
      ),
    );
    await user.click(within(cutover).getByRole('button', { name: 'Run the cutover' }));
    await user.click(within(cutover).getByRole('button', { name: 'Cut Acme over, in my name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('bad export');
    server.use(http.post('*/api/v1/import/teamcode', async () => delay('infinite')));
    await user.click(within(cutover).getByRole('button', { name: 'Run the cutover' }));
    await user.click(within(cutover).getByRole('button', { name: 'Cut Acme over, in my name' }));
    expect(within(cutover).getByRole('button', { name: 'Cutting over…' })).toBeDisabled();
  });

  it('holds the import button while the import runs', async () => {
    const user = userEvent.setup();
    visit('/import');
    await plan();
    server.use(http.post('*/api/v1/import/teamcode', async () => delay('infinite')));
    const step = region('2. The import');
    await user.click(within(step).getByRole('button', { name: 'Import' }));
    await user.click(within(step).getByRole('button', { name: 'Write 4 changes into Acme' }));
    expect(within(step).getByRole('button', { name: 'Importing…' })).toBeDisabled();
  });
});

describe('another organization', () => {
  it('imports into the organization chosen, never showing the first one’s file or reports', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [otherOrganization()];
    db.imported[ACME] = ['server:linear', 'server:github'];
    db.orgMembers[GLOBEX] = [
      {
        login: 'maya',
        name: 'Maya Lind',
        avatarUrl: '',
        email: null,
        role: 'admin',
        joinedAt: '2026-09-01T09:00:00.000Z',
      },
    ];
    const seen: (string | null)[] = [];
    traffic.onRequest((request) => {
      if (request.url.includes('/import/teamcode')) seen.push(request.headers.get('Ostrom-Org'));
    });
    visit('/import');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const list = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(list).getByRole('button', { name: 'Globex' }));
    expect(await screen.findByText(/Move a TeamCode team into Globex/)).toBeInTheDocument();
    await choose();
    await user.click(await within(region('1. The plan')).findByRole('button', { name: 'Show the plan' }));
    const counts = await within(region('1. The plan')).findByRole('list', { name: 'The plan in numbers' });
    // Acme imported its servers already; Globex has none of them.
    expect(counts).toHaveTextContent('4 planned');
    expect(counts).not.toHaveTextContent('unchanged');
    expect(seen).toEqual([GLOBEX]);
    expect(screen.queryByText(/Acme/)).toBeNull();
  });
});
