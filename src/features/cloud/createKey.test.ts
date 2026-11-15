// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { createRefused, pressOf } from './createKey';

describe('createRefused', () => {
  it('is true for a refusal the server gave: no session was created, the next press is a new one', () => {
    for (const status of [400, 401, 402, 403, 404, 409, 422]) {
      expect(createRefused(new ApiFailure('bad-request', 'refused', status, undefined))).toBe(true);
    }
  });

  it('is false while the answer is unknown: a network failure, a timeout or a server error keep the key', () => {
    expect(createRefused(new ApiFailure('network', 'lost', undefined, undefined))).toBe(false);
    expect(createRefused(new ApiFailure('server', 'boom', 503, undefined))).toBe(false);
    expect(createRefused(new ApiFailure('unexpected', 'timeout', 408, undefined))).toBe(false);
    expect(createRefused(new ApiFailure('unexpected', 'slow down', 429, undefined))).toBe(false);
    expect(createRefused(new Error('timeout'))).toBe(false);
    expect(createRefused(undefined)).toBe(false);
  });
});

describe('pressOf', () => {
  it('starts a press with a valid key, and keeps its key for the same request', () => {
    const first = pressOf(undefined, { agent: 'claude', prompt: 'Fix it' });
    expect(first.key).toMatch(/^[0-9a-f]{32}$/);
    expect(pressOf(first, { agent: 'claude', prompt: 'Fix it' })).toBe(first);
  });

  it('is another press, with another key, when the request changes', () => {
    const first = pressOf(undefined, { agent: 'claude', prompt: 'Fix it' });
    const next = pressOf(first, { agent: 'claude', prompt: 'Fix the build' });
    expect(next).not.toBe(first);
    expect(next.key).not.toBe(first.key);
  });
});
