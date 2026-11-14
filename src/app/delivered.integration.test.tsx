// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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

describe('the skills delivered to the viewer', () => {
  it('lists the pinned versions they receive, with digest and content, and where each workstation installed them', async () => {
    visit(`/members/${MEMBER_IDS.maya}/skills`);
    const list = await screen.findByRole('list', { name: 'Delivered skills' });
    expect(screen.getByRole('heading', { level: 1, name: 'Delivered skills' })).toBeInTheDocument();
    expect(screen.getByText('What is delivered to you.')).toBeInTheDocument();
    // The audience and their own personal skill; not the one that is not pinned.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.o-row__title')?.textContent),
    ).toEqual(['maya-notes', 'review-pr']);
    const review = rowOf(list, 'review-pr');
    expect(review).toHaveTextContent('1.2.0');
    expect(review).toHaveTextContent(`sha256:${'a'.repeat(64)}`);
    expect(review).toHaveTextContent('3 files · 1204 bytes');
    const installs = await screen.findByRole('list', { name: 'Installations' });
    expect(installs).toHaveTextContent('maya-mbp');
    expect(installs).toHaveTextContent('review-pr 1.2.0');
    expect(installs).toHaveTextContent('Installed');
    expect(screen.getByText(/does not grant access/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the catalog' })).toHaveAttribute('href', '/skills');
    expect(screen.getByRole('link', { name: 'My personal skills' })).toHaveAttribute('href', '/me/skills');
  });

  it('is the member’s own view, without the catalog, for someone who is not an administrator', async () => {
    asMember();
    visit(`/members/${MEMBER_IDS.maya}/skills`);
    expect(await screen.findByRole('list', { name: 'Delivered skills' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Installations' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to the catalog' })).toBeNull();
  });

  it('says so when nothing is delivered and nothing was installed', async () => {
    db.skills = [];
    db.skillInstallations = {};
    visit(`/members/${MEMBER_IDS.maya}/skills`);
    expect(await screen.findByText('No skill is delivered to this member.')).toBeInTheDocument();
    expect(await screen.findByText(/No installation reported yet/)).toBeInTheDocument();
  });
});

describe('the skills delivered to another member', () => {
  it('is an administrator’s view of them, with their installations and each status', async () => {
    visit(`/members/${MEMBER_IDS.theo}/skills`);
    expect(await screen.findByText('What is delivered to theo.')).toBeInTheDocument();
    // An explicit No wins over the audience: theo receives nothing.
    expect(await screen.findByText('No skill is delivered to this member.')).toBeInTheDocument();
    const installs = await screen.findByRole('list', { name: 'Installations' });
    const laptop = rowOf(installs, 'review-pr');
    expect(laptop).toHaveTextContent('theo-laptop');
    expect(laptop).toHaveTextContent('review-pr 1.2.0');
    expect(laptop).toHaveTextContent('Installed');
    expect(rowOf(installs, 'old-lint')).toHaveTextContent('Failed');
    const removed = rowOf(installs, 'release-notes');
    expect(removed).toHaveTextContent('theo-desktop');
    expect(removed).toHaveTextContent('Removed');
    expect(screen.queryByRole('link', { name: 'My personal skills' })).toBeNull();
  });

  it('names the member by their name and login, or by their id when they cannot be found', async () => {
    visit(`/members/${MEMBER_IDS.samir}/skills`);
    expect(await screen.findByText('What is delivered to Samir Haddad (samir).')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Delivered skills' })).toHaveTextContent('review-pr');
  });

  it('reads an unknown member as their id, and says the server does not know them', async () => {
    visit('/members/someone-who-left/skills');
    expect(await screen.findByText('What is delivered to someone-who-left.')).toBeInTheDocument();
    expect(await screen.findByText('member not found')).toBeInTheDocument();
  });

  it('shows an installation status the console does not know as it came', async () => {
    db.skillInstallations[MEMBER_IDS.theo] = [
      {
        deviceId: 'd',
        deviceName: 'theo-laptop',
        name: 'review-pr',
        status: 'quarantined',
        reportedAt: '2026-11-06T09:00:00.000Z',
      },
    ];
    visit(`/members/${MEMBER_IDS.theo}/skills`);
    expect(await screen.findByText('quarantined')).toBeInTheDocument();
  });

  it('is refused to a member who is not an administrator, with the server’s words', async () => {
    asMember();
    visit(`/members/${MEMBER_IDS.theo}/skills`);
    expect(await screen.findByText('Only an owner or an admin manages the catalog.')).toBeInTheDocument();
  });

  it('names the member by their id when the members cannot be read', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', refuse(403, 'forbidden', 'no members')));
    visit(`/members/${MEMBER_IDS.theo}/skills`);
    expect(await screen.findByText(`What is delivered to ${MEMBER_IDS.theo}.`)).toBeInTheDocument();
  });
});

describe('the hooks delivered to a member', () => {
  it('lists the pinned versions a member receives, with their definition, as an administrator reads them', async () => {
    visit(`/members/${MEMBER_IDS.lena}/hooks`);
    const list = await screen.findByRole('list', { name: 'Delivered hooks' });
    expect(screen.getByRole('heading', { level: 1, name: 'Delivered hooks' })).toBeInTheDocument();
    expect(screen.getByText('What is delivered to Lena Ortiz (lena).')).toBeInTheDocument();
    const row = rowOf(list, 'require-status');
    expect(row).toHaveTextContent('1.0.0');
    expect(row).toHaveTextContent(`sha256:${'2'.repeat(64)}`);
    expect(row).toHaveTextContent('Stop, SubagentStop');
    expect(row).toHaveTextContent('runs bin/require-status.sh, 30 s');
    expect(row).toHaveTextContent('2 files · 640 bytes');
    expect(screen.getByText(/the CLI asks them to approve each version/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to team hooks' })).toHaveAttribute('href', '/hooks');
  });

  it('is the viewer’s own view when it is theirs, for any role', async () => {
    asMember();
    db.hookAssignments['require-status'] = [
      { memberId: MEMBER_IDS.maya, decision: 'allow', updatedAt: '2026-11-01T10:00:00.000Z' },
    ];
    visit(`/members/${MEMBER_IDS.maya}/hooks`);
    expect(await screen.findByText('What is delivered to you.')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Delivered hooks' })).toHaveTextContent('require-status');
    expect(screen.queryByRole('link', { name: 'Back to team hooks' })).toBeNull();
  });

  it('says so when no hook is delivered', async () => {
    visit(`/members/${MEMBER_IDS.maya}/hooks`);
    expect(await screen.findByText('No hook is delivered to this member.')).toBeInTheDocument();
  });

  it('shows why another member’s hooks are not readable by someone who is not an administrator', async () => {
    asMember();
    visit(`/members/${MEMBER_IDS.lena}/hooks`);
    await waitFor(() => {
      expect(screen.getByText('Only an owner or an admin manages the catalog.')).toBeInTheDocument();
    });
  });
});
