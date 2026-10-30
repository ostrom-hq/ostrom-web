// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useEmailLinkStore } from '@/features/signin';
import { DEMO_EMAIL_TOKEN } from '@/mocks/handlers';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server } = setupMockApp();

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
    expect(sent).toBeUndefined();
    await user.type(field, '@acme.dev');
    await user.click(screen.getByRole('button', { name: 'E-mail me a link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('maya@acme.dev');
    expect(sent).toEqual({ email: 'maya@acme.dev' });
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
  it('takes the token from the fragment, wipes it from the address, signs in and opens the page asked', async () => {
    const router = visit(`/auth/email#token=${DEMO_EMAIL_TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Requests' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/yes');
    expect(router.state.location.href).not.toContain(DEMO_EMAIL_TOKEN);
  });

  it('says signing in while the server checks the link', async () => {
    server.use(http.post('*/api/v1/auth/email/verify', async () => delay('infinite')));
    const router = visit('/auth/email#token=ml_slow');
    expect(await screen.findByRole('status')).toHaveTextContent('Signing you in…');
    expect(router.state.location.hash).toBe('');
  });

  it('says why a used link does not sign in, and offers a new one', async () => {
    visit('/auth/email#token=ml_used');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link was already used or has expired.');
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/signin');
  });

  it('says so on a page reached without a link', async () => {
    visit('/auth/email');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link was already used or is incomplete.',
    );
  });
});
