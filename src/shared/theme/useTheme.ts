import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import {
  nextThemePreference,
  type ResolvedTheme,
  type ThemePreference,
  useThemeStore,
} from '@/shared/theme/themeStore';

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
  /** The preference the switch moves to next. */
  readonly next: ThemePreference;
  readonly cycle: () => void;
}

/** ViewModel of the theme switch: system → light → dark → system. */
export function useTheme(): ThemeViewModel {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme);
  const next = nextThemePreference(preference);
  const cycle = useCallback(() => {
    setPreference(next);
  }, [next, setPreference]);
  return { preference, resolved: resolveTheme(preference, system), next, cycle };
}

/** Mirrors the preference on <html data-theme> before paint; tokens.css follows the system when it is absent. */
export function useApplyTheme(): void {
  const preference = useThemeStore((state) => state.preference);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = preference;
    }
  }, [preference]);
}
