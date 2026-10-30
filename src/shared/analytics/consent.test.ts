import {
  CONSENT_MAX_AGE_MS,
  CONSENT_STORAGE_KEY,
  createConsentStore,
  readConsent,
} from '@/shared/analytics/consent';
import { createSafeStorage } from '@/shared/lib/safeStorage';

function memoryStorage(values: Record<string, string> = {}) {
  const map = new Map(Object.entries(values));
  return createSafeStorage(
    () =>
      ({
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
        removeItem: (key: string) => {
          map.delete(key);
        },
      }) as Partial<Storage> as Storage,
  );
}

const NOW = 1_800_000_000_000;

describe('readConsent', () => {
  it('reads a recent choice', () => {
    expect(
      readConsent(
        memoryStorage({ [CONSENT_STORAGE_KEY]: JSON.stringify({ analytics: true, at: NOW }) }),
        NOW,
      ),
    ).toBe('granted');
    expect(
      readConsent(
        memoryStorage({ [CONSENT_STORAGE_KEY]: JSON.stringify({ analytics: false, at: NOW - 1 }) }),
        NOW,
      ),
    ).toBe('denied');
  });

  it('asks again when nothing, garbage, an expired or a future choice is stored', () => {
    const stored = (value: string) => memoryStorage({ [CONSENT_STORAGE_KEY]: value });
    expect(readConsent(memoryStorage(), NOW)).toBe('unknown');
    expect(readConsent(stored('{not json'), NOW)).toBe('unknown');
    expect(readConsent(stored(JSON.stringify({ analytics: 'yes', at: NOW })), NOW)).toBe('unknown');
    expect(
      readConsent(stored(JSON.stringify({ analytics: true, at: NOW - CONSENT_MAX_AGE_MS - 1 })), NOW),
    ).toBe('unknown');
    expect(readConsent(stored(JSON.stringify({ analytics: true, at: NOW + 1 })), NOW)).toBe('unknown');
  });
});

describe('createConsentStore', () => {
  it('stores the choice with its date, and reopening shows the banner again', () => {
    const storage = memoryStorage();
    const store = createConsentStore(storage, () => NOW);
    expect(store.getState().status).toBe('unknown');

    store.getState().decide(true);
    expect(store.getState()).toMatchObject({ status: 'granted', decidedAt: NOW });
    expect(storage.getItem(CONSENT_STORAGE_KEY)).toBe(JSON.stringify({ analytics: true, at: NOW }));

    store.getState().reopen();
    expect(store.getState()).toMatchObject({ status: 'unknown', reopened: true });
    expect(storage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(createConsentStore(storage, () => NOW).getState().status).toBe('unknown');

    store.getState().decide(false);
    expect(store.getState().reopened).toBe(false);
    expect(store.getState().status).toBe('denied');
    expect(createConsentStore(storage, () => NOW).getState().status).toBe('denied');
  });

  it('sync reads a choice made in another tab, and one that expired', () => {
    const storage = memoryStorage();
    let now = NOW;
    const store = createConsentStore(storage, () => now);
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, at: NOW }));
    store.getState().sync();
    expect(store.getState().status).toBe('granted');

    now = NOW + CONSENT_MAX_AGE_MS + 1;
    store.getState().sync();
    expect(store.getState().status).toBe('unknown');
  });

  it('a choice holds for the session when storage is blocked', () => {
    const blocked = createSafeStorage(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const store = createConsentStore(blocked, () => NOW);
    store.getState().decide(true);

    expect(store.getState().current()).toBe('granted');
  });

  it('a choice that expires while the tab is open is dropped, and the banner shows again', () => {
    let now = NOW;
    const store = createConsentStore(memoryStorage(), () => now);
    expect(store.getState().current()).toBe('unknown');
    store.getState().decide(true);

    now = NOW + CONSENT_MAX_AGE_MS;
    expect(store.getState().current()).toBe('granted');
    now = NOW + CONSENT_MAX_AGE_MS + 1;
    expect(store.getState().current()).toBe('unknown');
    expect(store.getState()).toMatchObject({ status: 'unknown', decidedAt: null });
  });

  it('starts from a stored choice with its date', () => {
    const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: JSON.stringify({ analytics: false, at: NOW - 5 }) });
    expect(createConsentStore(storage, () => NOW).getState()).toMatchObject({ status: 'denied', decidedAt: NOW - 5 });
  });
});
