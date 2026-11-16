// SPDX-License-Identifier: Apache-2.0
import type { ArtifactResponse, SharedAccountResponse } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
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
export function ownsArtifact(artifact: ArtifactResponse, login: string | undefined): boolean {
  return artifact.relation === undefined || artifact.relation === null
    ? login !== undefined && artifact.owner === login
    : artifact.relation === 'owner';
}

/** Phones and tablets, where the Ostrom app opens the artifact in its own web view (TeamCode's `MOBILE_AGENT`). */
const MOBILE_AGENT = /iPhone|iPad|Android/;

/** The app's link for this page (`ostrom://open?url=<this page>`), which the app turns into its own ticket. */
export function appLinkOf(href: string, userAgent: string): string | undefined {
  return MOBILE_AGENT.test(userAgent) ? `ostrom://open?url=${encodeURIComponent(href)}` : undefined;
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

export function accountState(account: SharedAccountResponse): AccountState {
  if (account.paused === true) return 'paused';
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
export function waitsForHandover(account: SharedAccountResponse): boolean {
  return account.paused !== true && account.status === 'pending_handover';
}

/** The refusals of an account's pool move the page words; any other failure says what the server said. */
export const ACCOUNT_POOL_REFUSALS = ['invalid_pool', 'account_pool_forbidden'] as const;
export type AccountPoolRefusal = (typeof ACCOUNT_POOL_REFUSALS)[number];

export function accountPoolRefusalOf(failure: Error | undefined): AccountPoolRefusal | undefined {
  if (!isApiFailure(failure)) return undefined;
  return ACCOUNT_POOL_REFUSALS.find((code) => code === failure.code);
}
