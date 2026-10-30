import { z } from 'zod';
import { create } from 'zustand';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

/** What the person chose; `system` follows the operating system. */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

/** Also read by public/theme.js, which index.html loads to apply a pinned theme before the first paint. */
export const THEME_STORAGE_KEY = 'ostrom.theme';

/** Storage is a trust boundary: anything that is not a known preference falls back to `system`. */
export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  const parsed = themePreferenceSchema.safeParse(storage.getItem(THEME_STORAGE_KEY));
  return parsed.success ? parsed.data : 'system';
}

/** The order of the theme switch: follow the system, then pin light, then pin dark. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  switch (current) {
    case 'system':
      return 'light';
    case 'light':
      return 'dark';
    case 'dark':
      return 'system';
  }
}

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  preference: readThemePreference(safeLocalStorage),
  setPreference: (preference) => {
    safeLocalStorage.setItem(THEME_STORAGE_KEY, preference);
    set({ preference });
  },
}));
