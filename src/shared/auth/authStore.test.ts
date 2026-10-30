import { AUTH_STORAGE_KEY, readStoredToken, useAuthStore } from '@/shared/auth/authStore';

describe('readStoredToken', () => {
  it('keeps a well-formed token', () => {
    expect(readStoredToken({ getItem: () => 'opk_abcdef123456' })).toBe('opk_abcdef123456');
  });

  it('ignores a missing or malformed token', () => {
    expect(readStoredToken({ getItem: () => null })).toBeUndefined();
    expect(readStoredToken({ getItem: () => 'short' })).toBeUndefined();
    expect(readStoredToken({ getItem: () => 'opk_<script>alert(1)</script>' })).toBeUndefined();
  });
});

describe('useAuthStore', () => {
  it('signs in with a valid token and keeps it', () => {
    expect(useAuthStore.getState().signIn('opk_abcdef123456')).toBe(true);
    expect(useAuthStore.getState().token).toBe('opk_abcdef123456');
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBe('opk_abcdef123456');
  });

  it('refuses a malformed token and keeps the previous one', () => {
    useAuthStore.getState().signIn('opk_abcdef123456');
    expect(useAuthStore.getState().signIn('bad token')).toBe(false);
    expect(useAuthStore.getState().token).toBe('opk_abcdef123456');
  });

  it('signs out', () => {
    useAuthStore.getState().signIn('opk_abcdef123456');
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState().token).toBeUndefined();
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
