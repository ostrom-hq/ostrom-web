// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useDebounced } from '@/shared/lib/useDebounced';

describe('useDebounced', () => {
  it('keeps the value it settled on until the new one has stood still for the delay', () => {
    vi.useFakeTimers();
    const hook = renderHook(({ value }) => useDebounced(value, 250), { initialProps: { value: '' } });
    expect(hook.result.current).toBe('');
    hook.rerender({ value: 'd' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    hook.rerender({ value: 'de' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 400 ms of typing, but never 250 ms of quiet: still the first value.
    expect(hook.result.current).toBe('');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(hook.result.current).toBe('de');
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
