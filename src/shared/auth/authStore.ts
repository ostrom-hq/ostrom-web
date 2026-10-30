import { z } from 'zod';
import { create } from 'zustand';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

export const AUTH_STORAGE_KEY = 'ostrom.token';

/** A bearer token as the server hands it out: an approver account (`opk_…`) or a session token. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_.-]{8,512}$/);

export function readStoredToken(storage: Pick<Storage, 'getItem'>): string | undefined {
  const parsed = tokenSchema.safeParse(storage.getItem(AUTH_STORAGE_KEY));
  return parsed.success ? parsed.data : undefined;
}

/** What opening a sign-in link did. */
export type SignInOutcome = 'signed-in' | 'same' | 'invalid' | 'pending';

export interface AuthState {
  readonly token: string | undefined;
  /**
   * A link's token kept in memory (never stored) while the person decides: opening someone else's link must not
   * silently make them approve as that account.
   */
  readonly pending: string | undefined;
  /** A sign-in link that was not a token: said once, until dismissed. */
  readonly notice: 'invalid' | undefined;
  /** A sign-in link: kept at once when nobody is signed in, held for confirmation when someone else is. */
  readonly offer: (token: string) => SignInOutcome;
  readonly acceptPending: () => void;
  readonly dismiss: () => void;
  /** Keeps a token that passes the schema; returns false and keeps nothing otherwise. */
  readonly signIn: (token: string) => boolean;
  readonly signOut: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: readStoredToken(safeLocalStorage),
  pending: undefined,
  notice: undefined,
  signIn: (token) => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return false;
    // A blocked storage keeps the sign-in for this tab only.
    safeLocalStorage.setItem(AUTH_STORAGE_KEY, parsed.data);
    set({ token: parsed.data, pending: undefined, notice: undefined });
    return true;
  },
  signOut: () => {
    safeLocalStorage.removeItem(AUTH_STORAGE_KEY);
    set({ token: undefined, pending: undefined, notice: undefined });
  },
  offer: (token) => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) {
      set({ notice: 'invalid', pending: undefined });
      return 'invalid';
    }
    const current = get().token;
    if (current === parsed.data) return 'same';
    if (current === undefined) {
      get().signIn(parsed.data);
      return 'signed-in';
    }
    set({ pending: parsed.data, notice: undefined });
    return 'pending';
  },
  acceptPending: () => {
    const { pending, signIn } = get();
    if (pending !== undefined) signIn(pending);
  },
  dismiss: () => {
    set({ pending: undefined, notice: undefined });
  },
}));
