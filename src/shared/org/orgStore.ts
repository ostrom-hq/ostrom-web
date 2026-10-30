// SPDX-License-Identifier: AGPL-3.0-only
import type { Organization } from '@gen/api/types.gen';
import { z } from 'zod';
import { create } from 'zustand';
import { type SafeStorage, safeLocalStorage } from '@/shared/lib/safeStorage';

/** Where the organization the person chose is kept, with whose choice it was: ids, not secrets. */
export const ORG_STORAGE_KEY = 'ostrom.org';
export const ORG_OWNER_STORAGE_KEY = 'ostrom.org.login';

/** What the picker shows of an organization. */
export type OrgChoice = Pick<Organization, 'id' | 'name' | 'avatarUrl'>;

/** An id goes into a request header: visible ASCII only, so a stored or typed value can never break the request. */
export const orgIdSchema = z
  .string()
  .trim()
  .regex(/^[\x21-\x7E]{1,200}$/);

/** Storage is a trust boundary: anything that is not an id reads as nothing stored. */
export function readStoredId(storage: Pick<SafeStorage, 'getItem'>, key: string): string | undefined {
  const parsed = orgIdSchema.safeParse(storage.getItem(key));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The organization the console acts in, sent as `Ostrom-Org` on every API call (shared/api/apiClient.ts).
 *
 * A person with one membership needs none: the server takes it and `/me` names it, and the console then names it on
 * every call, without keeping it past a reload (should they join a second one, the server asks). A person with
 * several is refused with 409 `org_required` until they choose; their choice is kept, with their login, so another
 * account in the same browser is asked afresh.
 */
export interface OrgState {
  readonly current: string | undefined;
  /** Whose choice `current` is; unknown until `/me` answered with it. */
  readonly owner: string | undefined;
  /** Organizations the server named this session, for the picker: the contract has no list of a person's own yet. */
  readonly seen: readonly OrgChoice[];
  /** The server refused a call for want of an organization, and none was chosen since. */
  readonly asked: boolean;
  readonly picking: boolean;
  /** The person closed the picker: a further refusal does not open it again, the top bar does. */
  readonly dismissed: boolean;
  /** The organization last chosen turned out unknown to the server for this person. */
  readonly unknown: boolean;
  /** Bumped when what was read belongs to another organization, or to none: everything is read again. */
  readonly generation: number;
  /** `/me` answered, naming the organization the call acted in, if any, and who is signed in. */
  readonly named: (organization: OrgChoice | undefined, login: string) => void;
  /** The person's choice; false, and nothing changes, when it is not an id. */
  readonly choose: (id: string) => boolean;
  /** The server answered 409 `org_required`. */
  readonly required: () => void;
  readonly open: () => void;
  readonly close: () => void;
  /** Drops the choice; `unknown` when the server does not know the person in it. */
  readonly forget: (reason?: 'unknown') => void;
}

function stored(): Pick<OrgState, 'current' | 'owner'> {
  return {
    current: readStoredId(safeLocalStorage, ORG_STORAGE_KEY),
    owner: readStoredId(safeLocalStorage, ORG_OWNER_STORAGE_KEY),
  };
}

export const useOrgStore = create<OrgState>()((set, get) => ({
  ...stored(),
  seen: [],
  asked: false,
  picking: false,
  dismissed: false,
  unknown: false,
  generation: 0,
  named: (organization, login) => {
    const state = get();
    if (state.owner !== undefined && state.owner !== login) {
      // Chosen by someone else in this browser.
      state.forget();
      return;
    }
    const kept = state.current !== undefined && readStoredId(safeLocalStorage, ORG_STORAGE_KEY) === state.current;
    if (kept && state.owner === undefined) {
      // The choice is now known to be theirs.
      safeLocalStorage.setItem(ORG_OWNER_STORAGE_KEY, login);
      set({ owner: login });
    }
    if (organization === undefined) return;
    const choice: OrgChoice = { id: organization.id, name: organization.name, avatarUrl: organization.avatarUrl };
    const seen = get().seen;
    set({
      current: get().current ?? choice.id,
      seen: seen.some((known) => known.id === choice.id) ? seen : [...seen, choice],
      unknown: false,
    });
  },
  choose: (id) => {
    const parsed = orgIdSchema.safeParse(id);
    if (!parsed.success) return false;
    safeLocalStorage.setItem(ORG_STORAGE_KEY, parsed.data);
    safeLocalStorage.removeItem(ORG_OWNER_STORAGE_KEY);
    const changed = parsed.data !== get().current;
    set((state) => ({
      current: parsed.data,
      owner: undefined,
      asked: false,
      picking: false,
      dismissed: false,
      unknown: false,
      generation: changed ? state.generation + 1 : state.generation,
    }));
    return true;
  },
  required: () => {
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
      seen: [],
      asked: false,
      picking: false,
      dismissed: false,
      unknown: reason === 'unknown',
      generation: state.generation + 1,
    }));
  },
}));
