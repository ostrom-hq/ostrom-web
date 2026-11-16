// SPDX-License-Identifier: Apache-2.0
import type { MemberPolicyResponse, PoolBudgetDto } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** USD millionths as dollars. */
export function usdOfMicros(micros: number): number {
  return micros / 1_000_000;
}

/** Dollars as USD millionths, the unit the server keeps. */
export function microsOfUsd(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/** A budget in dollars as its field starts: `40`, `12.5`, never an exponent. */
export function usdDraftOf(micros: number): string {
  return String(usdOfMicros(micros));
}

/**
 * The refusals of a pool write that the page words (TeamCode's keys); any other failure says what the server said.
 * `invalid_policy` a home pool out of its form, `invalid_pool_budget` a pool or a budget out of its form (or the home
 * pool), `invalid_overflow_pool` the home pool shared, `overflow_primary_pool` a pool both shared and someone's home,
 * `overflow_pool_limit` a seventeenth shared pool.
 */
export const POOL_REFUSALS = [
  'invalid_policy',
  'invalid_pool_budget',
  'invalid_overflow_pool',
  'overflow_primary_pool',
  'overflow_pool_limit',
] as const;
export type PoolRefusal = (typeof POOL_REFUSALS)[number];

export function poolRefusalOf(failure: Error | undefined): PoolRefusal | undefined {
  if (!isApiFailure(failure)) return undefined;
  return POOL_REFUSALS.find((code) => code === failure.code);
}

/** A member's home pool: the empty string for the shared home pool, as the server takes it. */
export function homePoolOf(policy: Pick<MemberPolicyResponse, 'poolId'>): string {
  return policy.poolId ?? '';
}

/** How many members call each pool home (`''` the shared home pool), from the policies read so far. */
export function membersByPool(policies: readonly MemberPolicyResponse[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const policy of policies) {
    const pool = homePoolOf(policy);
    counts.set(pool, (counts.get(pool) ?? 0) + 1);
  }
  return counts;
}

/** The pools by name, as TeamCode lists them. */
export function byPool(budgets: readonly PoolBudgetDto[]): PoolBudgetDto[] {
  return budgets.toSorted((a, b) => a.poolId.localeCompare(b.poolId));
}
