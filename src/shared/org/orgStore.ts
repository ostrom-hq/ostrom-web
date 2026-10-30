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
  /**
   * Whose choice `current` is, kept with it so another account is never sent someone else's; none for the only
   * organization taken without asking (a sign-in or sign-out drops that one, `signedInOrOut`).
   */
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
  /** Bumped when the server did not find something in the organization named: the person's list is read again. */
  readonly doubts: number;
  /** The only organization of the person, acted in for this session without asking. */
  readonly only: (id: string) => void;
  /** The person's choice, kept with their login. */
  readonly choose: (id: string, login: string) => void;
  /** The person has to choose: the picker opens unless they closed it. */
  readonly ask: () => void;
  /** A call in the organization named found nothing: perhaps it is not the person's any more. */
  readonly doubt: () => void;
  readonly open: () => void;
  readonly close: () => void;
  /** Drops the choice; `unknown` when it is not one of the person's organizations any more, and the picker says so. */
  readonly forget: (reason?: 'unknown') => void;
  /** Someone signed in or out: back to what is kept, checked again against whoever is signed in now. */
  readonly signedInOrOut: () => void;
}

function kept(): Pick<OrgState, 'current' | 'owner'> {
  const current = readStoredId(safeLocalStorage, ORG_STORAGE_KEY);
  const owner = readStoredId(safeLocalStorage, ORG_OWNER_STORAGE_KEY);
  // A choice is always kept with whose it is: an id alone is nobody's, and is trusted for nobody.
  return current === undefined || owner === undefined
    ? { current: undefined, owner: undefined }
    : { current, owner };
}

export const useOrgStore = create<OrgState>()((set) => ({
  ...kept(),
  asked: false,
  picking: false,
  dismissed: false,
  unknown: false,
  generation: 0,
  doubts: 0,
  only: (id) => {
    // What was read before, without the header, was read in this same organization: nothing to read again. A picker
    // opened to say the last choice is gone stays open, with this organization in it; any other closes.
    set((state) => ({ current: id, owner: undefined, asked: false, picking: state.unknown }));
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
  doubt: () => {
    set((state) => ({ doubts: state.doubts + 1 }));
  },
  open: () => {
    set({ picking: true });
  },
  close: () => {
    set({ picking: false, dismissed: true, unknown: false });
  },
  forget: (reason) => {
    safeLocalStorage.removeItem(ORG_STORAGE_KEY);
    safeLocalStorage.removeItem(ORG_OWNER_STORAGE_KEY);
    set((state) => ({
      current: undefined,
      owner: undefined,
      asked: false,
      picking: reason === 'unknown',
      dismissed: false,
      unknown: reason === 'unknown',
      generation: state.generation + 1,
    }));
  },
  signedInOrOut: () => {
    // The queries are reset by the sign-in itself (App.tsx): no generation here.
    set({ ...kept(), asked: false, picking: false, dismissed: false, unknown: false });
  },
}));

/**
 * Another tab chose or dropped an organization: this one follows, and reads everything again if it changed. The two
 * keys are written one after the other, so a half-written pair waits for the second event. A tab acting in its only
 * organization keeps it when nothing is chosen anywhere. Listened to by App.tsx.
 */
export function followOtherTab(event: StorageEvent): void {
  if (event.key !== null && event.key !== ORG_STORAGE_KEY && event.key !== ORG_OWNER_STORAGE_KEY) return;
  const id = readStoredId(safeLocalStorage, ORG_STORAGE_KEY);
  const owner = readStoredId(safeLocalStorage, ORG_OWNER_STORAGE_KEY);
  if ((id === undefined) !== (owner === undefined)) return;
  useOrgStore.setState((state) =>
    (id === undefined && state.owner === undefined) || (id === state.current && owner === state.owner)
      ? state
      : {
          current: id,
          owner,
          asked: false,
          picking: false,
          unknown: false,
          generation: state.generation + 1,
        },
  );
}
