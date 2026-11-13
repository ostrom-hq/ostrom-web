// SPDX-License-Identifier: Apache-2.0
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
    const initialProps: { ids: readonly string[] | undefined } = { ids: undefined };
    const { result, rerender } = renderHook(({ ids }) => useArrivals(ids), { initialProps });
    rerender({ ids: ['a'] });
    rerender({ ids: ['a', 'b'] });
    expect([...result.current]).toEqual(['b']);
  });

  it('reads the same list once, however many screens show it', () => {
    const ids = ['a'];
    const first = renderHook(() => useArrivals(ids));
    const second = renderHook(() => useArrivals(ids));
    expect(second.result.current).toBe(first.result.current);
    expect(second.result.current.size).toBe(0);
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
    useAuthStore.getState().changed();
    const after = renderHook(() => useArrivals(['a', 'b', 'c']));
    expect(after.result.current.size).toBe(0);
  });
});
