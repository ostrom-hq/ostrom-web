// SPDX-License-Identifier: Apache-2.0
import { create } from 'zustand';

/** How the server answered the setup link's token: it took it (a cookie now lets the sign-in create the account), or it is dead. */
export type SetupOutcome = 'granted' | 'expired';

interface SetupLinkStore {
  readonly token: string | undefined;
  readonly outcome: SetupOutcome | undefined;
  /** A setup link was opened: its token waits to be presented. */
  readonly hold: (token: string) => void;
  /** The server took the token: forgotten, but remembered as granted, so a screen mounted again does not ask for a link already spent. */
  readonly grant: () => void;
  /** The server said the token is used up or out of date: forgotten, and remembered as such. */
  readonly expire: () => void;
}

/**
 * The secret of the instance's setup link (`/setup#token=osb_…`) between the address bar, wiped at once, and the
 * screen that presents it, and what came of it. Memory only: the server keeps what it grants in a cookie, the
 * console keeps no secret once it is presented. A token that failed for a reason that may pass stays, for a new try
 * (the screen left and opened again in this tab).
 */
export const useSetupLinkStore = create<SetupLinkStore>()((set) => ({
  token: undefined,
  outcome: undefined,
  hold: (token) => {
    set({ token, outcome: undefined });
  },
  grant: () => {
    set({ token: undefined, outcome: 'granted' });
  },
  expire: () => {
    set({ token: undefined, outcome: 'expired' });
  },
}));
