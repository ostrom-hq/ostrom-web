// SPDX-License-Identifier: AGPL-3.0-only
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
  });
});
