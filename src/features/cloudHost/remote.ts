// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionHostDto, CloudSessionResponse } from '@gen/api/types.gen';
import type { TFunction } from '@/shared/i18n/instance';

/**
 * Remote sessions (`runners.cloud.remote.v1`): a session that runs on a member's own device, in a folder they chose,
 * instead of a pod. TeamCode's companion `CloudSession` (`remote`, `hostOffline`, `waitingForHost`, `hostRefused`),
 * `CloudMapping.refusalReason` and `SessionComponents` (`hostName`, `systemOf`, `refusalText`), shared by the session
 * list and a session's screen.
 */

/** The server sends `kind` only for a session that is not a cloud one: absent reads as `cloud`. */
export function isRemote(session: CloudSessionResponse): boolean {
  return session.kind === 'remote';
}

const HOST_OFFLINE = 'host_offline';
const WAITING_HOST = 'waiting_host';
const HOST_REFUSED = 'host_refused';

/** The statuses of a session that is not active: paused, or over. */
const NOT_ACTIVE: ReadonlySet<string> = new Set([
  'pausing',
  'paused',
  'ended',
  'stopped',
  'failed',
  'terminated',
]);

/** A remote session paused because its device stopped answering (the server's `host_offline`). */
export function hostOffline(session: CloudSessionResponse): boolean {
  return isRemote(session) && session.failure?.code === HOST_OFFLINE;
}

/**
 * A remote session that waits for its device to start it (`phase = waiting_host`): a new one the device's daemon has
 * not picked up yet, or one woken by a message. It starts by itself once the device answers.
 */
export function waitingForHost(session: CloudSessionResponse): boolean {
  return (
    isRemote(session) &&
    session.phase === WAITING_HOST &&
    typeof session.endedAt !== 'string' &&
    !NOT_ACTIVE.has(session.status)
  );
}

/** The device's daemon refused to start the session (`host_refused`): it ended without running. */
export function hostRefused(session: CloudSessionResponse): boolean {
  return isRemote(session) && session.failure?.code === HOST_REFUSED;
}

/** Whether a paused session shows as paused: pausing included, as its host drains the turn. */
export function isPaused(session: CloudSessionResponse): boolean {
  return session.status === 'paused' || session.status === 'pausing';
}

const REFUSAL_REASON = /\(([a-z][a-z0-9_]{0,63})\)/g;

/**
 * The daemon's reason code in a `host_refused` failure, which the server words "The device refused to start this
 * session (folder_missing).": only a short snake_case code is kept, never the rest of a server text.
 */
export function refusalReason(message: string): string | undefined {
  return [...message.matchAll(REFUSAL_REASON)].at(-1)?.[1];
}

/** The reasons a device's daemon gives for refusing a session, with their own words. */
export const REFUSAL_REASONS = [
  'folder_not_configured',
  'folder_missing',
  'folder_moved',
  'folder_refused',
  'folder_mismatch',
  'agent_unsupported',
  'host_failed',
  'resume_not_found',
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

function knownReason(reason: string): RefusalReason | undefined {
  return REFUSAL_REASONS.find((known) => known === reason);
}

/** The system a device reports, worded as its vendor does; undefined until the device reported it. */
export function systemOf(
  platform: string | null | undefined,
  osVersion: string | null | undefined,
): string | undefined {
  if (platform === undefined || platform === null) return undefined;
  const name = SYSTEMS.get(platform) ?? platform;
  const version = osVersion?.trim();
  return version === undefined || version === '' ? name : `${name} ${version}`;
}

const SYSTEMS: ReadonlyMap<string, string> = new Map([
  ['macos', 'macOS'],
  ['windows', 'Windows'],
  ['linux', 'Linux'],
  ['ios', 'iOS'],
  ['android', 'Android'],
]);

/** A remote session's device as the member knows it: its name, or that it was removed or never named. */
export function hostName(t: TFunction, host: CloudSessionHostDto | null | undefined): string {
  if (host?.deviceId === undefined || host.deviceId === null) return t('cloudHost.host.removed');
  const name = host.deviceName?.trim();
  return name === undefined || name === '' ? t('cloudHost.host.unnamed') : name;
}

/** Why the device refused to start the session, worded for each reason its daemon gives. */
export function refusalText(t: TFunction, session: CloudSessionResponse): string {
  const reason = refusalReason(session.failure?.message ?? '');
  const known = reason === undefined ? undefined : knownReason(reason);
  const why =
    reason === undefined
      ? t('cloudHost.refusal.none')
      : known === undefined
        ? t('cloudHost.refusal.unknown', { reason })
        : t(`cloudHost.refusal.${known}`);
  return t('cloudHost.refused', { device: hostName(t, session.host), why });
}

/** The sentence a remote session's state calls for: offline, waiting for its device, or refused by it. */
export function hostNotice(
  t: TFunction,
  session: CloudSessionResponse,
): { readonly tone: 'warning' | 'info' | 'danger'; readonly text: string } | undefined {
  if (hostOffline(session))
    return { tone: 'warning', text: t('cloudHost.offline', { device: hostName(t, session.host) }) };
  if (waitingForHost(session))
    return { tone: 'info', text: t('cloudHost.waiting', { device: hostName(t, session.host) }) };
  if (hostRefused(session)) return { tone: 'danger', text: refusalText(t, session) };
  return undefined;
}
