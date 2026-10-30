import { useAuthStore } from '@/shared/auth/authStore';

const TOKEN = 'opk_abcdef123456';
/** The key the first console kept its bearer token under (web#3), readable by any script on the page. */
const LEGACY_KEY = 'ostrom.token';

function storedAnywhere(value: string): boolean {
  return [window.localStorage, window.sessionStorage].some((storage) =>
    Object.keys(storage).some((key) => storage.getItem(key)?.includes(value) === true),
  );
}

beforeEach(() => {
  useAuthStore.getState().signOut();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useAuthStore', () => {
  it('signs in with a valid token and keeps it', () => {
    expect(useAuthStore.getState().signIn(TOKEN)).toBe(true);
    expect(useAuthStore.getState().token).toBe(TOKEN);
  });

  it('keeps the token in memory only, never in web storage nor in the address (S2-08)', () => {
    useAuthStore.getState().signIn(TOKEN);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(storedAnywhere(TOKEN)).toBe(false);
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('refuses a malformed token and keeps the previous one', () => {
    useAuthStore.getState().signIn(TOKEN);
    expect(useAuthStore.getState().signIn('bad token')).toBe(false);
    expect(useAuthStore.getState().signIn('opk_<script>alert(1)</script>')).toBe(false);
    expect(useAuthStore.getState().token).toBe(TOKEN);
  });

  it('signs out', () => {
    useAuthStore.getState().signIn(TOKEN);
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState().token).toBeUndefined();
  });
});

describe('on load', () => {
  it('erases a token an older console left in web storage, without signing in (S2-08)', async () => {
    window.localStorage.setItem(LEGACY_KEY, TOKEN);
    window.sessionStorage.setItem(LEGACY_KEY, TOKEN);
    vi.resetModules();
    const fresh = await import('@/shared/auth/authStore');
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(fresh.useAuthStore.getState().token).toBeUndefined();
  });
});
