// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod/mini';
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

/** A choice and when it was made; `at` is null when nothing is decided. */
export interface Choice {
  readonly status: ConsentStatus;
  readonly at: number | null;
}

const NOT_ASKED: Choice = { status: 'unknown', at: null };

/** Storage is a trust boundary: anything unreadable, expired or from the future is "not asked yet". */
export function readChoice(storage: Pick<SafeStorage, 'getItem'>, now: number): Choice {
  const raw = storage.getItem(CONSENT_STORAGE_KEY);
  if (raw === null) return NOT_ASKED;
  const parsed = storedConsentSchema.safeParse(parseJson(raw));
  if (!parsed.success) return NOT_ASKED;
  const { analytics, at } = parsed.data;
  if (isExpired(at, now)) return NOT_ASKED;
  return { status: analytics ? 'granted' : 'denied', at };
}

/** The stored choice, or "not asked yet". */
export function readConsent(storage: Pick<SafeStorage, 'getItem'>, now: number): ConsentStatus {
  return readChoice(storage, now).status;
}

function isExpired(at: number, now: number): boolean {
  const age = now - at;
  return age < 0 || age > CONSENT_MAX_AGE_MS;
}

export interface ConsentState {
  readonly status: ConsentStatus;
  /** When the choice was made; null when not asked yet. */
  readonly decidedAt: number | null;
  /** True when the person asked for the banner again: it then takes the focus. */
  readonly reopened: boolean;
  /** Records the choice; Accept and Refuse are equal choices. */
  readonly decide: (analytics: boolean) => void;
  /**
   * Withdraws the stored choice and shows the banner again (the footer link): a yes is withdrawn as easily as it
   * was given, and stays withdrawn after a reload until the person chooses again.
   */
  readonly reopen: () => void;
  /** Reads the stored choice again: a choice made in another tab. */
  readonly sync: () => void;
  /**
   * The choice in force now: one that expired while the tab was open is dropped here, and the banner shows again.
   * The choice lives in memory too, so that it holds for the session when storage is blocked.
   */
  readonly current: () => ConsentStatus;
}

export function createConsentStore(
  storage: SafeStorage,
  now: () => number,
): UseBoundStore<StoreApi<ConsentState>> {
  const initial = readChoice(storage, now());
  return create<ConsentState>()((set, get) => ({
    status: initial.status,
    decidedAt: initial.at,
    reopened: false,
    decide: (analytics) => {
      const at = now();
      storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics, at }));
      set({ status: analytics ? 'granted' : 'denied', decidedAt: at, reopened: false });
    },
    reopen: () => {
      storage.removeItem(CONSENT_STORAGE_KEY);
      set({ status: 'unknown', decidedAt: null, reopened: true });
    },
    sync: () => {
      const stored = readChoice(storage, now());
      set({ status: stored.status, decidedAt: stored.at });
    },
    current: () => {
      const { status, decidedAt } = get();
      if (decidedAt === null || !isExpired(decidedAt, now())) return status;
      set({ status: 'unknown', decidedAt: null });
      return 'unknown';
    },
  }));
}

export const useConsentStore = createConsentStore(safeLocalStorage, () => Date.now());
