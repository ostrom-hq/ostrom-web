// SPDX-License-Identifier: Apache-2.0
import type {
  BudgetDto,
  InferenceSettingsDto,
  MemberPolicyResponse,
  PoolBudgetDto,
} from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { parseUsd } from '@/shared/lib/money';

/** USD millionths as dollars. */
export function usdOfMicros(micros: number): number {
  return micros / 1_000_000;
}

/** Dollars as USD millionths, the unit the server keeps. */
export function microsOfUsd(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * A budget in dollars as its field starts, to the cent as the field takes it: `40`, `12.5`. A budget the API saved
 * finer than a cent starts rounded, so its form can still be saved.
 */
export function usdDraftOf(micros: number): string {
  return String(Math.round(micros / 10_000) / 100);
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

/** A member budget: `subject` the member's id, none for every member without one of their own. */
function isMemberBudget(budget: BudgetDto): boolean {
  return budget.scope === 'member';
}

/**
 * A member's daily cap as the budgets set it (TeamCode's « Optional daily cap », here in dollars): their own daily
 * limit, or else every member's, or none.
 */
export type DailyCap =
  | { readonly kind: 'own'; readonly usd: number }
  | { readonly kind: 'everyMember'; readonly usd: number }
  | { readonly kind: 'none' };

/** A member's own budget, the one their daily cap is written in. */
export function ownBudgetOf(budgets: readonly BudgetDto[], memberId: string): BudgetDto | undefined {
  return budgets.find((budget) => isMemberBudget(budget) && budget.subject === memberId);
}

export function dailyCapOf(budgets: readonly BudgetDto[], memberId: string): DailyCap {
  // Every member's limits apply only to a member without limits of their own (`setBudget`): a member whose own
  // budget is monthly only has no daily cap.
  const own = ownBudgetOf(budgets, memberId);
  if (own !== undefined) {
    const day = own.usdPerDay;
    return day === undefined || day === null ? { kind: 'none' } : { kind: 'own', usd: day };
  }
  const every = budgets.find(
    (budget) => isMemberBudget(budget) && (budget.subject === undefined || budget.subject === null),
  )?.usdPerDay;
  return every === undefined || every === null ? { kind: 'none' } : { kind: 'everyMember', usd: every };
}

/** The daily cap field as it starts: the member's own, `0` without one (TeamCode's « 0 = none »). */
export function dailyCapDraftOf(budgets: readonly BudgetDto[], memberId: string): string {
  const cap = dailyCapOf(budgets, memberId);
  // To the cent, as the field takes it: a cap the API saved finer still starts saveable.
  return cap.kind === 'own' ? String(Math.round(cap.usd * 100) / 100) : '0';
}

/** What the daily cap field says: dollars to the cent, `0` for none, or undefined when it is neither. */
export function dailyCapDraft(draft: string): number | undefined {
  return /^0+([.,]0{1,2})?$/.test(draft.trim()) ? 0 : parseUsd(draft);
}

/**
 * The member's own budget with its daily cap changed (`PUT /budgets` replaces it whole): its monthly limit and whether
 * it stops are kept, a new one stops the calls as TeamCode's cap does, and `0` leaves out the daily limit; with no
 * limit left, the member has none of their own.
 */
export function budgetWithDailyCap(memberId: string, own: BudgetDto | undefined, usd: number): BudgetDto {
  const month = own?.usdPerMonth;
  return {
    scope: 'member',
    subject: memberId,
    ...(month === undefined || month === null ? {} : { usdPerMonth: month }),
    ...(usd > 0 ? { usdPerDay: usd } : {}),
    hardStop: own?.hardStop ?? true,
  };
}

/**
 * The most concurrent requests a member may be given (the contract's `maximum`). The members page has the same field
 * and helpers (features/members/model.ts): kept apart on purpose, as any module under src/shared goes into the chunk
 * every route downloads (src/shared/build/bootChunk.ts).
 */
export const MAX_MEMBER_CONCURRENCY = 32;

/** A member's concurrent requests in the inference settings: 0, the default, for unlimited (TeamCode's member policy). */
export function concurrencyOf(settings: InferenceSettingsDto, memberId: string): number {
  return settings.memberConcurrency?.[memberId] ?? 0;
}

/** The settings with a member's concurrent requests changed, every other setting kept; 0 drops the member's entry. */
export function withConcurrency(
  settings: InferenceSettingsDto,
  memberId: string,
  limit: number,
): InferenceSettingsDto {
  const others = Object.entries(settings.memberConcurrency ?? {}).filter(([id]) => id !== memberId);
  return {
    ...settings,
    memberConcurrency: Object.fromEntries(limit === 0 ? others : [...others, [memberId, limit]]),
  };
}

/** What a draft of the concurrency field says: a whole number from 0 to the maximum, or undefined. */
export function concurrencyDraft(draft: string): number | undefined {
  const limit = /^\d{1,2}$/.test(draft.trim()) ? Number(draft.trim()) : MAX_MEMBER_CONCURRENCY + 1;
  return limit <= MAX_MEMBER_CONCURRENCY ? limit : undefined;
}
