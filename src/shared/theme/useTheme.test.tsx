import { act, renderHook } from '@testing-library/react';
import { useThemeStore } from '@/shared/theme/themeStore';
import { useApplyTheme, useTheme } from '@/shared/theme/useTheme';

type Listener = () => void;

function mockSystemTheme(dark: boolean): {
  readonly flip: (next: boolean) => void;
  readonly listeners: Set<Listener>;
} {
  let matches = dark;
  const listeners = new Set<Listener>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string): MediaQueryList =>
      ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
        removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  return {
    listeners,
    flip: (next) => {
      matches = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}

describe('useTheme', () => {
  it('follows the system theme while the preference is system', () => {
    const system = mockSystemTheme(true);
    useThemeStore.setState({ preference: 'system' });
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('dark');

    act(() => {
      system.flip(false);
    });
    expect(result.current.resolved).toBe('light');

    unmount();
    expect(system.listeners.size).toBe(0);
  });

  it('toggles to the opposite of what is shown', () => {
    mockSystemTheme(true);
    useThemeStore.setState({ preference: 'system' });
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    expect(useThemeStore.getState().preference).toBe('light');
  });
});

describe('useApplyTheme', () => {
  it('writes a pinned theme on <html> and removes it for system', () => {
    useThemeStore.setState({ preference: 'dark' });
    renderHook(() => {
      useApplyTheme();
    });
    expect(document.documentElement.dataset['theme']).toBe('dark');

    act(() => {
      useThemeStore.setState({ preference: 'system' });
    });
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
