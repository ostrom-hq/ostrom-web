// SPDX-License-Identifier: Apache-2.0
import type { BudgetOverride } from '@gen/api/types.gen';
import {
  draftOverride,
  minutesOf,
  overrideDraftOf,
  overrideMicrosOf,
  overrideStateOf,
  reasonOf,
  usdOfMicros,
} from './overrides';

const item: BudgetOverride = {
  id: 'o1',
  member: 'theo',
  micros: 25_000_000,
  createdAt: '2026-11-15T09:00:00Z',
  expiresAt: '2026-11-15T10:00:00Z',
  reason: 'release day',
  createdBy: 'maya',
};

describe('temporary daily budgets', () => {
  it('tells the one in force from a revoked or ended one', () => {
    expect(overrideStateOf(item, 'o1')).toBe('active');
    expect(overrideStateOf(item, undefined)).toBe('ended');
    expect(overrideStateOf({ ...item, revokedAt: '2026-11-15T09:30:00Z' }, 'o1')).toBe('revoked');
  });

  it('reads an allowance in dollars, 0 included, up to $100 000 000', () => {
    expect(overrideMicrosOf('25')).toBe(25_000_000);
    expect(overrideMicrosOf(' 0,5 ')).toBe(500_000);
    expect(overrideMicrosOf('0')).toBe(0);
    expect(overrideMicrosOf('100000000')).toBe(100_000_000_000_000);
    expect(overrideMicrosOf('100000000.01')).toBeUndefined();
    expect(overrideMicrosOf('-1')).toBeUndefined();
    expect(overrideMicrosOf('')).toBeUndefined();
    expect(overrideDraftOf(2_500_000)).toBe('2.5');
    expect(usdOfMicros(1_000_000)).toBe(1);
  });

  it('takes 1 to 1 440 whole minutes and a one-line reason of 240 characters at most', () => {
    expect(minutesOf(' 60 ')).toBe(60);
    expect(minutesOf('0')).toBeUndefined();
    expect(minutesOf('1441')).toBeUndefined();
    expect(minutesOf('1.5')).toBeUndefined();
    expect(reasonOf(' release ')).toBe('release');
    expect(reasonOf('  ')).toBeUndefined();
    expect(reasonOf('a\nb')).toBeUndefined();
    expect(reasonOf('x'.repeat(241))).toBeUndefined();
  });

  it('sends a grant only when it is complete, replacing the one in force', () => {
    expect(draftOverride({ amount: '25', minutes: '60', reason: 'release', replacesId: undefined })).toEqual({
      micros: 25_000_000,
      durationMinutes: 60,
      reason: 'release',
    });
    expect(draftOverride({ amount: '0', minutes: '30', reason: 'stop', replacesId: 'o1' })).toEqual({
      micros: 0,
      durationMinutes: 30,
      reason: 'stop',
      replacesId: 'o1',
    });
    expect(draftOverride({ amount: '', minutes: '60', reason: 'r', replacesId: undefined })).toBeUndefined();
    expect(draftOverride({ amount: '1', minutes: '', reason: 'r', replacesId: undefined })).toBeUndefined();
    expect(draftOverride({ amount: '1', minutes: '60', reason: '', replacesId: undefined })).toBeUndefined();
  });
});
