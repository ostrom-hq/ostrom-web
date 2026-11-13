// SPDX-License-Identifier: Apache-2.0
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { useEmailLinkStore } from '@/features/signin';
import { DEMO_EMAIL_TOKEN, OTHER_BROWSER_EMAIL_TOKEN } from '@/mocks/handlers';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

afterEach(() => {
  useEmailLinkStore.setState({ token: undefined });
});

describe('the sign-in page', () => {
  it('leaves for GitHub with the page to come back to, and only a page of this site', async () => {
    visit('/signin?redirect=%2Fyes%2Fapr-merge-412');
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/auth/github/start?redirect=%2Fyes%2Fapr-merge-412`,
    );
  });

  it.each([
    [
      'signup_closed',
      'This Ostrom instance is invite-only: ask an owner or an admin of your organization for an invitation.',
    ],
    ['unavailable', 'This sign-in method is not available on this instance.'],
    ['rate_limited', 'Too many attempts.'],
    ['access_denied', 'The sign-in was cancelled at the provider.'],
    ['expired', 'The sign-in took too long and expired.'],
    ['refused', 'The provider refused the sign-in.'],
    ['link_required', 'This account is not linked to this sign-in method yet.'],
    ['identity_taken', 'already linked to another Ostrom account.'],
    ['whatever', 'The sign-in did not work.'],
  ])('says in words why a sign-in was refused (?error=%s)', async (error, words) => {
    visit(`/signin?error=${error}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(words);
  });

  it('takes any address the server redirects a refused sign-in to (/login) to the sign-in page, error kept', async () => {
    const router = visit('/login?error=rate_limited');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
    expect(router.state.location.pathname).toBe('/signin');
    expect(router.state.location.search).toEqual({ error: 'rate_limited' });
  });

  it('says nothing for an error that is not a single text', async () => {
    visit('/signin?error=other&error=again');
    await screen.findByRole('link', { name: 'Continue with GitHub' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says accounts are by invitation when the instance is invite-only, and nothing when it is open', async () => {
    db.signUp = 'invite';
    visit('/signin');
    expect(
      await screen.findByText('Accounts on this Ostrom instance are by invitation.'),
    ).toBeInTheDocument();
  });

  it('says nothing of invitations on an open instance', async () => {
    visit('/signin');
    await screen.findByRole('link', { name: 'Continue with GitHub' });
    expect(screen.queryByText(/by invitation/)).toBeNull();
  });

  it('comes back home when the page to come back to is another site', async () => {
    visit('/signin?redirect=https%3A%2F%2Fevil.example');
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/auth/github/start?redirect=%2F`,
    );
  });

  it('e-mails a link once the address is one, with the page to come back to', async () => {
    const user = userEvent.setup();
    let sent: unknown;
    server.use(
      http.post('*/api/v1/auth/email', async ({ request }) => {
        sent = await request.json();
        await delay(50);
        return new HttpResponse(null, { status: 202 });
      }),
    );
    visit('/signin?redirect=%2Fspend');
    const field = await screen.findByRole('textbox', { name: 'Your e-mail address' });
    const send = screen.getByRole('button', { name: 'E-mail me a link' });
    await user.type(field, 'maya');
    expect(send).toBeDisabled();
    await user.type(field, '@acme.dev{Enter}');
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'If maya@acme.dev may sign in, a link is on its way.',
    );
    expect(sent).toEqual({ email: 'maya@acme.dev', redirect: '/spend' });
  });

  it('sends no page to come back to when none was asked, and ignores an incomplete address', async () => {
    const user = userEvent.setup();
    let sent: unknown;
    server.use(
      http.post('*/api/v1/auth/email', async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );
    visit('/signin');
    const field = await screen.findByRole('textbox', { name: 'Your e-mail address' });
    await user.type(field, 'maya{Enter}');
    // A form submitted another way (a script, an assistive tool) still sends nothing for an incomplete address.
    fireEvent.submit(field);
    expect(sent).toBeUndefined();
    await user.type(field, '@acme.dev');
    await user.click(screen.getByRole('button', { name: 'E-mail me a link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('maya@acme.dev');
    expect(sent).toEqual({ email: 'maya@acme.dev' });
  });

  it('goes back to the form to send to another address', async () => {
    const user = userEvent.setup();
    visit('/signin');
    await user.type(
      await screen.findByRole('textbox', { name: 'Your e-mail address' }),
      'maya@acme.dev{Enter}',
    );
    await user.click(await screen.findByRole('button', { name: 'Use another address' }));
    expect(await screen.findByRole('textbox', { name: 'Your e-mail address' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a page to come back to that is not one string', async () => {
    visit('/signin?redirect=12');
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/auth/github/start?redirect=%2F`,
    );
  });

  it('says why no link was sent', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/email', () =>
        HttpResponse.json(
          { error: { type: 'rate_limited', message: 'Too many links, wait a minute.' } },
          { status: 429 },
        ),
      ),
    );
    visit('/signin');
    await user.type(
      await screen.findByRole('textbox', { name: 'Your e-mail address' }),
      'maya@acme.dev{Enter}',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many links, wait a minute.');
    expect(screen.getByRole('button', { name: 'E-mail me a link' })).toBeEnabled();
  });
});

describe('the e-mailed link', () => {
  /** Nobody signed in on this browser: the link is the way in, spent at once. */
  function signedOut(): void {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ error: { type: 'unauthorized', message: 'nobody' } }, { status: 401 }),
      ),
    );
  }

  /** Counts the links spent, so a test can say none was; the mock still answers each. */
  function spentLinks(): string[] {
    const spent: string[] = [];
    server.use(
      http.post('*/api/v1/auth/email/verify', ({ request }) => {
        spent.push(request.url);
      }),
    );
    return spent;
  }

  it('takes the token from the fragment, wipes it from the address, signs in and opens the page asked', async () => {
    signedOut();
    const router = visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Requests' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/yes');
    expect(router.state.location.href).not.toContain(DEMO_EMAIL_TOKEN);
  });

  it('says the instance is invite-only when the link is good but no account may be created', async () => {
    signedOut();
    server.use(
      http.post('*/api/v1/auth/email/verify', () =>
        HttpResponse.json({ error: { type: 'signup_closed', message: 'closed' } }, { status: 403 }),
      ),
    );
    visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Ostrom instance is invite-only: ask an owner or an admin of your organization for an invitation.',
    );
  });

  it('takes a 204 with no body as nobody signed in, and spends the link at once', async () => {
    server.use(http.get('*/api/v1/auth/me', () => new HttpResponse(null, { status: 204 })));
    const router = visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Requests' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/yes');
  });

  it('never replaces a session without a yes: a link from another site cannot sign this browser in as someone else', async () => {
    const spent = spentLinks();
    const router = visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are signed in as maya on this browser. This link signs it in as the account it was sent to',
    );
    expect(router.state.location.href).not.toContain(DEMO_EMAIL_TOKEN);
    expect(spent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with the link' }));
    expect(await screen.findByRole('heading', { name: 'Requests' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/yes');
    expect(spent).toHaveLength(1);
  });

  it('keeps the question on screen while it reads who is signed in again', async () => {
    const spent = spentLinks();
    visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    await screen.findByRole('button', { name: 'Sign in with the link' });
    let readAgain = false;
    server.use(
      http.get('*/api/v1/auth/me', async () => {
        readAgain = true;
        return delay('infinite');
      }),
    );
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.waitFor(() => {
      expect(readAgain).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Sign in with the link' })).toBeInTheDocument();
    expect(screen.queryByText('Signing you in…')).toBeNull();
    expect(spent).toEqual([]);
  });

  it('drops a link left unanswered with the page: never spent later, when nobody would be asked', async () => {
    const spent = spentLinks();
    const router = visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    await screen.findByRole('button', { name: 'Sign in with the link' });
    await router.navigate({ to: '/yes' });
    expect(useEmailLinkStore.getState().token).toBeUndefined();
    signedOut();
    await router.navigate({ to: '/auth/email' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link was already used or is incomplete.',
    );
    expect(spent).toEqual([]);
  });

  it('keeps the session as it is and drops the link when asked to', async () => {
    const spent = spentLinks();
    const router = visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Stay signed in as now' }));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    // Dropped as the page is left (the route's onLeave), once the next screen's chunk has loaded.
    await vi.waitFor(() => {
      expect(useEmailLinkStore.getState().token).toBeUndefined();
    });
    expect(spent).toEqual([]);
  });

  it('asks before spending the link when it cannot tell whether someone is signed in', async () => {
    const spent = spentLinks();
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );
    visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Someone may already be signed in on this browser.',
    );
    expect(screen.getByRole('button', { name: 'Sign in with the link' })).toBeInTheDocument();
    expect(spent).toEqual([]);
  });

  it('says signing in while it checks who is signed in, then while the server checks the link', async () => {
    signedOut();
    server.use(http.post('*/api/v1/auth/email/verify', async () => delay('infinite')));
    const router = visit('/auth/email#token=ml_slow');
    expect(await screen.findByText('Signing you in…')).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
  });

  it('says why a used link does not sign in, and offers a new one', async () => {
    signedOut();
    visit('/auth/email#token=ml_used');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link was already used or has expired.');
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/signin');
  });

  it('says why a link opened in another browser does not sign in, and offers a new one from this one', async () => {
    signedOut();
    visit(`/auth/email#token=${OTHER_BROWSER_EMAIL_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link was asked for in another browser. For your safety it only signs in the browser that asked for it',
    );
    expect(screen.getByRole('link', { name: 'Ask for a new link here' })).toHaveAttribute('href', '/signin');
  });

  it('says so on a page reached without a link', async () => {
    visit('/auth/email');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link was already used or is incomplete.',
    );
  });
});
