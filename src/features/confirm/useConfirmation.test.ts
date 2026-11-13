// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react';
import { stillPending, useClock } from './useConfirmation';

describe('stillPending', () => {
  it('reads again until the confirmation is answered', () => {
    expect([
      stillPending(undefined),
      stillPending(null),
      stillPending({}),
      stillPending({ status: 'pending' }),
    ]).toEqual([true, true, true, true]);
    expect([stillPending({ status: 'confirmed' }), stillPending({ status: 'expired' })]).toEqual([
      false,
      false,
    ]);
  });
});

describe('useClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks every second, and stops once unmounted', () => {
    vi.setSystemTime(Date.parse('2026-11-02T20:00:00Z'));
    const { result, unmount } = renderHook(() => useClock());
    expect(result.current).toBe(Date.parse('2026-11-02T20:00:00Z'));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(Date.parse('2026-11-02T20:00:01Z'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
