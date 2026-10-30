import { z } from 'zod';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { type SafeStorage, safeLocalStorage } from '@/shared/lib/safeStorage';

/** `unknown` until the person chooses: nothing is measured and the banner is shown. */
export type ConsentStatus = 'unknown' | 'granted' | 'denied';

/** The choice itself is stored first-party (strictly necessary, CNIL); PostHog stores nothing before a yes. */
export const CONSENT_STORAGE_KEY = 'ostrom.consent';

/** A choice is asked again after about six months (CNIL recommendation). */
export const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

const storedConsentSchema = z.object({ analytics: z.boolean(), at: z.number() });

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Storage is a trust boundary: anything unreadable, expired or from the future is "not asked yet". */
export function readConsent(storage: Pick<SafeStorage, 'getItem'>, now: number): ConsentStatus {
  const raw = storage.getItem(CONSENT_STORAGE_KEY);
  if (raw === null) return 'unknown';
  const parsed = storedConsentSchema.safeParse(parseJson(raw));
  if (!parsed.success) return 'unknown';
  const age = now - parsed.data.at;
  if (age < 0 || age > CONSENT_MAX_AGE_MS) return 'unknown';
  return parsed.data.analytics ? 'granted' : 'denied';
}

export interface ConsentState {
  readonly status: ConsentStatus;
  /** Records the choice; Accept and Refuse are equal choices. */
  readonly decide: (analytics: boolean) => void;
  /** Shows the banner again (the footer link), so that a yes can be withdrawn as easily as it was given. */
  readonly reopen: () => void;
}

export function createConsentStore(
  storage: SafeStorage,
  now: () => number,
): UseBoundStore<StoreApi<ConsentState>> {
  return create<ConsentState>()((set) => ({
    status: readConsent(storage, now()),
    decide: (analytics) => {
      storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics, at: now() }));
      set({ status: analytics ? 'granted' : 'denied' });
    },
    reopen: () => {
      set({ status: 'unknown' });
    },
  }));
}

export const useConsentStore = createConsentStore(safeLocalStorage, () => Date.now());
