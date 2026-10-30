// SPDX-License-Identifier: AGPL-3.0-only

/** What a screen adds to a generated query: how long it stays fresh, how often it polls, when it runs. */
export interface QueryTuning {
  readonly staleTime?: number;
  readonly refetchInterval?:
    number | ((query: { readonly state: { readonly error: unknown } }) => number | false);
  readonly enabled?: boolean;
  /** `keepPreviousData`: the last answer stays on screen while the next one loads. */
  readonly placeholderData?: <T>(previous: T | undefined) => T | undefined;
}

/**
 * A generated query with the screen's tuning, keeping the generated type as it is. Spreading the generated options
 * into a literal widens them under `exactOptionalPropertyTypes` until `useQuery` no longer accepts them; this keeps
 * the exact type the generator wrote, so the data and error types still come from the contract.
 */
export function tuned<Options extends object>(options: Options, tuning: QueryTuning): Options {
  return { ...options, ...tuning };
}
