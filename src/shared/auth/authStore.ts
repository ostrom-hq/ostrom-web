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

/** A bearer token as the server hands it out: an approver account (`opk_…`) or a session token. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_.-]{8,512}$/);

/**
 * The viewer's bearer token, in memory only: never in localStorage, sessionStorage or an address
 * (CONVENTIONS § 16.2). The lasting session is the server's `HttpOnly; Secure; SameSite=Lax` cookie, sent
 * with every API call (`credentials: 'include'`, shared/api/apiClient.ts): a reload relies on it alone.
 */
export interface AuthState {
  readonly token: string | undefined;
  /** Keeps a token that passes the schema, in memory; returns false and keeps nothing otherwise. */
  readonly signIn: (token: string) => boolean;
  readonly signOut: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: undefined,
  signIn: (token) => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return false;
    set({ token: parsed.data });
    return true;
  },
  signOut: () => {
    set({ token: undefined });
  },
}));
