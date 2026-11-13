// SPDX-License-Identifier: Apache-2.0
import type { Capabilities } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** The versions of the `/api/v1` contract this console speaks. A server answering another one is refused. */
export const SUPPORTED_API_VERSIONS: readonly number[] = [1];

/** The version of the contract the console is written against, for the sentence that explains a refusal. */
export const CONSOLE_API_VERSION = 1;

/**
 * The feature keys the console knows (the `Capabilities` schema in the contract lists them all). A key the server
 * lists that is not here is ignored; the console only asks for the ones its screens depend on.
 */
export const FEATURES = [
  'artifacts.v1',
  'automations.v1',
  'billing.v1',
  'github.link.v1',
  'github.v1',
  'import.teamcode.v1',
  'notifications.push.v1',
  'runners.cloud.github.v1',
  'runners.cloud.v1',
  'servicekeys.scopes.v1',
  'sharing.handover.v1',
  'slack.v1',
  'todos.v1',
  'waits.v1',
] as const;

export type FeatureKey = (typeof FEATURES)[number];

declare global {
  interface ImportMetaEnv {
    /** The console's own version (`package.json`), set by `vite.config.ts` at build time. */
    readonly VITE_OSTROM_CONSOLE_VERSION?: string;
  }
}

/** The console's own version, when the build knows it. */
export function consoleVersion(): string | undefined {
  const version = import.meta.env.VITE_OSTROM_CONSOLE_VERSION;
  return version === undefined || version === '' ? undefined : version;
}

/** What the console knows of the server it talks to. */
export type ServerStatus =
  /** Not asked yet (nobody is signed in) or the answer is on its way. Nothing is hidden meanwhile. */
  | { readonly kind: 'loading' }
  /** The answer is missing: the server is unreachable or failing, or predates the route and the console tolerates it. */
  | { readonly kind: 'unknown' }
  | { readonly kind: 'ready'; readonly capabilities: Capabilities }
  /** The server speaks an API version this console does not. */
  | { readonly kind: 'unsupported'; readonly apiVersion: number }
  /** The server has no capabilities route: older than this console. */
  | { readonly kind: 'too-old' };

export interface CapabilitiesQueryState {
  readonly data: Capabilities | undefined;
  readonly error: unknown;
  readonly pending: boolean;
}

/**
 * Reads the answer of `GET /capabilities`. Only a server that says it speaks another API version (or one with no such
 * route) is refused; a network error, a 5xx or an unreadable answer never blocks the console.
 */
export function serverStatusOf({ data, error, pending }: CapabilitiesQueryState): ServerStatus {
  if (data !== undefined) {
    return SUPPORTED_API_VERSIONS.includes(data.apiVersion)
      ? { kind: 'ready', capabilities: data }
      : { kind: 'unsupported', apiVersion: data.apiVersion };
  }
  if (isApiFailure(error) && error.kind === 'not-found') return { kind: 'too-old' };
  return pending ? { kind: 'loading' } : { kind: 'unknown' };
}

/** Whether a screen that needs `key` is shown: unless the server answered without it, it is. */
export function hasFeature(status: ServerStatus, key: FeatureKey): boolean {
  return status.kind !== 'ready' || status.capabilities.features.includes(key);
}

/**
 * Whether the server said it serves a feature. False until it has answered, and when it cannot be asked: for a part of
 * a screen that is shown only where it works (a todo, a switch), not asked of a server that may not know the route.
 */
export function announces(status: ServerStatus, key: FeatureKey): boolean {
  return status.kind === 'ready' && status.capabilities.features.includes(key);
}

/** The server blocks the whole console. */
export function blocks(
  status: ServerStatus,
): status is Extract<ServerStatus, { kind: 'unsupported' | 'too-old' }> {
  return status.kind === 'unsupported' || status.kind === 'too-old';
}
