// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

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

async function ownSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Your GitHub account' });
  const section = heading.closest('section');
  if (section === null) throw new Error('no link section');
  return section;
}

async function membersSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Members’ GitHub links' });
  const section = heading.closest('section');
  if (section === null) throw new Error('no members section');
  return section;
}

function rowOf(section: HTMLElement, login: string): HTMLElement {
  const found = within(section)
    .getAllByRole('listitem')
    .find((item) => /^[^ ]+/.exec(item.querySelector('.o-row__meta')?.textContent ?? '')?.[0] === login);
  if (found === undefined) throw new Error(`no row for ${login}`);
  return found;
}

describe('the member’s own GitHub link', () => {
  it('invites a member who is not linked to link, through the web flow', async () => {
    visit('/github');
    const section = await ownSection();
    expect(await within(section).findByText('Not linked')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Link GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/github/link/start?org=${ACME}`,
    );
    expect(within(section).queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  it('shows the linked account and unlinks it after a confirmation', async () => {
    const user = userEvent.setup();
    db.githubLinks[ACME] = [
      {
        memberId: MEMBER_IDS.maya,
        state: 'linked',
        appConfigured: true,
        login: 'maya-gh',
        linkedAt: '2026-10-20T09:00:00Z',
      },
    ];
    visit('/github');
    const section = await ownSection();
    expect(await within(section).findByText('maya-gh')).toBeInTheDocument();
    expect(within(section).getByText('Oct 20, 2026')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Link again' })).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Unlink' }));
    await user.click(within(section).getByRole('button', { name: 'Unlink my GitHub' }));
    expect(await within(section).findByText('Not linked')).toBeInTheDocument();
    expect(db.githubLinks[ACME]).toEqual([]);
  });

  it('keeps the link when the person keeps it, and links again when it needs reconnecting', async () => {
    const user = userEvent.setup();
    db.githubLinks[ACME] = [
      { memberId: MEMBER_IDS.maya, state: 'reconnect_required', appConfigured: true, login: 'maya-gh' },
    ];
    visit('/github');
    const section = await ownSection();
    expect(await within(section).findByText('Reconnect needed')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Link again' })).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Unlink' }));
    await user.click(within(section).getByRole('button', { name: 'Keep' }));
    expect(within(section).getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
    // No date from the server: none shown.
    expect(within(section).queryByText('Linked')).toBeNull();
  });

  it('says so, without a link button, when the App cannot link accounts', async () => {
    db.githubLinks[ACME] = [{ memberId: MEMBER_IDS.maya, state: 'not_linked', appConfigured: false }];
    visit('/github');
    const section = await ownSection();
    expect(await within(section).findByText(/cannot link accounts yet/)).toBeInTheDocument();
    expect(within(section).queryByRole('link', { name: 'Link GitHub' })).toBeNull();
  });

  it('holds the unlink buttons while an unlink of a member is not answered', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/github/links/:memberId', async () => {
        await delay('infinite');
        return new HttpResponse(null);
      }),
    );
    visit('/github');
    const section = await membersSection();
    await within(section).findByText(/@theo-dev/);
    await user.click(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink' }));
    await user.click(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink theo' }));
    expect(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('says why an unlink was refused', async () => {
    const user = userEvent.setup();
    db.githubLinks[ACME] = [
      { memberId: MEMBER_IDS.maya, state: 'linked', appConfigured: true, login: 'maya-gh' },
    ];
    server.use(
      http.delete('*/api/v1/github/link', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'People only.' } }, { status: 403 }),
      ),
    );
    visit('/github');
    const section = await ownSection();
    await user.click(await within(section).findByRole('button', { name: 'Unlink' }));
    await user.click(within(section).getByRole('button', { name: 'Unlink my GitHub' }));
    expect(await within(section).findByText('People only.')).toBeInTheDocument();
    expect(within(section).getByText('maya-gh')).toBeInTheDocument();
  });

  it('says a read failure in the section, and leaves the App below', async () => {
    server.use(
      http.get('*/api/v1/github/link', () =>
        HttpResponse.json({ error: { type: 'server_error', message: 'Down.' } }, { status: 500 }),
      ),
    );
    visit('/github');
    expect(await screen.findByText('Installed')).toBeInTheDocument();
    expect(await screen.findByText('Down.', undefined, { timeout: 4_000 })).toBeInTheDocument();
  });

  it('is absent from a server that does not list github.link.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'github.link.v1'))),
      ),
    );
    visit('/github');
    expect(await screen.findByText('Installed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your GitHub account' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Members’ GitHub links' })).toBeNull();
  });

  it('shows a member their own link only, never the members’ table', async () => {
    asMember();
    let asked = false;
    server.use(
      http.get('*/api/v1/github/links', () => {
        asked = true;
        return HttpResponse.json({ items: [] });
      }),
    );
    visit('/github');
    await ownSection();
    expect(await screen.findByText('Installed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Members’ GitHub links' })).toBeNull();
    expect(asked).toBe(false);
  });
});

describe('what the web flow brings back', () => {
  it('says the link worked, and cleans the address', async () => {
    const router = visit('/github?linked=1');
    expect(await screen.findByText('The GitHub account is linked.')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({});
  });

  it.each([
    ['github_link_not_found', 'This link attempt is unknown or has expired. Start again.'],
    ['github_link_browser_mismatch', /not opened in the browser that started it/],
    ['github_link_denied', 'The link was cancelled on GitHub.'],
    ['github_account_in_use', 'This GitHub account is already linked to another member.'],
    ['github_app_not_configured', 'The GitHub App of this server cannot link accounts yet.'],
    ['github_unreachable', 'GitHub could not be reached. Try again in a moment.'],
  ])('words the error %s', async (type, words) => {
    visit(`/github?error=${type}`);
    expect(await screen.findByText(words)).toBeInTheDocument();
  });

  it('words an error it does not know as unfinished', async () => {
    visit('/github?error=something_else');
    expect(
      await screen.findByText('GitHub did not finish the installation. Start it again.'),
    ).toBeInTheDocument();
  });
});

describe('the members’ GitHub links', () => {
  it('lists every member with their link, and offers to link or relink each', async () => {
    visit('/github');
    const section = await membersSection();
    await within(section).findByText(/@theo-dev/);
    const theo = rowOf(section, 'theo');
    expect(theo).toHaveTextContent('@theo-dev');
    expect(within(theo).getByText('Linked')).toBeInTheDocument();
    expect(within(theo).getByRole('link', { name: 'Link again for theo' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/github/links/${MEMBER_IDS.theo}/start?org=${ACME}`,
    );
    const lena = rowOf(section, 'lena');
    expect(within(lena).getByText('Reconnect needed')).toBeInTheDocument();
    const samir = rowOf(section, 'samir');
    expect(within(samir).getByText('Not linked')).toBeInTheDocument();
    expect(within(samir).getByRole('link', { name: 'Link for samir' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/github/links/${MEMBER_IDS.samir}/start?org=${ACME}`,
    );
    expect(within(samir).queryByRole('button', { name: 'Unlink' })).toBeNull();
    expect(within(section).getByText(/sign in to GitHub as that account first/)).toBeInTheDocument();
  });

  it('unlinks a member', async () => {
    const user = userEvent.setup();
    visit('/github');
    const section = await membersSection();
    await within(section).findByText(/@theo-dev/);
    await user.click(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink' }));
    await user.click(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink theo' }));
    expect(await within(rowOf(section, 'theo')).findByText('Not linked')).toBeInTheDocument();
    expect(db.githubLinks[ACME]?.map((link) => link.memberId)).toEqual([MEMBER_IDS.lena]);
  });

  it('says why an unlink of a member was refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/github/links/:memberId', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'Browser sessions only.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/github');
    const section = await membersSection();
    await within(section).findByText(/@theo-dev/);
    await user.click(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink' }));
    await user.click(within(rowOf(section, 'theo')).getByRole('button', { name: 'Unlink theo' }));
    expect(await within(section).findByText('Browser sessions only.')).toBeInTheDocument();
  });

  it('offers no link while the App cannot link accounts', async () => {
    db.githubLinks[ACME] = [{ memberId: MEMBER_IDS.maya, state: 'not_linked', appConfigured: false }];
    visit('/github');
    const section = await membersSection();
    await within(section).findAllByText('Not linked');
    expect(within(section).queryByRole('link')).toBeNull();
  });

  it('says why the links did not load', async () => {
    server.use(
      http.get('*/api/v1/github/links', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'Not for you.' } }, { status: 403 }),
      ),
    );
    visit('/github');
    const section = await membersSection();
    expect(await within(section).findByText('Not for you.')).toBeInTheDocument();
  });

  it('reads a long list of members a page at a time', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/orgs/:org/members', ({ request }) => {
        const after = new URL(request.url).searchParams.get('after');
        const member = (id: string, login: string) => ({
          id,
          login,
          name: '',
          avatarUrl: '',
          email: null,
          role: 'member',
          joinedAt: '2026-10-01T00:00:00Z',
        });
        return after === null
          ? HttpResponse.json({ items: [member(MEMBER_IDS.maya, 'maya')], next: MEMBER_IDS.maya })
          : HttpResponse.json({ items: [member(MEMBER_IDS.jo, 'zed')] });
      }),
    );
    visit('/github');
    const section = await membersSection();
    // A member without a name shows by login.
    await within(section).findByText('maya', { selector: '.o-row__title' });
    await user.click(within(section).getByRole('button', { name: 'Show more members' }));
    expect(await within(section).findByText('zed', { selector: '.o-row__title' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Show more members' })).toBeNull();
  });
});
