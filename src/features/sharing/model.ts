// SPDX-License-Identifier: AGPL-3.0-only
import type { SharedAccount } from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';

/**
 * Who reads an artifact, as the contract names it: `personal` is its owner, the administrators and the members it is
 * shared with; `team` every member; `link` anyone with its link. Sharing adds a reader and never changes the access.
 */
export const ARTIFACT_ACCESSES = ['personal', 'team', 'link'] as const;
export type ArtifactAccess = (typeof ARTIFACT_ACCESSES)[number];

export function isArtifactAccess(value: string): value is ArtifactAccess {
  return (ARTIFACT_ACCESSES as readonly string[]).includes(value);
}

/** The subscriptions a member can lend to the organization's agents. */
export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** A paused subscription lends nothing whatever the provider says; an expired one needs its owner to sign in again. */
export type AccountState = 'paused' | 'active' | 'expired' | 'unknown';

export function accountState(account: SharedAccount): AccountState {
  if (account.paused) return 'paused';
  if (account.status === 'active' || account.status === 'expired') return account.status;
  return 'unknown';
}

export const ACCOUNT_TONES: Readonly<Record<AccountState, BadgeTone>> = {
  paused: 'neutral',
  active: 'success',
  expired: 'danger',
  unknown: 'warning',
};
