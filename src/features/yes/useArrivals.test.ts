// SPDX-License-Identifier: AGPL-3.0-only
import { renderHook } from '@testing-library/react';
import { useAuthStore } from '@/shared/auth/authStore';
import { NO_ARRIVALS, nextArrivals, resetArrivals, useArrivals } from './useArrivals';

afterEach(() => {
  resetArrivals();
});

describe('nextArrivals', () => {
  it('marks nothing on the first load', () => {
    expect(nextArrivals(NO_ARRIVALS, ['a', 'b']).fresh.size).toBe(0);
  });

  it('marks ids that appear later, and keeps them marked', () => {
    const first = nextArrivals(NO_ARRIVALS, ['a']);
    const second = nextArrivals(first, ['a', 'b']);
    const third = nextArrivals(second, ['b']);
    expect([...second.fresh]).toEqual(['b']);
    expect(third.fresh).toBe(second.fresh);
  });

  it('waits while there is no data', () => {
    const state = nextArrivals(NO_ARRIVALS, undefined);
    expect(state.known).toBeUndefined();
  });
});

describe('useArrivals', () => {
  it('follows the ids it is given', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] | undefined }) => useArrivals(ids),
      {
        initialProps: { ids: undefined },
      },
    );
    rerender({ ids: ['a'] });
    rerender({ ids: ['a', 'b'] });
    expect([...result.current]).toEqual(['b']);
  });

  it('keeps what it saw when the screen unmounts, and marks what came in meanwhile', () => {
    const first = renderHook(() => useArrivals(['a']));
    first.unmount();
    const back = renderHook(() => useArrivals(['a', 'c']));
    expect([...back.result.current]).toEqual(['c']);
  });

  it('forgets everything when the account changes', () => {
    renderHook(() => useArrivals(['a'])).unmount();
    renderHook(() => useArrivals(['a', 'b'])).unmount();
    useAuthStore.getState().signIn('opk_other_12345678');
    const after = renderHook(() => useArrivals(['a', 'b', 'c']));
    expect(after.result.current.size).toBe(0);
    useAuthStore.getState().signOut();
  });
});
