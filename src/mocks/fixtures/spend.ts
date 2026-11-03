// SPDX-License-Identifier: AGPL-3.0-only
import type { Budget, Spending, SpendingDay } from '@gen/api/types.gen';
import { MEMBER_IDS } from './organization';

const DAILY = [41.2, 38.75, 12.1, 9.4, 55.3, 61.85, 47.05];

function days(to: string): SpendingDay[] {
  const end = Date.parse(to);
  return DAILY.map((usd, index) => ({
    date: new Date(end - (DAILY.length - 1 - index) * 86_400_000).toISOString().slice(0, 10),
    usd,
  }));
}

/** October so far, then the last seven days: the two periods the console offers. */
export function spendingFor(period: 'month' | 'week'): Spending {
  const month = period === 'month';
  const scale = month ? 4.2 : 1;
  const line = (key: string, label: string, usd: number, sessions: number) => ({
    key,
    label,
    usd: Math.round(usd * scale * 100) / 100,
    sessions: Math.round(sessions * scale),
  });
  return {
    period,
    from: month ? '2026-10-01T00:00:00.000Z' : '2026-10-24T00:00:00.000Z',
    to: '2026-10-30T08:00:00.000Z',
    totalUsd: month ? 1_119.3 : 265.65,
    ...(month ? { budgetUsd: 1_200 } : {}),
    byAgent: [line('claude-code', 'Claude Code', 201.4, 38), line('codex', 'Codex', 64.25, 12)],
    byRepo: [
      line('acme/billing-api', 'acme/billing-api', 148.9, 27),
      line('acme/web', 'acme/web', 96.5, 19),
      line('acme/infra', 'acme/infra', 20.25, 4),
    ],
    byPerson: [
      line('theo', 'Theo Martin', 132.1, 24),
      line('maya', 'Maya Lind', 88.3, 18),
      line('samir', 'samir', 45.25, 8),
    ],
    daily: days('2026-10-30T08:00:00.000Z'),
  };
}

const budgets: Budget[] = [
  { scope: 'org', usdPerMonth: 1_200, hardStop: false },
  { scope: 'member', subject: MEMBER_IDS.theo, usdPerDay: 25, hardStop: true },
];

export function initialBudgets(): Budget[] {
  return structuredClone(budgets);
}
