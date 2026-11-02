// SPDX-License-Identifier: AGPL-3.0-only
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

  it('ticks every second while running, and stops when it no longer runs', () => {
    vi.setSystemTime(Date.parse('2026-11-02T20:00:00Z'));
    const { result, rerender, unmount } = renderHook(({ running }) => useClock(running), {
      initialProps: { running: true },
    });
    expect(result.current).toBe(Date.parse('2026-11-02T20:00:00Z'));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(Date.parse('2026-11-02T20:00:01Z'));
    rerender({ running: false });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(Date.parse('2026-11-02T20:00:01Z'));
    unmount();
  });
});
