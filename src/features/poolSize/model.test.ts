// SPDX-License-Identifier: Apache-2.0
import { reasonOf, sourceOf, statusOf, usdOfMicros } from './model';

describe('the pool size model', () => {
  it('turns USD millionths into dollars', () => {
    expect(usdOfMicros(38_500_000)).toBe(38.5);
  });

  it('reads a source this version does not know as the typed budget', () => {
    expect(sourceOf({ source: 'automatic' })).toBe('automatic');
    expect(sourceOf({ source: 'manual' })).toBe('manual');
    expect(sourceOf({ source: 'hybrid' })).toBe('manual');
  });

  it('reads an account status this version does not know as not counted', () => {
    expect(statusOf({ status: 'counted' })).toBe('counted');
    expect(statusOf({ status: 'unavailable' })).toBe('unavailable');
    expect(statusOf({ status: 'no_fresh_observation' })).toBe('no_fresh_observation');
    expect(statusOf({ status: 'no_estimate' })).toBe('no_estimate');
    expect(statusOf({ status: 'brand_new' })).toBe('no_estimate');
  });

  it('reads a reason this version does not know as no estimate', () => {
    expect(reasonOf({})).toBeUndefined();
    expect(reasonOf({ reason: 'no_accounts' })).toBe('no_accounts');
    expect(reasonOf({ reason: 'no_estimate' })).toBe('no_estimate');
    expect(reasonOf({ reason: 'later' })).toBe('no_estimate');
  });
});
