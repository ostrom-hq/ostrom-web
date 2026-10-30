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
  /** True when the person asked for the banner again: it then takes the focus. */
  readonly reopened: boolean;
  /** Records the choice; Accept and Refuse are equal choices. */
  readonly decide: (analytics: boolean) => void;
  /**
   * Withdraws the stored choice and shows the banner again (the footer link): a yes is withdrawn as easily as it
   * was given, and stays withdrawn after a reload until the person chooses again.
   */
  readonly reopen: () => void;
  /** Reads the stored choice again: a choice made in another tab, a choice that expired while the tab was open. */
  readonly sync: () => void;
}

export function createConsentStore(
  storage: SafeStorage,
  now: () => number,
): UseBoundStore<StoreApi<ConsentState>> {
  return create<ConsentState>()((set) => ({
    status: readConsent(storage, now()),
    reopened: false,
    decide: (analytics) => {
      storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics, at: now() }));
      set({ status: analytics ? 'granted' : 'denied', reopened: false });
    },
    reopen: () => {
      storage.removeItem(CONSENT_STORAGE_KEY);
      set({ status: 'unknown', reopened: true });
    },
    sync: () => {
      set({ status: readConsent(storage, now()) });
    },
  }));
}

export const useConsentStore = createConsentStore(safeLocalStorage, () => Date.now());
