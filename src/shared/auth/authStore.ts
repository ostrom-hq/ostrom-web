import { z } from 'zod';
import { create } from 'zustand';
import { type SafeStorage, safeLocalStorage, safeSessionStorage } from '@/shared/lib/safeStorage';

/**
 * Where older consoles kept the bearer token (web#3), readable by any script on the page (audit S2-08).
 * Nothing is written there any more: the keys are only listed so the load below erases what was left.
 */
export const LEGACY_TOKEN_STORAGE_KEYS: readonly string[] = ['ostrom.token'];

/** Erases every token an older console left in web storage. */
export function eraseLegacyTokens(storages: readonly SafeStorage[]): void {
  for (const storage of storages) {
    for (const key of LEGACY_TOKEN_STORAGE_KEYS) storage.removeItem(key);
  }
}

// On load, before anything reads the session: a token that sat in localStorage is gone, never reused.
eraseLegacyTokens([safeLocalStorage, safeSessionStorage]);

/** An approver's link token as the server hands it out (`opk_…`), before it is exchanged for the cookie. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_.-]{8,512}$/);

/** What opening a sign-in link did: held for its exchange, or not a token at all. */
export type SignInOutcome = 'held' | 'invalid';

/**
 * The session is the server's `HttpOnly` cookie (`__Host-ostrom_session`, audit S2-08), sent with every call
 * (`credentials: 'include'`, shared/api/apiClient.ts): no script reads it and the console keeps no token of its own.
 * What lives here is a sign-in link between the address bar, wiped at once, and its exchange for that cookie
 * (`POST /auth/link`), plus a count of the times the account in the cookie may have changed.
 */
export interface AuthState {
  /** A link's token waiting for its exchange; in memory only, never in web storage or an address. */
  readonly link: string | undefined;
  /** A sign-in link that was not a token: said once, until dismissed. */
  readonly notice: 'invalid' | undefined;
  /** Goes up at each sign-in or sign-out: everything read as the previous account is dropped. */
  readonly generation: number;
  /** Holds a link's token that passes the schema; says so otherwise. */
  readonly offer: (token: string) => SignInOutcome;
  readonly dismiss: () => void;
  /** The session in the cookie ended at the last change (a sign-out), rather than became another account's. */
  readonly signedOut: boolean;
  /** The cookie now holds another account, or none: the cached reads are someone else's. */
  readonly changed: () => void;
  /** The session ended here (a sign-out): as `changed`, and what waited for this person goes too (audit B8). */
  readonly ended: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  link: undefined,
  notice: undefined,
  generation: 0,
  signedOut: false,
  offer: (token) => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) {
      set({ notice: 'invalid', link: undefined });
      return 'invalid';
    }
    set({ link: parsed.data, notice: undefined });
    return 'held';
  },
  dismiss: () => {
    set({ link: undefined, notice: undefined });
  },
  changed: () => {
    set({ link: undefined, notice: undefined, signedOut: false, generation: get().generation + 1 });
  },
  ended: () => {
    set({ link: undefined, notice: undefined, signedOut: true, generation: get().generation + 1 });
  },
}));
