// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { pressOf, startRefused } from './startKey';

describe('startRefused', () => {
  it('is true for a refusal the server gave: no run was started, the next press is a new one', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(startRefused(new ApiFailure('bad-request', 'refused', status, undefined))).toBe(true);
    }
  });

  it('is false while the answer is unknown: a network failure, a timeout or a server error keep the key', () => {
    expect(startRefused(new ApiFailure('network', 'lost', undefined, undefined))).toBe(false);
    expect(startRefused(new ApiFailure('server', 'boom', 503, undefined))).toBe(false);
    expect(startRefused(new ApiFailure('unexpected', 'timeout', 408, undefined))).toBe(false);
    expect(startRefused(new ApiFailure('unexpected', 'slow down', 429, undefined))).toBe(false);
    expect(startRefused(new Error('timeout'))).toBe(false);
    expect(startRefused(undefined)).toBe(false);
  });
});

describe('pressOf', () => {
  it('starts a press with a valid key, and keeps its key for the same start whatever the inputs order', () => {
    const first = pressOf(undefined, 'wf', { a: '1', b: '2' }, 'acme/api');
    expect(first.key).toMatch(/^[0-9a-f]{32}$/);
    expect(pressOf(first, 'wf', { b: '2', a: '1' }, 'acme/api')).toBe(first);
  });

  it('is another press, with another key, when the workflow, an input or the repository changes', () => {
    const first = pressOf(undefined, 'wf', { a: '1' }, '');
    for (const next of [
      pressOf(first, 'other', { a: '1' }, ''),
      pressOf(first, 'wf', { a: '2' }, ''),
      pressOf(first, 'wf', { a: '1' }, 'acme/api'),
    ]) {
      expect(next).not.toBe(first);
      expect(next.key).not.toBe(first.key);
    }
  });
});
