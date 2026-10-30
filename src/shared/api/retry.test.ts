// SPDX-License-Identifier: AGPL-3.0-only
import { ApiFailure } from '@/shared/api/ApiFailure';
import { retryOnce } from '@/shared/api/retry';

describe('retryOnce', () => {
  it('retries a dropped connection, a server error or an unknown failure once', () => {
    expect(retryOnce(0, new ApiFailure('network', 'x', undefined, undefined))).toBe(true);
    expect(retryOnce(0, new ApiFailure('server', 'x', 503, undefined))).toBe(true);
    expect(retryOnce(0, new Error('x'))).toBe(true);
    expect(retryOnce(1, new ApiFailure('server', 'x', 503, undefined))).toBe(false);
  });

  it('never retries a refusal', () => {
    expect(retryOnce(0, new ApiFailure('not-found', 'x', 404, undefined))).toBe(false);
    expect(retryOnce(0, new ApiFailure('forbidden', 'x', 403, undefined))).toBe(false);
  });
});
