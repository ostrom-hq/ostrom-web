// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useNow } from '@/shared/lib/useNow';

describe('useNow', () => {
  it('ticks every 15 s while someone listens, and stops after', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T08:00:00.000Z'));
    const first = renderHook(() => useNow());
    const second = renderHook(() => useNow());

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(first.result.current.toISOString()).toBe('2026-10-30T08:00:15.000Z');
    expect(second.result.current).toBe(first.result.current);

    first.unmount();
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
