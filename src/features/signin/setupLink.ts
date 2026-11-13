// SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand';

interface SetupLinkStore {
  readonly token: string | undefined;
  readonly hold: (token: string) => void;
  /** Forgets the token: once the server took it, or said it is dead. */
  readonly drop: () => void;
}

/**
 * The secret of the instance's setup link (`/setup#token=osb_…`) between the address bar, wiped at once, and the
 * screen that presents it. Memory only: the server keeps what it grants in a cookie, the console keeps nothing.
 */
export const useSetupLinkStore = create<SetupLinkStore>()((set) => ({
  token: undefined,
  hold: (token) => {
    set({ token });
  },
  drop: () => {
    set({ token: undefined });
  },
}));
