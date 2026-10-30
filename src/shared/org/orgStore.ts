// SPDX-License-Identifier: AGPL-3.0-only
import type { Organization } from '@gen/api/types.gen';
import { z } from 'zod';
import { create } from 'zustand';
import { type SafeStorage, safeLocalStorage } from '@/shared/lib/safeStorage';

/** Where the organization the console acts in is kept: an id, not a secret, so a reload keeps acting in it. */
export const ORG_STORAGE_KEY = 'ostrom.org';

/** What the picker shows of an organization. */
export type OrgChoice = Pick<Organization, 'id' | 'name' | 'avatarUrl'>;

/** An id goes into a request header: visible ASCII only, so a stored or typed value can never break the request. */
export const orgIdSchema = z
  .string()
  .trim()
  .regex(/^[\x21-\x7E]{1,200}$/);

/** Storage is a trust boundary: anything that is not an id reads as no organization chosen. */
export function readOrgId(storage: Pick<SafeStorage, 'getItem'>): string | undefined {
  const parsed = orgIdSchema.safeParse(storage.getItem(ORG_STORAGE_KEY));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The organization the console acts in, sent as `Ostrom-Org` on every API call (shared/api/apiClient.ts). A person
 * with one membership needs none: the server takes it, `/me` names it, the console adopts it. A person with several
 * is refused with 409 `org_required` until they choose, and the picker opens.
 */
export interface OrgState {
  readonly current: string | undefined;
  /** Organizations the server named this session, for the picker: the contract has no list of a person's own yet. */
  readonly seen: readonly OrgChoice[];
  /** The picker is open: the server asked which organization, or the person wants to switch. */
  readonly picking: boolean;
  /** Bumped when the person chooses or the choice is dropped: what was read in the other organization is stale. */
  readonly generation: number;
  /** The organization the server named (`/me`): remembered, and acted in when none was chosen. */
  readonly adopt: (organization: OrgChoice) => void;
  /** The person's choice; false, and nothing changes, when it is not an id. */
  readonly choose: (id: string) => boolean;
  readonly open: () => void;
  readonly close: () => void;
  /** Drops the choice: another account signed in, or the server no longer knows the person in it. */
  readonly forget: () => void;
}

export const useOrgStore = create<OrgState>()((set, get) => ({
  current: readOrgId(safeLocalStorage),
  seen: [],
  picking: false,
  generation: 0,
  adopt: (organization) => {
    const { current, seen } = get();
    const known = seen.some((choice) => choice.id === organization.id);
    const choice: OrgChoice = {
      id: organization.id,
      name: organization.name,
      avatarUrl: organization.avatarUrl,
    };
    if (current === undefined) safeLocalStorage.setItem(ORG_STORAGE_KEY, organization.id);
    set({ current: current ?? organization.id, seen: known ? seen : [...seen, choice] });
  },
  choose: (id) => {
    const parsed = orgIdSchema.safeParse(id);
    if (!parsed.success) return false;
    safeLocalStorage.setItem(ORG_STORAGE_KEY, parsed.data);
    set((state) => ({ current: parsed.data, picking: false, generation: state.generation + 1 }));
    return true;
  },
  open: () => {
    set({ picking: true });
  },
  close: () => {
    set({ picking: false });
  },
  forget: () => {
    safeLocalStorage.removeItem(ORG_STORAGE_KEY);
    set((state) => ({ current: undefined, seen: [], picking: false, generation: state.generation + 1 }));
  },
}));
