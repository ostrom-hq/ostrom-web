// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { startRefused } from './useRuns';

describe('startRefused', () => {
  it('is true for a refusal the server gave: no run was started, the next press is a new one', () => {
    for (const status of [400, 403, 404, 409, 422]) {
      expect(startRefused(new ApiFailure('bad-request', 'refused', status, undefined))).toBe(true);
    }
  });

  it('is false while the answer is unknown: a network failure, a timeout or a server error keep the key', () => {
    expect(startRefused(new ApiFailure('network', 'lost', undefined, undefined))).toBe(false);
    expect(startRefused(new ApiFailure('server', 'boom', 503, undefined))).toBe(false);
    expect(startRefused(new Error('timeout'))).toBe(false);
    expect(startRefused(undefined)).toBe(false);
  });
});
