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

/**
 * The subscription a shared account belongs to, by its vendor: the form sends the vendor's name, and the server keeps
 * the agent it serves (ostrom-server `AccountProvider`: `claude` for anthropic, `codex` for openai).
 */
const AGENT_PROVIDERS: Readonly<Record<string, Provider>> = { claude: 'anthropic', codex: 'openai' };

export function providerOf(value: string): Provider | undefined {
  return isProvider(value) ? value : AGENT_PROVIDERS[value];
}

/** A paused subscription lends nothing whatever the provider says; an expired one needs its owner to sign in again. */
export type AccountState = 'paused' | 'active' | 'expired' | 'unknown';

/**
 * The server's statuses (ostrom-server `AccountStatus`): `ready` serves; `reconnect_required` and `wrong_account` wait
 * for the owner to sign in again; `disabled` was turned off. `active` and `expired` are the same states, older words.
 */
const STATES: Readonly<Record<string, AccountState>> = {
  ready: 'active',
  active: 'active',
  reconnect_required: 'expired',
  wrong_account: 'expired',
  expired: 'expired',
  disabled: 'paused',
};

export function accountState(account: SharedAccount): AccountState {
  if (account.paused) return 'paused';
  return STATES[account.status] ?? 'unknown';
}

export const ACCOUNT_TONES: Readonly<Record<AccountState, BadgeTone>> = {
  paused: 'neutral',
  active: 'success',
  expired: 'danger',
  unknown: 'warning',
};
