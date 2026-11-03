// SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand';

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
