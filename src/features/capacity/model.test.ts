// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  budgetWithDailyCap,
  byPool,
  concurrencyDraft,
  concurrencyOf,
  dailyCapDraft,
  dailyCapDraftOf,
  dailyCapOf,
  dailyLimitUsdOf,
  dayFill,
  dayLevel,
  homePoolOf,
  membersByPool,
  microsOfUsd,
  ownBudgetOf,
  poolRefusalOf,
  poolShareOf,
  poolTotalOf,
  usdDraftOf,
  usdOfMicros,
  weightDraft,
  withConcurrency,
} from './model';

describe('the capacity model', () => {
  it('turns dollars into USD millionths and back', () => {
    expect(usdOfMicros(12_500_000)).toBe(12.5);
    expect(microsOfUsd(12.5)).toBe(12_500_000);
    expect(microsOfUsd(0.1 + 0.2)).toBe(300_000);
    expect(usdDraftOf(40_000_000)).toBe('40');
    expect(usdDraftOf(12_345_678)).toBe('12.35');
  });

  it('words only TeamCode’s refusals of a pool write', () => {
    const refused = (code: string) => new ApiFailure('conflict', code, 409, undefined, code);
    expect(poolRefusalOf(refused('overflow_pool_limit'))).toBe('overflow_pool_limit');
    expect(poolRefusalOf(refused('invalid_policy'))).toBe('invalid_policy');
    expect(poolRefusalOf(refused('conflict'))).toBeUndefined();
    expect(poolRefusalOf(new Error('down'))).toBeUndefined();
    expect(poolRefusalOf(undefined)).toBeUndefined();
  });

  it('counts the members of each pool, the shared home pool as the empty string', () => {
    expect(homePoolOf({})).toBe('');
    expect(homePoolOf({ poolId: null })).toBe('');
    const counts = membersByPool([
      { member: 'a', poolId: 'billing', allowSharedOverflow: false, weight: 1 },
      { member: 'b', poolId: 'billing', allowSharedOverflow: true, weight: 1 },
      { member: 'c', allowSharedOverflow: false, weight: 1 },
    ]);
    expect([...counts]).toEqual([
      ['billing', 2],
      ['', 1],
    ]);
  });

  it('lists the pools by name', () => {
    expect(
      byPool([
        { poolId: 'z', dailyMicros: 1 },
        { poolId: 'a', dailyMicros: 1 },
      ]).map((budget) => budget.poolId),
    ).toEqual(['a', 'z']);
  });
});

describe('a member’s daily cap', () => {
  const budgets = [
    { scope: 'organization', usdPerMonth: 1_000, hardStop: true },
    { scope: 'member', usdPerDay: 10, hardStop: true },
    { scope: 'member', subject: 'm1', usdPerMonth: 300, usdPerDay: 12.345, hardStop: false },
    { scope: 'member', subject: 'm2', usdPerMonth: 50, hardStop: true },
  ];

  it('is their own daily limit, or else every member’s, or none', () => {
    expect(dailyCapOf(budgets, 'm1')).toEqual({ kind: 'own', usd: 12.345 });
    // An own budget, monthly only, puts the member out of every member's limits.
    expect(dailyCapOf(budgets, 'm2')).toEqual({ kind: 'none' });
    expect(dailyCapOf(budgets, 'm3')).toEqual({ kind: 'everyMember', usd: 10 });
    expect(dailyCapOf(budgets.slice(2), 'm3')).toEqual({ kind: 'none' });
    expect(
      dailyCapOf(
        [
          { scope: 'member', usdPerMonth: 5, usdPerDay: null },
          { scope: 'member', subject: 'm3', usdPerDay: null },
        ],
        'm3',
      ),
    ).toEqual({ kind: 'none' });
    expect(dailyCapOf([{ scope: 'member', usdPerMonth: 5, usdPerDay: null }], 'm3')).toEqual({
      kind: 'none',
    });
    expect(ownBudgetOf(budgets, 'm2')).toEqual(budgets[3]);
    expect(ownBudgetOf(budgets, 'm3')).toBeUndefined();
  });

  it('starts its field from their own, to the cent, and 0 without one', () => {
    expect(dailyCapDraftOf(budgets, 'm1')).toBe('12.35');
    expect(dailyCapDraftOf(budgets, 'm2')).toBe('0');
  });

  it('reads dollars to the cent or 0 in the field, and nothing else', () => {
    expect(dailyCapDraft(' 0 ')).toBe(0);
    expect(dailyCapDraft('0.00')).toBe(0);
    expect(dailyCapDraft('12,5')).toBe(12.5);
    for (const draft of ['', 'abc', '-1', '1.234']) expect(dailyCapDraft(draft)).toBeUndefined();
  });

  it('is written in their own budget, its monthly limit and its action kept', () => {
    expect(budgetWithDailyCap('m1', budgets[2], 20)).toEqual({
      scope: 'member',
      subject: 'm1',
      usdPerMonth: 300,
      usdPerDay: 20,
      hardStop: false,
    });
    expect(budgetWithDailyCap('m1', budgets[2], 0)).toEqual({
      scope: 'member',
      subject: 'm1',
      usdPerMonth: 300,
      hardStop: false,
    });
    // A new one stops the calls, as TeamCode's cap.
    expect(budgetWithDailyCap('m3', undefined, 5)).toEqual({
      scope: 'member',
      subject: 'm3',
      usdPerDay: 5,
      hardStop: true,
    });
  });
});

describe('a member’s concurrent requests', () => {
  it('is 0, unlimited, unless the settings give one', () => {
    expect(concurrencyOf({}, 'm1')).toBe(0);
    expect(concurrencyOf({ memberConcurrency: { m1: 3 } }, 'm1')).toBe(3);
  });

  it('changes one member’s, keeps the rest, and drops a member set to 0', () => {
    expect(withConcurrency({ useSharedAccounts: true }, 'm1', 2)).toEqual({
      useSharedAccounts: true,
      memberConcurrency: { m1: 2 },
    });
    expect(withConcurrency({ memberConcurrency: { m1: 2, m2: 5 } }, 'm1', 0)).toEqual({
      memberConcurrency: { m2: 5 },
    });
  });

  it('reads a whole number from 0 to 32 in the field, and nothing else', () => {
    expect(concurrencyDraft(' 32 ')).toBe(32);
    for (const draft of ['33', '', '1.5', 'x']) expect(concurrencyDraft(draft)).toBeUndefined();
  });

  it('reads a whole weight from 0 to 1000 in the field, and nothing else', () => {
    expect(weightDraft(' 0 ')).toBe(0);
    expect(weightDraft('1000')).toBe(1000);
    for (const draft of ['1001', '', '1.5', '-1', 'x']) expect(weightDraft(draft)).toBeUndefined();
  });

  it('colours the day amber from 80 % and red once spent, and fills the meter up to its limit', () => {
    expect(dayLevel(7.99, 10)).toBe('calm');
    expect(dayLevel(8, 10)).toBe('near');
    expect(dayLevel(10, 10)).toBe('over');
    expect(dayLevel(0, 0)).toBe('over');
    expect(dayFill(2.5, 10)).toBe(25);
    expect(dayFill(30, 10)).toBe(100);
    expect(dayFill(0, 0)).toBe(100);
  });

  it('reads the pool share, its total and the daily limit of a member’s capacity', () => {
    const capacity = {
      member: 'maya',
      poolId: 'billing',
      weight: 2,
      poolTotalWeight: 3,
      poolDailyMicros: 12_000_000,
      shareMicros: 8_000_000,
      dailyLimitMicros: 5_000_000,
      spentTodayMicros: 0,
      activeRequests: 0,
      waitingRequests: 0,
      resetsAt: '2026-11-19T00:00:00Z',
    };
    expect(poolShareOf(capacity)).toEqual({ usd: 8, weight: 2, total: 3, poolUsd: 12 });
    expect(poolShareOf({ ...capacity, poolTotalWeight: null })).toBeUndefined();
    expect(poolShareOf({ ...capacity, shareMicros: null })).toBeUndefined();
    expect(poolShareOf({ ...capacity, poolDailyMicros: null })).toBeUndefined();
    expect(poolShareOf(undefined)).toBeUndefined();
    expect(poolTotalOf(capacity)).toBe(3);
    expect(poolTotalOf({ ...capacity, poolTotalWeight: null })).toBeUndefined();
    expect(poolTotalOf(undefined)).toBeUndefined();
    expect(dailyLimitUsdOf(capacity)).toBe(5);
    expect(dailyLimitUsdOf({ ...capacity, dailyLimitMicros: null })).toBeUndefined();
  });
});
