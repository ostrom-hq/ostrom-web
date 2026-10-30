import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { type ResolvedTheme, type ThemePreference, useThemeStore } from '@/shared/theme/themeStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference, system: ResolvedTheme): ResolvedTheme {
  return preference === 'system' ? system : preference;
}

export interface ThemeViewModel {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly toggle: () => void;
}

/** ViewModel of the theme switch: the resolved theme and a toggle that pins the opposite one. */
export function useTheme(): ThemeViewModel {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme);
  const resolved = resolveTheme(preference, system);
  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setPreference]);
  return { preference, resolved, toggle };
}

/** Mirrors the preference on <html data-theme>; tokens.css follows the system when it is absent. */
export function useApplyTheme(): void {
  const preference = useThemeStore((state) => state.preference);
  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = preference;
    }
  }, [preference]);
}
