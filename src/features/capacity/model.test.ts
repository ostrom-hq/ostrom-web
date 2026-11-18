// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  budgetWithDailyCap,
  byPool,
  dailyCapDraft,
  dailyCapDraftOf,
  dailyCapOf,
  homePoolOf,
  membersByPool,
  microsOfUsd,
  ownBudgetOf,
  poolRefusalOf,
  usdDraftOf,
  usdOfMicros,
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
      { member: 'a', poolId: 'billing', allowSharedOverflow: false },
      { member: 'b', poolId: 'billing', allowSharedOverflow: true },
      { member: 'c', allowSharedOverflow: false },
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
