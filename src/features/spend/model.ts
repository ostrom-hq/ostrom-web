// SPDX-License-Identifier: AGPL-3.0-only
import type { Budget, OrgMember, SpendingLine } from '@gen/api/types.gen';
import { parseUsd } from '@/shared/lib/money';

export const PERIODS = ['month', 'week'] as const;
export type Period = (typeof PERIODS)[number];

/** What a budget limits: the organization, or members (every one, or one by their id). A workflow has none. */
export const BUDGET_SCOPES = ['org', 'member'] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export function isBudgetScope(value: string): value is BudgetScope {
  return BUDGET_SCOPES.some((scope) => scope === value);
}

/** A budget's scope as the server writes it: `organization` for the organization's own, which the console sends as `org`. */
export function budgetScopeOf(value: string): BudgetScope | undefined {
  if (value === 'organization') return 'org';
  return isBudgetScope(value) ? value : undefined;
}

/** Amber from 80 % of the budget, red once it is spent: the moment to act, then the moment it stops. */
export type BudgetLevel = 'calm' | 'near' | 'over';

export function budgetLevel(spent: number, budget: number): BudgetLevel {
  const ratio = spent / budget;
  return ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'calm';
}

/** Each line with its share of the largest one, for bars drawn to a true scale (0 to 1). */
export function shares(
  lines: readonly SpendingLine[],
): { readonly line: SpendingLine; readonly share: number }[] {
  const largest = Math.max(0, ...lines.map((line) => line.usd));
  return lines.map((line) => ({ line, share: largest === 0 ? 0 : line.usd / largest }));
}

/** The organization's budget first, then every member's, then each member's by subject. */
export function sortBudgets(budgets: readonly Budget[]): Budget[] {
  const rank = (budget: Budget): number => {
    const scope = budgetScopeOf(budget.scope);
    const index = scope === undefined ? -1 : BUDGET_SCOPES.indexOf(scope);
    return index === -1 ? BUDGET_SCOPES.length : index;
  };
  return [...budgets].sort((a, b) => {
    const byScope = rank(a) - rank(b);
    return byScope !== 0 ? byScope : (a.subject ?? '').localeCompare(b.subject ?? '');
  });
}

/**
 * Who a member budget is for, as people read it: the member's login for their id, as is when the id names nobody
 * listed (a member who left), and undefined for every member (no subject).
 */
export function budgetSubjectLabel(
  subject: string | undefined,
  members: readonly OrgMember[] | undefined,
): string | undefined {
  if (subject === undefined) return undefined;
  return members?.find((member) => member.id === subject)?.login ?? subject;
}

/**
 * The budget to send, or undefined while the form does not describe one yet. A member budget without a subject is
 * every member's (each one without a budget of their own); with one, the subject is the member's id.
 */
export function draftBudget(draft: {
  readonly scope: BudgetScope;
  readonly subject: string;
  readonly month: string;
  readonly day: string;
  readonly hardStop: boolean;
}): Budget | undefined {
  const subject = draft.subject.trim();
  const usdPerMonth = parseUsd(draft.month);
  const usdPerDay = parseUsd(draft.day);
  const monthOk = draft.month.trim() === '' || usdPerMonth !== undefined;
  const dayOk = draft.day.trim() === '' || usdPerDay !== undefined;
  if (!monthOk || !dayOk) return undefined;
  if (usdPerMonth === undefined && usdPerDay === undefined) return undefined;
  return {
    scope: draft.scope,
    hardStop: draft.hardStop,
    ...(draft.scope === 'org' || subject === '' ? {} : { subject }),
    ...(usdPerMonth === undefined ? {} : { usdPerMonth }),
    ...(usdPerDay === undefined ? {} : { usdPerDay }),
  };
}
