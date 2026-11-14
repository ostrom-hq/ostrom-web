// SPDX-License-Identifier: Apache-2.0
import type { ApiError } from '@gen/api/types.gen';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { ADMIN_TOKEN_SCOPES, DEMO_ADMIN_DEVICE_CODE, DEMO_DEVICE_CODE } from '@/mocks/fixtures/device';
import { initialOrgMembers, otherOrganization } from '@/mocks/fixtures/organization';
import { FRESH_SIGN_IN_MS } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function refuse(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json({ error: { type, message } }, { status });
}

/** Opens the page as the terminal's link does. */
function open(code: string): ReturnType<typeof visit> {
  return visit(`/device?code=${code}`);
}

/** What the page says, apart from the shell around it (its own sign-in link, its banners). */
async function main(): Promise<HTMLElement> {
  return screen.findByRole('main');
}

/** The admin sign-in the demo's terminal started, as the server keeps it. */
function adminLogin(): (typeof db.deviceLogins)[number] | undefined {
  return db.deviceLogins.find((login) => login.authorization.userCode === DEMO_ADMIN_DEVICE_CODE);
}

/** The demo person also belongs to Globex: with `role` there, or as the owner who made it. */
function alsoIn(role?: string): ReturnType<typeof otherOrganization> {
  const globex = otherOrganization();
  db.otherOrganizations = [globex];
  if (role !== undefined)
    db.orgMembers[globex.id] = initialOrgMembers().map((member) =>
      member.login === 'maya' ? { ...member, role } : member,
    );
  return globex;
}

/** The demo person stops being an owner or an admin of Acme, in its members and in their list of organizations. */
function demote(): void {
  db.members = db.members.map((member) => (member.login === 'maya' ? { ...member, role: 'member' } : member));
  setDemoRole(db, 'member');
}

/** The admin approval, once the person's organizations are read: before, it cannot be pressed. */
async function approveAdmin(): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: 'Approve the admin sign-in' });
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  return button;
}

describe('the device sign-in page', () => {
  it('shows what asks to sign in and its code, then signs the terminal in', async () => {
    const user = userEvent.setup();
    open(DEMO_DEVICE_CODE);
    expect(await screen.findByText('ostrom CLI on ada-laptop')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in a terminal' })).toBeInTheDocument();
    expect(screen.getByText(DEMO_DEVICE_CODE)).toHaveClass('o-device__code');
    expect(screen.getByText('Expires at')).toBeInTheDocument();
    // Web audit 2, W3: when and from which network the terminal asked, so a code sent by someone else shows.
    expect(screen.getByText('Asked at')).toBeInTheDocument();
    expect(screen.getByText('Asked from (network)')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.0/24')).toHaveClass('o-mono');
    expect(screen.queryByText('Admin sign-in')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign in this terminal' }));
    expect(await screen.findByText('Terminal signed in')).toBeInTheDocument();
    expect(screen.getByText('Go back to your terminal: ostrom login carries on there.')).toBeInTheDocument();
    expect(db.deviceLogins[0]?.status).toBe('approved');
  });

  it('leaves the network out when the server could not tell it, and still says when the terminal asked', async () => {
    db.deviceLogins = db.deviceLogins.map((login) => {
      const authorization = { ...login.authorization };
      delete authorization.requestedFrom;
      return { ...login, authorization };
    });
    open(DEMO_DEVICE_CODE);
    expect(await screen.findByText('ostrom CLI on ada-laptop')).toBeInTheDocument();
    expect(screen.getByText('Asked at')).toBeInTheDocument();
    expect(screen.queryByText('Asked from (network)')).toBeNull();
  });

  it('refuses the terminal', async () => {
    const user = userEvent.setup();
    open(DEMO_DEVICE_CODE);
    await user.click(await screen.findByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Terminal refused')).toBeInTheDocument();
    expect(db.deviceLogins[0]?.status).toBe('denied');
  });

  it('holds both answers while one is on its way', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/device/answer', async () => delay('infinite')));
    open(DEMO_DEVICE_CODE);
    await user.click(await screen.findByRole('button', { name: 'Sign in this terminal' }));
    expect(screen.getByRole('button', { name: 'Sign in this terminal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
  });

  it('says an admin sign-in asks for the governance writes, and who may approve it', async () => {
    const user = userEvent.setup();
    open(DEMO_ADMIN_DEVICE_CODE);
    expect(await screen.findByText('Admin sign-in')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This terminal asks for every right below: the governance writes, the handover of shared accounts (accounts:write) and what the CLI reads. Only an owner or an admin of the organization may approve it.',
      ),
    ).toBeInTheDocument();
    const scopes = within(screen.getByRole('list', { name: 'Scopes asked' })).getAllByRole('listitem');
    // exactly the token's scopes, the handover included: no power approved unseen
    const listed = scopes.map((scope) => scope.textContent);
    expect(listed).toEqual(ADMIN_TOKEN_SCOPES);
    expect(listed).toEqual(expect.arrayContaining(['accounts:read', 'accounts:write']));
    await user.click(await approveAdmin());
    expect(await screen.findByText('Terminal signed in')).toBeInTheDocument();
  });

  it('tells someone who is neither owner nor admin that they cannot approve an admin sign-in', async () => {
    const user = userEvent.setup();
    demote();
    open(DEMO_ADMIN_DEVICE_CODE);
    await user.click(await approveAdmin());
    expect(await within(await main()).findByRole('alert')).toHaveTextContent(
      'Only an owner or an admin of the organization can approve an admin sign-in. Ask one of them, or deny it.',
    );
    expect(db.deviceLogins[1]?.status).toBe('pending');
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Terminal refused')).toBeInTheDocument();
  });

  it('asks to sign in again before approving an admin sign-in with an old sign-in, and comes back here', async () => {
    const user = userEvent.setup();
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1;
    open(DEMO_ADMIN_DEVICE_CODE);
    await user.click(await approveAdmin());
    const again = await screen.findByRole('link', { name: 'Sign in again' });
    expect(again).toHaveAttribute('href', `/signin?redirect=%2Fdevice%3Fcode%3D${DEMO_ADMIN_DEVICE_CODE}`);
    // The step-up, not the role: the admin refusal is never shown (the scopes' own notice names owners and admins).
    expect(screen.queryByText(/can approve an admin sign-in/)).toBeNull();
  });

  it('says why an answer did not go through, and lets the person answer again', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/device/answer', () => HttpResponse.error()));
    open(DEMO_DEVICE_CODE);
    await user.click(await screen.findByRole('button', { name: 'Sign in this terminal' }));
    const said = await within(await main()).findByRole('alert');
    expect(said).toHaveTextContent('Not answered');
    expect(said).toHaveTextContent('The server could not be reached.');
    expect(screen.getByRole('button', { name: 'Sign in this terminal' })).toBeEnabled();
  });

  it('says the code no longer works when the login was answered elsewhere', async () => {
    const user = userEvent.setup();
    open(DEMO_DEVICE_CODE);
    const approve = await screen.findByRole('button', { name: 'Sign in this terminal' });
    db.deviceLogins = db.deviceLogins.map((login) => ({ ...login, status: 'denied' as const }));
    await user.click(approve);
    expect(await screen.findByText('This code no longer works')).toBeInTheDocument();
    expect(
      screen.getByText('It expired or was answered already. Run ostrom login again for a new code.'),
    ).toBeInTheDocument();
  });

  it('says an admin sign-in cannot be approved here when the server cannot tell the organization (409)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/device/answer', () =>
        refuse(409, 'org_required', 'Name the organization this call acts in.'),
      ),
    );
    open(DEMO_ADMIN_DEVICE_CODE);
    await user.click(await approveAdmin());
    expect(await within(await main()).findByRole('alert')).toHaveTextContent(
      'The server could not tell which of your organizations this admin sign-in is for.',
    );
    expect(screen.queryByText('This code no longer works')).toBeNull();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });

  it('approves an admin sign-in for the organization chosen among those the person manages', async () => {
    const user = userEvent.setup();
    const globex = alsoIn();
    open(DEMO_ADMIN_DEVICE_CODE);
    const actsIn = await screen.findByRole('combobox', { name: 'Organization it acts in' });
    expect(
      within(actsIn)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Acme', 'Globex']);
    await user.selectOptions(actsIn, 'Globex');
    await user.click(await approveAdmin());
    expect(await screen.findByText('Terminal signed in')).toBeInTheDocument();
    // Named with `Ostrom-Org`: never the 409 a person in several organizations gets without it.
    expect(adminLogin()?.orgId).toBe(globex.id);
  });

  it('says the organization of an admin sign-in when the person manages only one of theirs', async () => {
    const user = userEvent.setup();
    alsoIn('member');
    open(DEMO_ADMIN_DEVICE_CODE);
    expect((await screen.findByText('Organization it acts in')).nextElementSibling).toHaveTextContent('Acme');
    expect(screen.queryByRole('combobox', { name: 'Organization it acts in' })).toBeNull();
    await user.click(await approveAdmin());
    expect(await screen.findByText('Terminal signed in')).toBeInTheDocument();
    expect(adminLogin()?.orgId).toBe(db.organization.id);
  });

  it('tells a person in several organizations who manages none why they cannot approve, never which one', async () => {
    const user = userEvent.setup();
    alsoIn('member');
    demote();
    open(DEMO_ADMIN_DEVICE_CODE);
    const approve = await approveAdmin();
    expect(screen.queryByText('Organization it acts in')).toBeNull();
    await user.click(approve);
    expect(await within(await main()).findByRole('alert')).toHaveTextContent(
      'Only an owner or an admin of the organization can approve an admin sign-in.',
    );
    expect(adminLogin()?.status).toBe('pending');
  });

  it('signs in an ordinary terminal for a person in several organizations, naming none', async () => {
    const user = userEvent.setup();
    alsoIn();
    const named: (string | null)[] = [];
    server.use(
      http.post('*/api/v1/auth/device/answer', ({ request }) => {
        named.push(request.headers.get('Ostrom-Org'));
      }),
    );
    open(DEMO_DEVICE_CODE);
    await user.click(await screen.findByRole('button', { name: 'Sign in this terminal' }));
    expect(await screen.findByText('Terminal signed in')).toBeInTheDocument();
    expect(screen.queryByText('Organization it acts in')).toBeNull();
    expect(named).toEqual([null]);
  });

  it('lets an admin sign-in be approved when the person’s organizations could not be read: the server then says why', async () => {
    const user = userEvent.setup();
    alsoIn();
    server.use(http.get('*/api/v1/orgs', () => refuse(403, 'forbidden', 'The request was refused.')));
    open(DEMO_ADMIN_DEVICE_CODE);
    await user.click(await approveAdmin());
    expect(
      await screen.findByText(
        /^The server could not tell which of your organizations this admin sign-in is for\./,
      ),
    ).toBeInTheDocument();
    expect(adminLogin()?.status).toBe('pending');
  });

  it('lets an admin sign-in be approved only once the person’s organizations are read, and denied at once', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/orgs', async () => {
        await delay('infinite');
      }),
    );
    open(DEMO_ADMIN_DEVICE_CODE);
    await screen.findByText('Admin sign-in');
    expect(screen.getByRole('button', { name: 'Approve the admin sign-in' })).toBeDisabled();
    expect(screen.queryByText('Organization it acts in')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Terminal refused')).toBeInTheDocument();
  });

  it('says an ordinary sign-in refused with a 403 as the server said it, never as a missing role', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/device/answer', () => refuse(403, 'forbidden', 'The request was refused.')),
    );
    open(DEMO_DEVICE_CODE);
    await user.click(await screen.findByRole('button', { name: 'Sign in this terminal' }));
    const said = await within(await main()).findByRole('alert');
    expect(said).toHaveTextContent('Not answered');
    expect(said).not.toHaveTextContent('can approve an admin sign-in');
  });

  it('never shows back what a link holds when it is not a code', async () => {
    open(encodeURIComponent('Your session expired, sign in on evil.example'));
    const said = await within(await main()).findByRole('alert');
    expect(said).toHaveTextContent(
      'This is not a code from ostrom login: it has eight letters, like ABCD-EFGH.',
    );
    expect(said).not.toHaveTextContent('evil.example');
  });

  it('reads an empty code in the address as no code', async () => {
    visit('/device?code=');
    expect(await screen.findByRole('form', { name: 'Code from the terminal' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads a code typed with spaces as the server does', async () => {
    const user = userEvent.setup();
    const router = visit('/device');
    await user.type(
      await screen.findByRole('textbox', { name: 'Code shown by the terminal' }),
      'wdjb mjht{Enter}',
    );
    expect(await screen.findByText('ostrom CLI on ada-laptop')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ code: DEMO_DEVICE_CODE });
  });

  it('says an unknown code is not waiting, then reads another one typed by hand', async () => {
    const user = userEvent.setup();
    const router = open('BBBB-CCCC');
    expect(await within(await main()).findByRole('alert')).toHaveTextContent(
      'No sign-in is waiting for BBBB-CCCC: it may have expired or been answered already.',
    );
    await user.type(screen.getByRole('textbox', { name: 'Code shown by the terminal' }), ' wdjb-mjht ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('ostrom CLI on ada-laptop')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ code: DEMO_DEVICE_CODE });
  });

  it('asks for the code when the address has none, then reads it', async () => {
    const user = userEvent.setup();
    const router = visit('/device');
    expect(
      await screen.findByText('Type the code your terminal shows after ostrom login.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Code from the terminal' })).toBeInTheDocument();
    const read = screen.getByRole('button', { name: 'Continue' });
    expect(read).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Code shown by the terminal' }), 'kprt-zxcv{Enter}');
    expect(await screen.findByText('ostrom CLI on ops-box')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ code: DEMO_ADMIN_DEVICE_CODE });
  });

  it('asks someone signed out to sign in, and comes back to this code after', async () => {
    db.signedIn = false;
    open(DEMO_DEVICE_CODE);
    expect(await screen.findByText('Sign in to answer')).toBeInTheDocument();
    expect(within(await main()).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/signin?redirect=%2Fdevice%3Fcode%3D${DEMO_DEVICE_CODE}`,
    );
    expect(screen.queryByRole('button', { name: 'Sign in this terminal' })).toBeNull();
  });

  it('shows the shape of the page while the login is read', async () => {
    server.use(http.get('*/api/v1/auth/device', async () => delay('infinite')));
    open(DEMO_DEVICE_CODE);
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says when the network kept the login from being read', async () => {
    server.use(http.get('*/api/v1/auth/device', () => HttpResponse.error()));
    open(DEMO_DEVICE_CODE);
    const said = await within(await main()).findByRole('alert');
    expect(said).toHaveTextContent('Offline');
    expect(said).toHaveTextContent('The server could not be reached.');
  });
});
