// SPDX-License-Identifier: Apache-2.0
import type { Artifact, SharedAccount } from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';

/**
 * Who reads an artifact, as the contract names it: `personal` is its owner and the members it is shared with (never an
 * administrator for their role alone); `team` every member; `link` anyone with its link. Sharing adds a reader and never
 * changes the access.
 */
export const ARTIFACT_ACCESSES = ['personal', 'team', 'link'] as const;
export type ArtifactAccess = (typeof ARTIFACT_ACCESSES)[number];

export function isArtifactAccess(value: string): value is ArtifactAccess {
  return (ARTIFACT_ACCESSES as readonly string[]).includes(value);
}

/**
 * Whether the viewer owns an artifact: the server says so in `relation`; a server older than the field is read by the
 * owner's name.
 */
export function ownsArtifact(artifact: Artifact, login: string | undefined): boolean {
  return artifact.relation === undefined
    ? login !== undefined && artifact.owner === login
    : artifact.relation === 'owner';
}

/** The subscriptions a member can lend to the organization's agents. */
export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/**
 * The vendor a shared account's subscription is named by. The form sends the vendor's name; the server keeps and lists
 * the agent it serves (ostrom-server `AccountProvider`: `claude` for anthropic, `codex` for openai).
 */
const AGENT_PROVIDERS: ReadonlyMap<string, Provider> = new Map([
  ['claude', 'anthropic'],
  ['codex', 'openai'],
]);

export function providerOf(value: string): Provider | undefined {
  return AGENT_PROVIDERS.get(value);
}

/**
 * A paused subscription lends nothing whatever the provider says; an expired one needs its owner to sign in again; one
 * signed in to another account than the one shared needs its owner to share it again. An imported one waits for its
 * handover (TeamCode may still renew its tokens: it lends nothing); an access-only one lends its access token, never
 * renewed (TeamCode's « Refresh ownership »).
 */
export type AccountState =
  'paused' | 'active' | 'pendingHandover' | 'accessOnly' | 'expired' | 'wrongAccount' | 'unknown';

/** The server's statuses (ostrom-server `AccountStatus`); `disabled` is what a pause writes. */
const STATES: ReadonlyMap<string, AccountState> = new Map([
  ['ready', 'active'],
  ['pending_handover', 'pendingHandover'],
  ['access_only', 'accessOnly'],
  ['reconnect_required', 'expired'],
  ['wrong_account', 'wrongAccount'],
  ['disabled', 'paused'],
]);

export function accountState(account: SharedAccount): AccountState {
  if (account.paused) return 'paused';
  return STATES.get(account.status) ?? 'unknown';
}

export const ACCOUNT_TONES: Readonly<Record<AccountState, BadgeTone>> = {
  paused: 'neutral',
  active: 'success',
  pendingHandover: 'warning',
  accessOnly: 'signal',
  expired: 'danger',
  wrongAccount: 'danger',
  unknown: 'warning',
};

/** Whether an account waits for an administrator to hand its refresh over to Ostrom. */
export function waitsForHandover(account: SharedAccount): boolean {
  return !account.paused && account.status === 'pending_handover';
}
