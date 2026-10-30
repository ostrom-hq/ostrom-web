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

export interface AuthState {
  readonly token: string | undefined;
  /** Keeps a token that passes the schema; returns false and keeps nothing otherwise. */
  readonly signIn: (token: string) => boolean;
  readonly signOut: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: readStoredToken(safeLocalStorage),
  signIn: (token) => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return false;
    // A blocked storage keeps the sign-in for this tab only.
    safeLocalStorage.setItem(AUTH_STORAGE_KEY, parsed.data);
    set({ token: parsed.data });
    return true;
  },
  signOut: () => {
    safeLocalStorage.removeItem(AUTH_STORAGE_KEY);
    set({ token: undefined });
  },
}));
