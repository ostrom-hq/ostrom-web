// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  byPool,
  homePoolOf,
  membersByPool,
  microsOfUsd,
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
