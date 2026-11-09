// SPDX-License-Identifier: AGPL-3.0-only
import type { Capabilities } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { blocks, consoleVersion, hasFeature, serverStatusOf } from './model';

function demoCapabilities(features: readonly string[] = ['billing.v1']): Capabilities {
  return { apiVersion: 1, serverVersion: '1.4.0', features: [...features] };
}

const none = { data: undefined, error: null, pending: false } as const;

describe('serverStatusOf', () => {
  it('accepts an API version the console speaks', () => {
    const capabilities = demoCapabilities();
    expect(serverStatusOf({ ...none, data: capabilities })).toEqual({ kind: 'ready', capabilities });
  });

  it('refuses any other API version, older or newer', () => {
    for (const apiVersion of [0, 2]) {
      expect(serverStatusOf({ ...none, data: { ...demoCapabilities(), apiVersion } })).toEqual({
        kind: 'unsupported',
        apiVersion,
      });
    }
  });

  it('waits while the answer is on its way, and does not know after a failure', () => {
    expect(serverStatusOf({ ...none, pending: true })).toEqual({ kind: 'loading' });
    const server = new ApiFailure('server', 'HTTP 503', 503, undefined);
    expect(serverStatusOf({ ...none, error: server })).toEqual({ kind: 'unknown' });
    const network = new ApiFailure('network', 'down', undefined, undefined);
    expect(serverStatusOf({ ...none, error: network })).toEqual({ kind: 'unknown' });
    expect(serverStatusOf({ ...none, error: new Error('odd') })).toEqual({ kind: 'unknown' });
  });

  it('calls a server without the route too old', () => {
    const missing = new ApiFailure('not-found', 'HTTP 404', 404, undefined);
    expect(serverStatusOf({ ...none, error: missing })).toEqual({ kind: 'too-old' });
    // Any other refusal still never blocks.
    expect(serverStatusOf({ ...none, error: new ApiFailure('forbidden', 'no', 403, undefined) })).toEqual({
      kind: 'unknown',
    });
    vi.unstubAllEnvs();
  });
});

describe('hasFeature', () => {
  it('is true until the server has answered, then only for the keys it lists', () => {
    expect(hasFeature({ kind: 'loading' }, 'billing.v1')).toBe(true);
    expect(hasFeature({ kind: 'unknown' }, 'billing.v1')).toBe(true);
    const ready = { kind: 'ready', capabilities: demoCapabilities(['github.v1']) } as const;
    expect(hasFeature(ready, 'github.v1')).toBe(true);
    expect(hasFeature(ready, 'billing.v1')).toBe(false);
  });
});

describe('blocks', () => {
  it('holds for the two refusals only', () => {
    expect(blocks({ kind: 'unsupported', apiVersion: 2 })).toBe(true);
    expect(blocks({ kind: 'too-old' })).toBe(true);
    expect(blocks({ kind: 'unknown' })).toBe(false);
    expect(blocks({ kind: 'loading' })).toBe(false);
  });
});

describe('consoleVersion', () => {
  it('is the build’s version, or nothing when it is empty or absent', () => {
    vi.stubEnv('VITE_OSTROM_CONSOLE_VERSION', '1.2.3');
    expect(consoleVersion()).toBe('1.2.3');
    vi.stubEnv('VITE_OSTROM_CONSOLE_VERSION', '');
    expect(consoleVersion()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
