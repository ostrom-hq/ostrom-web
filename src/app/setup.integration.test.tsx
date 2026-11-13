// SPDX-License-Identifier: Apache-2.0
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useSetupLinkStore } from '@/features/signin';
import { DEMO_SETUP_TOKEN } from '@/mocks/fixtures/organization';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

afterEach(() => {
  useSetupLinkStore.setState({ token: undefined, outcome: undefined });
});

describe('the setup link page', () => {
  it('takes the token from the address, presents it, then offers the sign-in and onboarding after it', async () => {
    db.signedIn = false;
    db.signUp = 'invite';
    const router = visit(`/setup#token=${DEMO_SETUP_TOKEN}`);
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/auth/github/start?redirect=%2F`,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Set up your Ostrom instance' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your e-mail address' })).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.href).not.toContain(DEMO_SETUP_TOKEN);
    expect(db.grants).toEqual([DEMO_SETUP_TOKEN]);
    // Presented once, and forgotten: the secret does not stay in memory.
    expect(useSetupLinkStore.getState().token).toBeUndefined();
  });

  it('says to run bootstrap again when the link is used or has expired', async () => {
    db.signedIn = false;
    db.setupUsed = true;
    visit(`/setup#token=${DEMO_SETUP_TOKEN}`);
    expect(await screen.findByText('This setup link is used or has expired')).toBeInTheDocument();
    expect(screen.getByText(/Run ostrom-server bootstrap again/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue with GitHub' })).toBeNull();
    expect(useSetupLinkStore.getState().token).toBeUndefined();
  });

  it('says when no setup link was opened', async () => {
    visit('/setup');
    expect(await screen.findByText('No setup link here')).toBeInTheDocument();
    expect(db.grants).toEqual([]);
  });

  it('does not take a link already presented for a missing one when the page is opened again', async () => {
    db.signedIn = false;
    const router = visit(`/setup#token=${DEMO_SETUP_TOKEN}`);
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    await router.navigate({ to: '/signin' });
    await router.navigate({ to: '/setup' });
    expect(await screen.findByRole('heading', { name: 'Set up your Ostrom instance' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.queryByText('No setup link here')).toBeNull();
    expect(db.grants).toEqual([DEMO_SETUP_TOKEN]);
  });

  it('keeps a link that failed for a reason that may pass, and presents it again when the page is opened again', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/signup-grant', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { type: 'too_many_attempts', message: 'Slow down.' } },
              { status: 429 },
            )
          : new HttpResponse(null, { status: 204 });
      }),
    );
    const router = visit(`/setup#token=${DEMO_SETUP_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Slow down.');
    await router.navigate({ to: '/signin' });
    await router.navigate({ to: '/setup' });
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('takes a new link opened after an expired one', async () => {
    db.setupUsed = true;
    const router = visit(`/setup#token=${DEMO_SETUP_TOKEN}`);
    expect(await screen.findByText('This setup link is used or has expired')).toBeInTheDocument();
    await router.navigate({ to: '/signin' });
    await router.navigate({ to: '/setup' });
    expect(await screen.findByText('This setup link is used or has expired')).toBeInTheDocument();
  });

  it('keeps the link after a failure that may pass, and presents it again on a click', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/signup-grant', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { type: 'too_many_attempts', message: 'Slow down.' } },
              { status: 429 },
            )
          : new HttpResponse(null, { status: 204 });
      }),
    );
    visit(`/setup#token=${DEMO_SETUP_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Slow down.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
