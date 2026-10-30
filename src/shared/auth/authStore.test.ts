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
  useAuthStore.setState({ link: undefined, notice: undefined, generation: 0 });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useAuthStore', () => {
  it('holds a link in memory only, never in web storage nor in the address (S2-08)', () => {
    expect(useAuthStore.getState().offer(TOKEN)).toBe('held');
    expect(useAuthStore.getState().link).toBe(TOKEN);
    expect(storedAnywhere(TOKEN)).toBe(false);
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('says a link was not a token, keeps nothing, until dismissed', () => {
    expect(useAuthStore.getState().offer('bad token')).toBe('invalid');
    expect(useAuthStore.getState().offer('opk_<script>alert(1)</script>')).toBe('invalid');
    expect(useAuthStore.getState().link).toBeUndefined();
    expect(useAuthStore.getState().notice).toBe('invalid');
    useAuthStore.getState().dismiss();
    expect(useAuthStore.getState().notice).toBeUndefined();
  });

  it('drops a held link when dismissed, and counts each change of account', () => {
    useAuthStore.getState().offer(TOKEN);
    useAuthStore.getState().dismiss();
    expect(useAuthStore.getState().link).toBeUndefined();
    useAuthStore.getState().offer(TOKEN);
    useAuthStore.getState().changed();
    expect(useAuthStore.getState()).toMatchObject({ link: undefined, generation: 1 });
  });
});

describe('on load', () => {
  it('erases a token an older console left in web storage (S2-08)', async () => {
    window.localStorage.setItem(LEGACY_KEY, TOKEN);
    window.sessionStorage.setItem(LEGACY_KEY, TOKEN);
    vi.resetModules();
    const fresh = await import('@/shared/auth/authStore');
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(fresh.useAuthStore.getState().link).toBeUndefined();
  });
});
