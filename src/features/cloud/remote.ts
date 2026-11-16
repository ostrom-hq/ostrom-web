// SPDX-License-Identifier: Apache-2.0
import type {
  DaemonPresenceDto,
  DeviceFolderDto,
  DeviceResponse,
  ListCloudSessionsData,
} from '@gen/api/types.gen';
import type { Options } from '@gen/api/sdk.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/**
 * Remote sessions in the session list and the start form: the kinds listed (TeamCode's `teamcode cloud list --kind`),
 * and starting a session on one of the member's online devices (TeamCode's companion `DeviceSessionUseCases` and
 * `NewSessionViewModel`).
 */

/** The kinds the console lists: never `local`, which TeamCode's console does not show either. */
export const LISTED_KINDS = ['cloud', 'remote'] as const;
export type ListedKind = (typeof LISTED_KINDS)[number];

/** The kind filter of the list: both kinds, or one. */
export const KIND_FILTERS = ['all', 'cloud', 'remote'] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

export function listedKinds(filter: KindFilter): readonly ListedKind[] {
  return filter === 'all' ? LISTED_KINDS : [filter];
}

/** `kind` repeated, once per kind: `kind=cloud&kind=remote`. */
export function kindsSearch(kinds: readonly ListedKind[]): string {
  return kinds.map((kind) => `kind=${kind}`).join('&');
}

/**
 * The list request for `kinds`. The document types `kind` as one value though the server reads it repeated: the query
 * key names the kinds, and the serializer writes each as its own `kind`.
 */
export function kindsQuery(kinds: readonly ListedKind[]): Options<ListCloudSessionsData> {
  return { query: { kind: kinds.join(',') }, querySerializer: () => kindsSearch(kinds) };
}

/** Where the new session runs: a pod, or a folder of one of the member's online devices. */
export const SESSION_TARGETS = ['cloud', 'device'] as const;
export type SessionTarget = (typeof SESSION_TARGETS)[number];

/** The agents a session on a device runs. */
export const DEVICE_AGENTS = ['claude', 'codex'] as const;
export type DeviceAgent = (typeof DEVICE_AGENTS)[number];

export function isDeviceAgent(value: string): value is DeviceAgent {
  return DEVICE_AGENTS.some((agent) => agent === value);
}

/** Ask or bypass, chosen at each launch; the last choice comes back the next time. */
export const PERMISSION_MODES = ['ask', 'bypass'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export function isPermissionMode(value: string | null): value is PermissionMode {
  return PERMISSION_MODES.some((mode) => mode === value);
}

/**
 * The devices a session can be started on: the member's own (`GET /devices` lists only those), and only those whose
 * daemon is online now; an offline device is never offered, the server would refuse it. This device first, then by name.
 */
export function hostDevices(devices: readonly DeviceResponse[]): readonly DeviceResponse[] {
  return devices
    .filter((device) => device.daemon?.online === true)
    .toSorted((a, b) =>
      firstDifference([
        Number(b.current === true) - Number(a.current === true),
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        a.id.localeCompare(b.id),
      ]),
    );
}

/** The folders a device offers, by how its owner recognizes them. */
export function sortedFolders(folders: readonly DeviceFolderDto[]): readonly DeviceFolderDto[] {
  return folders.toSorted((a, b) =>
    firstDifference([
      (a.label ?? a.name).toLowerCase().localeCompare((b.label ?? b.name).toLowerCase()),
      a.id.localeCompare(b.id),
    ]),
  );
}

/** The first comparison that tells two items apart, else 0. */
function firstDifference(comparisons: readonly number[]): number {
  return comparisons.reduce((found, next) => (found === 0 ? next : found), 0);
}

/** The daemon feature that lists a folder's conversations to continue. */
const RESUME_FEATURE = 'resume.v1';

/** Whether the device's daemon lists its folders' conversations: false for an older Ostrom there. */
export function daemonResumes(daemon: DaemonPresenceDto | null | undefined): boolean {
  return daemon?.features?.includes(RESUME_FEATURE) === true;
}

/** The server's refusals about a device or its folders that have their own words. */
export const DEVICE_REFUSALS = [
  'device_offline',
  'folder_not_published',
  'device_not_found',
  'remote_requires_login',
  'device_target_unsupported',
  'invalid_folder',
  'resume_unsupported',
  'device_no_answer',
] as const;
export type DeviceRefusal = (typeof DEVICE_REFUSALS)[number];

/** The daemon's own reasons for not reading a folder's conversations. */
const FOLDER_REASONS: ReadonlySet<string> = new Set([
  'folder_not_configured',
  'folder_missing',
  'folder_moved',
  'folder_refused',
]);

/** A device refusal: a code with its own words, or a folder the daemon could not read (with its reason). */
export type DeviceProblem =
  | { readonly kind: 'refusal'; readonly code: DeviceRefusal }
  | { readonly kind: 'folder'; readonly code: string };

export function deviceProblemOf(failure: Error | undefined): DeviceProblem | undefined {
  const code = isApiFailure(failure) ? failure.code : undefined;
  if (code === undefined) return undefined;
  // The daemon's own word for an older Ostrom is the server's `resume_unsupported`.
  const known = DEVICE_REFUSALS.find(
    (refusal) => refusal === (code === 'daemon_resume_unsupported' ? 'resume_unsupported' : code),
  );
  if (known !== undefined) return { kind: 'refusal', code: known };
  return FOLDER_REASONS.has(code) ? { kind: 'folder', code } : undefined;
}

/** The device went offline or is gone: the list no longer offers it. */
export function deviceGone(problem: DeviceProblem | undefined): boolean {
  return (
    problem?.kind === 'refusal' && (problem.code === 'device_offline' || problem.code === 'device_not_found')
  );
}
