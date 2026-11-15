// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react';
import { PHONE_QUERY, usePhone } from '@/app/usePhone';

/** A matchMedia whose answer for PHONE_QUERY the test sets, telling its listeners. */
function fakeMedia(phone: boolean): { set: (next: boolean) => void; listeners: Set<() => void> } {
  let matches = phone;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === PHONE_QUERY && matches;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener);
        },
      }) as unknown as MediaQueryList,
  );
  return {
    listeners,
    set: (next) => {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('usePhone', () => {
  it('says a phone, follows the screen as it widens and narrows, and stops listening once unmounted', () => {
    const media = fakeMedia(true);
    const { result, unmount } = renderHook(() => usePhone());
    expect(result.current).toBe(true);
    act(() => {
      media.set(false);
    });
    expect(result.current).toBe(false);
    act(() => {
      media.set(true);
    });
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('says a wide screen is not a phone', () => {
    fakeMedia(false);
    const { result } = renderHook(() => usePhone());
    expect(result.current).toBe(false);
  });
});
