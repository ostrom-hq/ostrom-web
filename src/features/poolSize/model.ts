// SPDX-License-Identifier: Apache-2.0
import type { PoolSizeResponse, PoolSizeAccountResponse } from '@gen/api/types.gen';

/** USD millionths as dollars. */
export function usdOfMicros(micros: number): number {
  return micros / 1_000_000;
}

/** Where the daily budget in force comes from: any value this version does not know reads as the typed budget. */
export function sourceOf(size: Pick<PoolSizeResponse, 'source'>): 'automatic' | 'manual' {
  return size.source === 'automatic' ? 'automatic' : 'manual';
}

/** The account states the server words; any other value reads as not counted (the contract's rule). */
export type AccountStatus = 'counted' | 'unavailable' | 'no_fresh_observation' | 'no_estimate';

export function statusOf(account: Pick<PoolSizeAccountResponse, 'status'>): AccountStatus {
  switch (account.status) {
    case 'counted':
      return 'counted';
    case 'unavailable':
      return 'unavailable';
    case 'no_fresh_observation':
      return 'no_fresh_observation';
    case 'no_estimate':
    default:
      return 'no_estimate';
  }
}

/** Why there is no automatic value: any value this version does not know reads as no estimate. */
export function reasonOf(size: Pick<PoolSizeResponse, 'reason'>): 'no_accounts' | 'no_estimate' | undefined {
  if (size.reason === undefined || size.reason === null) return undefined;
  return size.reason === 'no_accounts' ? 'no_accounts' : 'no_estimate';
}
