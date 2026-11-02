// SPDX-License-Identifier: AGPL-3.0-only
import { act, screen } from '@testing-library/react';
import { ACCOUNT_CHANGED_KEY } from '@/app/App';
import { useAuthStore } from '@/shared/auth/authStore';
import { sentInOrg, whenSameOrg } from '@/shared/org/sameOrg';
import { setupMockApp, visit } from '@/test/mockApp';
import type * as Yes from '@/features/yes';

const arrivals = vi.hoisted(() => ({ resets: 0 }));
vi.mock('@/features/yes', async (original) => {
  const real = await original<typeof Yes>();
  return {
    ...real,
    resetArrivals: () => {
      arrivals.resets += 1;
      real.resetArrivals();
    },
  };
});

const { db } = setupMockApp();

afterEach(() => {
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

  it('leaves out an answer sent as the account another tab signed out of', async () => {
    visit('/yes');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    const sent = sentInOrg();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_CHANGED_KEY, newValue: '2' }));
    });
    const write = vi.fn();
    whenSameOrg(sent, write);
    expect(write).not.toHaveBeenCalled();
  });

  it('forgets what the previous account saw arrive in the queue', async () => {
    visit('/yes');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    const before = arrivals.resets;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_CHANGED_KEY, newValue: '3' }));
    });
    expect(arrivals.resets).toBe(before + 1);
  });
});
