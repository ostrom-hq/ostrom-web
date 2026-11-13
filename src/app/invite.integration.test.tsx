// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiError } from '@gen/api/types.gen';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { INVITE_TOKEN_KEY } from '@/features/onboarding';
import { DEMO_INVITATION_TOKEN } from '@/mocks/fixtures/organization';
import { useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

afterEach(() => {
  sessionStorage.clear();
});

function refuse(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json({ error: { type, message } }, { status });
}

/** Opens the invitation link as the e-mail gives it. */
function open(token: string): ReturnType<typeof visit> {
  return visit(`/invite#token=${token}`);
}

describe('the invitation page', () => {
  it('takes the secret out of the address, keeps it for this tab, and shows where it leads', async () => {
    const router = open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Join Initech' })).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBe(DEMO_INVITATION_TOKEN);
    expect(screen.getByText('You are invited as Approver.')).toBeInTheDocument();
    const facts = screen.getAllByRole('definition')[0]?.closest('dl');
    if (facts === null || facts === undefined) throw new Error('no facts');
    expect(facts).toHaveTextContent('OrganizationInitech initech');
    expect(facts).toHaveTextContent('RoleApprover');
    expect(facts).not.toHaveTextContent('For');
    expect(facts).toHaveTextContent(/Expires\w+ \d+, \d{4}/);
  });

  it('joins the organization, acts in it and opens the console', async () => {
    const user = userEvent.setup();
    const router = open(DEMO_INVITATION_TOKEN);
    await user.click(await screen.findByRole('button', { name: 'Join Initech' }));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    const initech = db.otherOrganizations.find((organization) => organization.name === 'Initech');
    expect(initech).toBeDefined();
    expect(useOrgStore.getState().current).toBe(initech?.id);
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Initech' })).toBeInTheDocument();
  });

  it('presents the invitation to the server before sending a signed-out person to sign in', async () => {
    db.signedIn = false;
    open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('link', { name: 'Sign in to join' })).toHaveAttribute(
      'href',
      expect.stringContaining('/signin'),
    );
    expect(db.grants).toEqual([DEMO_INVITATION_TOKEN]);
  });

  it('holds the way to sign in while the invitation is being presented', async () => {
    db.signedIn = false;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('*/api/v1/auth/signup-grant', async () => {
        await held;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('button', { name: 'Sign in to join' })).toBeDisabled();
    release();
    expect(await screen.findByRole('link', { name: 'Sign in to join' })).toBeInTheDocument();
  });

  it('lets the person sign in even when the server refused the grant', async () => {
    db.signedIn = false;
    server.use(http.post('*/api/v1/auth/signup-grant', () => refuse(429, 'too_many_attempts', 'Slow down.')));
    open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('link', { name: 'Sign in to join' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('presents nothing for a dead invitation, nor for someone already signed in', async () => {
    db.signedIn = false;
    open('inv_gone');
    expect(await screen.findByText('This invitation no longer works')).toBeInTheDocument();
    expect(db.grants).toEqual([]);
  });

  it('presents nothing when someone is signed in', async () => {
    open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('button', { name: 'Join Initech' })).toBeInTheDocument();
    expect(db.grants).toEqual([]);
  });

  it('says when no invitation was opened in this tab', async () => {
    visit('/invite');
    expect(await screen.findByText('No invitation here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the console' })).toHaveAttribute('href', '/');
  });

  it('says when the invitation is used up, revoked or expired, and forgets it', async () => {
    open('inv_gone');
    expect(await screen.findByText('This invitation no longer works')).toBeInTheDocument();
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBeNull();
  });

  it('keeps the invitation when the network kept it from being read, and says why', async () => {
    server.use(http.post('*/api/v1/invitations/preview', () => HttpResponse.error()));
    open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBe(DEMO_INVITATION_TOKEN);
  });

  it('shows the shape of the page while the invitation is read', async () => {
    server.use(http.post('*/api/v1/invitations/preview', async () => delay('infinite')));
    open(DEMO_INVITATION_TOKEN);
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('asks someone signed out to sign in, and comes back here after', async () => {
    server.use(http.get('*/api/v1/auth/me', () => refuse(401, 'unauthorized', 'sign in')));
    open(DEMO_INVITATION_TOKEN);
    const signIn = await screen.findByRole('link', { name: 'Sign in to join' });
    expect(signIn).toHaveAttribute('href', '/signin?redirect=%2Finvite');
    expect(screen.queryByRole('button', { name: 'Join Initech' })).toBeNull();
  });

  it('holds the button while the person is read, and while they join', async () => {
    const user = userEvent.setup();
    let me = 0;
    server.use(
      http.get('*/api/v1/auth/me', async () => {
        me += 1;
        if (me === 1) await delay(300);
        return undefined;
      }),
      http.post('*/api/v1/invitations/accept', async () => delay('infinite')),
    );
    open(DEMO_INVITATION_TOKEN);
    const join = await screen.findByRole('button', { name: 'Join Initech' });
    expect(join).toBeDisabled();
    await vi.waitFor(() => {
      expect(join).toBeEnabled();
    });
    await user.click(join);
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
  });

  it('says when the person is already in, forgets the invitation, and opens that organization', async () => {
    const user = userEvent.setup();
    // Already a member: Initech is one of the person's organizations.
    db.otherOrganizations = db.elsewhere;
    db.elsewhere = [];
    server.use(
      http.post('*/api/v1/invitations/preview', () =>
        HttpResponse.json({
          orgName: 'Initech',
          orgSlug: 'initech',
          role: 'approver',
          email: null,
          expiresAt: '2027-10-28T09:00:00Z',
        }),
      ),
    );
    const router = open(DEMO_INVITATION_TOKEN);
    await user.click(await screen.findByRole('button', { name: 'Join Initech' }));
    expect(await screen.findByText('You are already a member of Initech.')).toBeInTheDocument();
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Join Initech' })).toBeNull();
    // The organizations are read again before it is opened: the button holds meanwhile.
    server.use(
      http.get('*/api/v1/orgs', async () => {
        await delay(100);
        return undefined;
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Open Initech' }));
    expect(screen.getByRole('button', { name: 'Open Initech' })).toBeDisabled();
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(useOrgStore.getState().current).toBe(db.otherOrganizations[0]?.id);
  });

  it('opens the console even when the person’s organizations cannot be read after', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/invitations/accept', () => refuse(409, 'already_member', 'already a member')),
    );
    const router = open(DEMO_INVITATION_TOKEN);
    await user.click(await screen.findByRole('button', { name: 'Join Initech' }));
    server.use(http.get('*/api/v1/orgs', () => refuse(500, 'internal', 'orgs are down')));
    await user.click(await screen.findByRole('button', { name: 'Open Initech' }));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    // The console opens, and says why it cannot show the organizations.
    expect(await screen.findByText('orgs are down')).toBeInTheDocument();
  });

  it('says a link revoked or used up since it was read no longer works, and forgets it', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/invitations/accept', () => refuse(404, 'not_found', 'gone')));
    open(DEMO_INVITATION_TOKEN);
    await user.click(await screen.findByRole('button', { name: 'Join Initech' }));
    expect(await screen.findByText('This invitation no longer works')).toBeInTheDocument();
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBeNull();
  });

  it('says an e-mail invitation is for another address, with its address and a role it does not know', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/invitations/preview', () =>
        HttpResponse.json({
          orgName: 'Acme',
          orgSlug: 'acme',
          role: 'auditor',
          email: 'jo@acme.dev',
          expiresAt: '2027-10-28T09:00:00Z',
        }),
      ),
    );
    open('inv_jo');
    expect(await screen.findByText('You are invited as auditor.')).toBeInTheDocument();
    expect(screen.getByText('jo@acme.dev')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Join Acme' }));
    expect(
      await screen.findByText(
        'This invitation was sent to another e-mail address, or no longer works. Sign in with the account it was sent to, or ask for a new one.',
      ),
    ).toBeInTheDocument();
    // Kept for the account that holds it.
    expect(sessionStorage.getItem(INVITE_TOKEN_KEY)).toBe('inv_jo');
  });

  it('says why joining failed, and lets the person try again', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/invitations/accept', () => refuse(500, 'internal', 'joining is down')));
    open(DEMO_INVITATION_TOKEN);
    await user.click(await screen.findByRole('button', { name: 'Join Initech' }));
    expect(await screen.findByText('joining is down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Initech' })).toBeEnabled();
  });
});
