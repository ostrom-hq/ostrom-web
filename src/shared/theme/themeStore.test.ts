import { readThemePreference, THEME_STORAGE_KEY, useThemeStore } from '@/shared/theme/themeStore';
import { resolveTheme } from '@/shared/theme/useTheme';

function storageWith(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key) => (key === THEME_STORAGE_KEY ? value : null) };
}

describe('readThemePreference', () => {
  it('keeps a known preference', () => {
    expect(readThemePreference(storageWith('dark'))).toBe('dark');
  });

  it('falls back to system when nothing is stored', () => {
    expect(readThemePreference(storageWith(null))).toBe('system');
  });

  it('falls back to system when the stored value is not a preference', () => {
    expect(readThemePreference(storageWith('purple'))).toBe('system');
  });
});

describe('useThemeStore', () => {
  it('persists the chosen preference', () => {
    useThemeStore.getState().setPreference('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(useThemeStore.getState().preference).toBe('light');
  });
});

describe('resolveTheme', () => {
  it('follows the system only for the system preference', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });
});
