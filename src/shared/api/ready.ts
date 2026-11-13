// SPDX-License-Identifier: Apache-2.0

/** What a screen adds to a generated query: how long it stays fresh, how often it polls, what shows meanwhile. */
export interface QueryTuning {
  readonly staleTime?: number;
  readonly refetchInterval?:
    | number
    | ((query: { readonly state: { readonly error: unknown; readonly data?: unknown } }) => number | false);
  /** `keepPreviousData`: the last answer stays on screen while the next one loads. */
  readonly placeholderData?: <T>(previous: T | undefined) => T | undefined;
  /** `false` for a query that only adds to a screen: a refusal is shown at once, not asked three more times. */
  readonly retry?: boolean | ((failureCount: number, error: unknown) => boolean);
  /** `false` holds the query until what it needs is known. */
  readonly enabled?: boolean;
}

/** The generated options, with the query function they always carry declared as present. */
export type ReadyQuery<Options extends { readonly queryFn?: unknown }> = Omit<Options, 'queryFn'> & {
  readonly queryFn: NonNullable<Options['queryFn']>;
};

function isPresent<T>(value: T): value is NonNullable<T> {
  return value !== undefined && value !== null;
}

/**
 * A generated query ready for `useQuery`, with the screen's tuning.
 *
 * TanStack's `queryOptions` types `queryFn` as `QueryFunction | undefined`, which `useQuery` refuses under
 * `exactOptionalPropertyTypes`. The generator always writes the function: this says so once, checked, so every
 * screen keeps the data and error types the contract gives.
 */
export function ready<Options extends { readonly queryFn?: unknown }>(
  options: Options,
  tuning: QueryTuning = {},
): ReadyQuery<Options> {
  const { queryFn } = options;
  if (!isPresent(queryFn)) throw new Error('a generated query always carries its query function');
  return { ...options, ...tuning, queryFn };
}
