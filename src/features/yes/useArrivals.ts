// SPDX-License-Identifier: Apache-2.0
import { useEffect } from 'react';
import { create } from 'zustand';
import { useAuthStore } from '@/shared/auth/authStore';

export interface ArrivalState {
  readonly source: readonly string[] | undefined;
  readonly known: ReadonlySet<string> | undefined;
  readonly fresh: ReadonlySet<string>;
}

export const NO_ARRIVALS: ArrivalState = { source: undefined, known: undefined, fresh: new Set() };

/** Ids that appeared after the first load stay marked fresh; the first load marks nothing. */
export function nextArrivals(previous: ArrivalState, ids: readonly string[] | undefined): ArrivalState {
  if (ids === undefined) return { ...previous, source: ids };
  if (previous.known === undefined) return { source: ids, known: new Set(ids), fresh: previous.fresh };
  const known = previous.known;
  const arrived = ids.filter((id) => !known.has(id));
  return {
    source: ids,
    known: new Set([...known, ...ids]),
    fresh: arrived.length === 0 ? previous.fresh : new Set([...previous.fresh, ...arrived]),
  };
}

interface ArrivalsStore {
  readonly state: ArrivalState;
  readonly see: (ids: readonly string[]) => void;
  readonly reset: () => void;
}

/** Outlives the queue screen: a request that came in while the person read another one is still new on return. */
const useArrivalsStore = create<ArrivalsStore>()((set) => ({
  state: NO_ARRIVALS,
  see: (ids) => {
    set((store) => (ids === store.state.source ? store : { state: nextArrivals(store.state, ids) }));
  },
  reset: () => {
    set({ state: NO_ARRIVALS });
  },
}));

/** Forgets what was seen: on a change of account or organization (App.tsx), and between tests. */
export function resetArrivals(): void {
  useArrivalsStore.getState().reset();
}

// Another account has another queue: nothing it shows is "new" because of what the previous one saw.
useAuthStore.subscribe((auth, previous) => {
  if (auth.generation !== previous.generation) resetArrivals();
});

/** Requests that arrived since the queue was first loaded, to highlight them. */
export function useArrivals(ids: readonly string[] | undefined): ReadonlySet<string> {
  const see = useArrivalsStore((store) => store.see);
  useEffect(() => {
    if (ids !== undefined) see(ids);
  }, [ids, see]);
  return useArrivalsStore((store) => store.state.fresh);
}
