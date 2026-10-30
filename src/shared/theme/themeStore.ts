import { z } from 'zod';
import { create } from 'zustand';

/** What the person chose; `system` follows the operating system. */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'ostrom.theme';

/** localStorage is a trust boundary: anything that is not a known preference falls back to `system`. */
export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  const parsed = themePreferenceSchema.safeParse(storage.getItem(THEME_STORAGE_KEY));
  return parsed.success ? parsed.data : 'system';
}

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  preference: readThemePreference(window.localStorage),
  setPreference: (preference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    set({ preference });
  },
}));
