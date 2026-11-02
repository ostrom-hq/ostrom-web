// SPDX-License-Identifier: AGPL-3.0-only
import { act, screen } from '@testing-library/react';
import { ACCOUNT_CHANGED_KEY } from '@/app/App';
import { INVITE_TOKEN_KEY, inviteToken } from '@/features/onboarding';
import { useAuthStore } from '@/shared/auth/authStore';
import { setupMockApp, visit } from '@/test/mockApp';

const { db } = setupMockApp();

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.removeItem(ACCOUNT_CHANGED_KEY);
});

describe('the account across tabs (audit B2)', () => {
  it('tells the other tabs when the account changes here', async () => {
    visit('/yes');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    act(() => {
      useAuthStore.getState().changed();
    });
    expect(window.localStorage.getItem(ACCOUNT_CHANGED_KEY)).not.toBeNull();
  });

  it('reads everything again when another tab signed out, never showing the previous account', async () => {
    visit('/yes');
    expect(await screen.findByText(/Approving as/)).toBeInTheDocument();
    db.signedIn = false;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_CHANGED_KEY, newValue: '1' }));
    });
    await vi.waitFor(() => {
      expect(screen.queryByText(/Approving as/)).toBeNull();
    });
  });

  it('ignores the other keys another tab writes', async () => {
    visit('/yes');
    expect(await screen.findByText(/Approving as/)).toBeInTheDocument();
    db.signedIn = false;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'ostrom.theme', newValue: 'dark' }));
    });
    expect(screen.getByText(/Approving as/)).toBeInTheDocument();
  });
});

describe('an invitation waiting in this tab (audit B8)', () => {
  it('goes with a sign-out, since nobody is left to join', async () => {
    visit('/yes');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    inviteToken.hold('inv_waiting');
    act(() => {
      useAuthStore.getState().ended();
    });
    expect(window.sessionStorage.getItem(INVITE_TOKEN_KEY)).toBeNull();
  });

  it('stays through a sign-in, which is what it waits for', async () => {
    visit('/yes');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    inviteToken.hold('inv_waiting');
    act(() => {
      useAuthStore.getState().changed();
    });
    expect(inviteToken.read()).toBe('inv_waiting');
  });
});
