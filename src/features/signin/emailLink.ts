// SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand';
import { type SafeStorage, safeLocalStorage } from '@/shared/lib/safeStorage';

interface EmailLinkStore {
  readonly token: string | undefined;
  readonly hold: (token: string) => void;
  /** Gives the token once: a link signs in a single time, even when a screen mounts twice. */
  readonly take: () => string | undefined;
  /** Hands the token to `send` once and forgets it; nothing when there is none (already spent or dropped). */
  readonly spend: (send: (token: string) => void) => void;
}

/** The e-mailed token between the address bar, wiped at once, and the screen that spends it. Memory only. */
export const useEmailLinkStore = create<EmailLinkStore>()((set, get) => ({
  token: undefined,
  hold: (token) => {
    set({ token });
  },
  take: () => {
    const { token } = get();
    set({ token: undefined });
    return token;
  },
  spend: (send) => {
    const token = get().take();
    if (token !== undefined) send(token);
  },
}));

/** When this browser last asked for a sign-in e-mail: a time, never a token (any tab of the browser reads it). */
export const EMAIL_ASKED_KEY = 'ostrom.signin.emailAskedAt';

/** How long a sign-in link works on the server (`MAGIC_LINK_LIFETIME`, 15 minutes). */
export const EMAIL_LINK_LIFETIME_MS = 15 * 60_000;

/**
 * Whether this browser asked for the link it opens. A browser that asked for a sign-in e-mail within the link's life
 * expects one, even with someone signed in (a sign-in again before a yes): it is spent at once. Any other browser
 * signed in is asked first, since a page of another site can open a link of its own account here.
 */
export const emailAsked = {
  mark: (now: number, storage: SafeStorage = safeLocalStorage): void => {
    storage.setItem(EMAIL_ASKED_KEY, String(now));
  },
  recent: (now: number, storage: SafeStorage = safeLocalStorage): boolean => {
    const at = Number(storage.getItem(EMAIL_ASKED_KEY) ?? Number.NaN);
    return Number.isFinite(at) && at <= now && now - at <= EMAIL_LINK_LIFETIME_MS;
  },
  clear: (storage: SafeStorage = safeLocalStorage): void => {
    storage.removeItem(EMAIL_ASKED_KEY);
  },
};
