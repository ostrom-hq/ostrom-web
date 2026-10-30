// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { create } from 'zustand';
import { type SafeStorage, safeLocalStorage } from '@/shared/lib/safeStorage';

/** Where the organization the person chose is kept, with whose choice it was: ids, not secrets. */
export const ORG_STORAGE_KEY = 'ostrom.org';
export const ORG_OWNER_STORAGE_KEY = 'ostrom.org.login';

/** An id goes into a request header: visible ASCII only, so a stored value can never break the request. */
export const orgIdSchema = z.string().regex(/^[\x21-\x7E]{1,200}$/);

/** Storage is a trust boundary: anything that is not an id reads as nothing stored. */
export function readStoredId(storage: Pick<SafeStorage, 'getItem'>, key: string): string | undefined {
  const parsed = orgIdSchema.safeParse(storage.getItem(key));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The organization the console acts in, sent as `Ostrom-Org` on every API call (shared/api/apiClient.ts).
 *
 * A person with one organization acts in it without being asked, and nothing is kept past a reload: should they join
 * a second one, they are asked then. A person with several chooses; the choice is kept with their login, so another
 * account in the same browser is asked afresh.
 */
export interface OrgState {
  readonly current: string | undefined;
  /** Whose choice `current` is: kept with it, so another account is never sent someone else's. */
  readonly owner: string | undefined;
  /** The organization must be chosen: several to choose from, or the server refused a call for want of one. */
  readonly asked: boolean;
  readonly picking: boolean;
  /** The person closed the picker: being asked again does not reopen it, the top bar does. */
  readonly dismissed: boolean;
  /** The organization chosen before is not one of the person's any more. */
  readonly unknown: boolean;
  /** Bumped when what was read belongs to another organization, or to none: everything is read again. */
  readonly generation: number;
  /** The only organization of the person, acted in for this session without asking. */
  readonly only: (id: string) => void;
  /** The person's choice, kept with their login. */
  readonly choose: (id: string, login: string) => void;
  /** The person has to choose: the picker opens unless they closed it. */
  readonly ask: () => void;
  readonly open: () => void;
  readonly close: () => void;
  /** Drops the choice; `unknown` when it is not one of the person's organizations any more. */
  readonly forget: (reason?: 'unknown') => void;
}

export const useOrgStore = create<OrgState>()((set) => ({
  current: readStoredId(safeLocalStorage, ORG_STORAGE_KEY),
  owner: readStoredId(safeLocalStorage, ORG_OWNER_STORAGE_KEY),
  asked: false,
  picking: false,
  dismissed: false,
  unknown: false,
  generation: 0,
  only: (id) => {
    // What was read before, without the header, was read in this same organization: nothing to read again.
    set({ current: id, asked: false, picking: false, unknown: false });
  },
  choose: (id, login) => {
    safeLocalStorage.setItem(ORG_STORAGE_KEY, id);
    safeLocalStorage.setItem(ORG_OWNER_STORAGE_KEY, login);
    set((state) => ({
      current: id,
      owner: login,
      asked: false,
      picking: false,
      dismissed: false,
      unknown: false,
      generation: id === state.current ? state.generation : state.generation + 1,
    }));
  },
  ask: () => {
    set((state) => ({ asked: true, picking: state.picking || !state.dismissed }));
  },
  open: () => {
    set({ picking: true });
  },
  close: () => {
    set({ picking: false, dismissed: true });
  },
  forget: (reason) => {
    safeLocalStorage.removeItem(ORG_STORAGE_KEY);
    safeLocalStorage.removeItem(ORG_OWNER_STORAGE_KEY);
    set((state) => ({
      current: undefined,
      owner: undefined,
      asked: false,
      picking: false,
      dismissed: false,
      unknown: reason === 'unknown',
      generation: state.generation + 1,
    }));
  },
}));
