// SPDX-License-Identifier: AGPL-3.0-only
import { zAnthropicError, zRunStatus } from '@gen/api/zod.gen';
import { isKnown, knownOr, knownValues } from '@/shared/lib/openEnum';

describe('the generated enums are open (CS-04)', () => {
  it('accepts a value a newer server sends, and still refuses what is not text', () => {
    expect(zRunStatus.safeParse('paused_by_policy').success).toBe(true);
    expect(zRunStatus.safeParse('running').success).toBe(true);
    expect(zRunStatus.safeParse(3).success).toBe(false);
    expect(zRunStatus.safeParse(null).success).toBe(false);
    expect(zRunStatus.safeParse(undefined).success).toBe(false);
  });

  it('lists the values it knows', () => {
    expect(knownValues(zRunStatus)).toContain('running');
    expect(knownValues(zRunStatus)).not.toContain('paused_by_policy');
  });

  it('keeps an enum of one value closed: a discriminator is not open', () => {
    const error = { error: { type: 'overloaded', message: 'busy' } };
    expect(zAnthropicError.safeParse({ type: 'error', ...error }).success).toBe(true);
    expect(zAnthropicError.safeParse({ type: 'other', ...error }).success).toBe(false);
  });
});

describe('knownOr', () => {
  const tones = { a: 1, b: 2 };
  it('reads what the table says of a known value, the fallback of any other', () => {
    expect(knownOr(tones, 'b', 0)).toBe(2);
    expect(knownOr(tones, 'c', 0)).toBe(0);
  });
  it('knows own keys only', () => {
    expect(knownOr(tones, 'constructor', 0)).toBe(0);
    expect(knownOr(tones, 'toString', 0)).toBe(0);
  });
});

describe('isKnown', () => {
  it('tells a known value from another', () => {
    expect([isKnown(['a', 'b'], 'a'), isKnown(['a', 'b'], 'z')]).toEqual([true, false]);
  });
});
