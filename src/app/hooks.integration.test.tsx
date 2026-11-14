// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { largeMembers } from '@/mocks/fixtures/large';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

/** The demo person is a plain member: the console reads their role from the server's answer about them. */
function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

const refuse = (status: number, type: string, message: string) => () =>
  HttpResponse.json({ error: { type, message } }, { status });

/** The row of a list that holds `text`. */
function rowOf(list: HTMLElement, text: string): HTMLElement {
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(text) !== null);
  if (row === undefined) throw new Error(`no row ${text}`);
  return row;
}

function hook(name: string) {
  const found = db.hooks.find((item) => item.name === name);
  if (found === undefined) throw new Error(`no hook ${name}`);
  return found;
}

describe('the team hooks', () => {
  it('lists each hook with its pinned version, audience and when it changed', async () => {
    visit('/hooks');
    const list = await screen.findByRole('list', { name: 'Hooks' });
    expect(screen.getByRole('heading', { level: 1, name: 'Team hooks' })).toBeInTheDocument();
    const required = rowOf(list, 'require-status');
    expect(within(required).getByRole('link', { name: 'require-status' })).toHaveAttribute(
      'href',
      '/hooks/require-status',
    );
    expect(required).toHaveTextContent('Pinned version 1.0.0');
    expect(required).toHaveTextContent('Members set to Yes');
    const audit = rowOf(list, 'audit-tools');
    expect(audit).toHaveTextContent('Not pinned: not delivered');
    expect(audit).toHaveTextContent('All members, except those set to No');
    expect(screen.getByRole('link', { name: 'My delivered hooks' })).toHaveAttribute(
      'href',
      `/members/${MEMBER_IDS.maya}/hooks`,
    );
    await userEvent.setup().click(screen.getByText('How this works'));
    expect(screen.getByText(/only an administrator pins a version here/)).toBeVisible();
  });

  it('says so when nothing has been published, and why the catalog did not load', async () => {
    db.hooks = [];
    visit('/hooks');
    expect(await screen.findByText('No hook has been published yet.')).toBeInTheDocument();
  });

  it('shows what the server said when the catalog is refused', async () => {
    server.use(http.get('*/api/v1/hooks', refuse(500, 'internal', 'the hooks are down')));
    visit('/hooks');
    expect(await screen.findByText('the hooks are down', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('sends a member who is not an administrator to the hooks delivered to them', async () => {
    asMember();
    const router = visit('/hooks');
    expect(await screen.findByRole('heading', { level: 1, name: 'Delivered hooks' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/members/${MEMBER_IDS.maya}/hooks`);
  });
});

describe('one hook', () => {
  it('lists its versions with definition, digest, content and publisher, and a link to read the files', async () => {
    visit('/hooks/require-status');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hook require-status' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Versions of require-status' });
    const current = rowOf(list, '1.0.0');
    expect(current).toHaveTextContent('Pinned');
    expect(current).toHaveTextContent('Stop, SubagentStop');
    expect(current).toHaveTextContent('runs bin/require-status.sh, 30 s');
    expect(current).toHaveTextContent('2 files · 640 bytes');
    expect(current).toHaveTextContent('Published by Lena Ortiz (lena)');
    expect(current).toHaveTextContent('Approved and delivered');
    expect(within(current).getByRole('link', { name: 'Read the files of version 1.0.0' })).toHaveAttribute(
      'href',
      '/hooks/require-status/versions/1.0.0',
    );
    const older = rowOf(list, '0.9.0');
    expect(older).toHaveTextContent('runs bin/require-status.sh, 60 s');
    expect(older).not.toHaveTextContent('matcher');
    expect(screen.getByRole('link', { name: 'Back to team hooks' })).toHaveAttribute('href', '/hooks');
  });

  it('shows a hook’s matcher', async () => {
    visit('/hooks/audit-tools');
    expect(await screen.findByRole('list', { name: 'Versions of audit-tools' })).toHaveTextContent(
      'matcher Bash',
    );
  });

  it('pins another version, then unpins it, so that nothing is delivered', async () => {
    const user = userEvent.setup();
    visit('/hooks/require-status');
    const list = await screen.findByRole('list', { name: 'Versions of require-status' });
    await user.click(within(rowOf(list, '0.9.0')).getByRole('button', { name: 'Pin this version' }));
    await waitFor(() => {
      expect(hook('require-status').pinnedVersion).toBe('0.9.0');
    });
    await waitFor(() => {
      expect(within(rowOf(list, '0.9.0')).getByText('Approved and delivered')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Unpin (stop delivery)' }));
    await waitFor(() => {
      expect(hook('require-status').pinnedVersion).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unpin (stop delivery)' })).toBeNull();
    });
    await user.click(screen.getByText('How this works'));
    expect(screen.getByText(/No pinned version: nothing is delivered\./)).toBeInTheDocument();
  });

  it('says whom pinning reaches: members set to Yes, or every member not set to No', async () => {
    const user = userEvent.setup();
    visit('/hooks/require-status');
    await user.click(await screen.findByText('How this works'));
    expect(screen.getByText(/Delivering 1\.0\.0\./)).toBeInTheDocument();
    expect(screen.getByText(/of every member set to Yes once they approve it/)).toBeInTheDocument();
    expect(screen.getByText(/Read the version’s files before pinning it/)).toBeInTheDocument();
  });

  it('switches the audience and saves each member’s decision', async () => {
    const user = userEvent.setup();
    visit('/hooks/require-status');
    const access = await screen.findByRole('region', { name: 'Access' });
    expect(access).toHaveTextContent('Only Yes delivers the pinned version.');
    await user.selectOptions(within(access).getByRole('combobox', { name: 'Audience' }), 'all');
    await user.click(within(access).getByRole('button', { name: 'Save audience' }));
    await waitFor(() => {
      expect(hook('require-status').allMembers).toBe(true);
    });
    await waitFor(() => {
      expect(access).toHaveTextContent('including members who join later, except those set to No');
    });
    const members = within(access).getByRole('list', { name: 'Decision of each member' });
    expect(within(rowOf(members, 'Lena Ortiz (lena)')).getByRole('combobox')).toHaveValue('allow');
    expect(
      within(rowOf(members, 'theo')).getByRole('option', { name: 'Default (receives it)' }),
    ).toBeInTheDocument();
    expect(within(rowOf(members, 'theo')).getByRole('link', { name: 'Delivered hooks' })).toHaveAttribute(
      'href',
      `/members/${MEMBER_IDS.theo}/hooks`,
    );
    await user.selectOptions(within(rowOf(members, 'theo')).getByRole('combobox'), 'deny');
    await user.click(within(rowOf(members, 'theo')).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.hookAssignments['require-status']?.map((item) => item.decision)).toEqual(['allow', 'deny']);
    });
    await user.selectOptions(within(rowOf(members, 'Lena Ortiz (lena)')).getByRole('combobox'), 'none');
    await user.click(within(rowOf(members, 'Lena Ortiz (lena)')).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.hookAssignments['require-status']?.map((item) => item.decision)).toEqual(['deny']);
    });
  });

  it('says the members cannot be read, and why a hook is not there', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', refuse(403, 'forbidden', 'no members')));
    visit('/hooks/require-status');
    expect(
      await screen.findByText('The members could not be read, so their decisions cannot be shown.'),
    ).toBeInTheDocument();
  });

  it('shows why a hook is not there', async () => {
    visit('/hooks/nope');
    expect(await screen.findByText('hook not found')).toBeInTheDocument();
  });

  it('says so for a hook without a version', async () => {
    db.hookVersions['audit-tools'] = [];
    visit('/hooks/audit-tools');
    expect(await screen.findByText('No version has been published yet.')).toBeInTheDocument();
  });

  it('shows why a write was refused', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/hooks/:name/pin', refuse(403, 'forbidden', 'Not an administrator.')));
    visit('/hooks/require-status');
    const list = await screen.findByRole('list', { name: 'Versions of require-status' });
    await user.click(within(rowOf(list, '0.9.0')).getByRole('button', { name: 'Pin this version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an administrator.');
  });
});

describe('the code of a hook version', () => {
  it('shows the definition and every file, read in full before pinning', async () => {
    visit('/hooks/require-status/versions/1.0.0');
    const definition = await screen.findByRole('region', { name: 'Definition' });
    expect(screen.getByRole('heading', { level: 1, name: 'Hook require-status 1.0.0' })).toBeInTheDocument();
    expect(definition).toHaveTextContent(`sha256:${'2'.repeat(64)}`);
    expect(definition).toHaveTextContent('Stop, SubagentStop');
    const script = screen.getByRole('region', { name: 'bin/require-status.sh' });
    expect(script).toHaveTextContent('executable, 79 bytes');
    expect(within(script).getByText(/Refuse to stop without saying where it stands/)).toBeInTheDocument();
    const binary = screen.getByRole('region', { name: 'data/blob.bin' });
    expect(binary).toHaveTextContent('file, 2 bytes');
    expect(binary).toHaveTextContent('Binary content not shown.');
    expect(screen.getByRole('link', { name: 'Back to the hook' })).toHaveAttribute(
      'href',
      '/hooks/require-status',
    );
  });

  it('shows why a version is not there', async () => {
    visit('/hooks/require-status/versions/9.9.9');
    expect(await screen.findByText('hook version not found')).toBeInTheDocument();
  });

  it('is an administrator’s: anyone else is sent to the hooks delivered to them', async () => {
    asMember();
    const router = visit('/hooks/require-status/versions/1.0.0');
    expect(await screen.findByRole('heading', { level: 1, name: 'Delivered hooks' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/members/${MEMBER_IDS.maya}/hooks`);
  });
});

describe('a team of more than a hundred people', () => {
  it('reads every page of members for the decisions, without being asked', async () => {
    const large = largeMembers().slice(0, 150);
    const far = large[130];
    if (far === undefined) throw new Error('no member 130');
    db.orgMembers[db.organization.id] = [...(db.orgMembers[db.organization.id] ?? []), ...large];
    visit('/hooks/require-status');
    const list = await screen.findByRole('list', { name: 'Decision of each member' });
    expect(
      await within(list).findByText(`${far.name} (${far.login})`, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(large.length);
    expect(screen.queryByRole('button', { name: 'Show more people' })).toBeNull();
  }, 15_000);
});
