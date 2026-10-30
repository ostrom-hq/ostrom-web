// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react';

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

/** Requests that arrived while the queue was open, to highlight them. */
export function useArrivals(ids: readonly string[] | undefined): ReadonlySet<string> {
  const [state, setState] = useState<ArrivalState>(NO_ARRIVALS);
  if (ids !== state.source) setState(nextArrivals(state, ids));
  return state.fresh;
}
