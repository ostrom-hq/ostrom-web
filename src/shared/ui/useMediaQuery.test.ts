// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '@/shared/ui/useMediaQuery';

const QUERY = '(max-width: 640px)';

/** A matchMedia whose answer for QUERY the test sets, telling its listeners. */
function fakeMedia(phone: boolean): { set: (next: boolean) => void; listeners: Set<() => void> } {
  let matches = phone;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === QUERY && matches;
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

describe('useMediaQuery', () => {
  it('says the query matches, follows the screen as it changes, and stops listening once unmounted', () => {
    const media = fakeMedia(true);
    const { result, unmount } = renderHook(() => useMediaQuery(QUERY));
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

  it('says when the query does not match', () => {
    fakeMedia(false);
    const { result } = renderHook(() => useMediaQuery(QUERY));
    expect(result.current).toBe(false);
  });
});
