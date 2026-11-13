// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';

describe('failureOf', () => {
  it('passes errors through and wraps anything else', () => {
    const typed = new ApiFailure('server', 'HTTP 500', 500, undefined);
    const plain = new Error('boom');
    expect(failureOf(null)).toBeUndefined();
    expect(failureOf(undefined)).toBeUndefined();
    expect(failureOf(typed)).toBe(typed);
    expect(failureOf(plain)).toBe(plain);
    expect(failureOf('odd')?.message).toBe('odd');
    expect(failureOf({ code: 7 })?.message).toBe('{"code":7}');
  });
});
