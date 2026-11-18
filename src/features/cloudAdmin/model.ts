// SPDX-License-Identifier: Apache-2.0
import type {
  CloudClusterResponse,
  CloudProfileResponse,
  CloudRuntimeResponse,
  SaveCloudClusterRequest,
  SaveCloudProfileRequest,
  SaveCloudRuntimeRequest,
} from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** A whole number within the bounds the contract gives, or undefined for anything else (empty included). */
export function wholeNumber(text: string, min: number, max: number): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : undefined;
}

/** The non-empty lines of a text area, trimmed. */
export function linesOf(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** A refused save the server answers with 409: someone else saved first. */
export function isConflict(failure: Error | undefined): boolean {
  // Another 409 (a name already taken) says its own reason; only a version or date conflict asks to reload.
  return (
    isApiFailure(failure) && failure.kind === 'conflict' && (failure.code?.endsWith('_conflict') ?? true)
  );
}

// ---- The organization's settings ----------------------------------------------------------------------------------

export const BACKGROUND_MAX = 1440;

/** The minutes typed, when they are a number the server reads (0 never holds the pause off). */
export function minutesOf(text: string): number | undefined {
  return wholeNumber(text, 0, BACKGROUND_MAX);
}

export const AUTOMATIONS_MAX = 100;

/** The cap of running automation sessions per member typed, when it is a number the server reads. */
export function automationsOf(text: string): number | undefined {
  return wholeNumber(text, 1, AUTOMATIONS_MAX);
}

export const REMOTE_IDLE_MAX = 1440;
/** What the server uses while no organization saved its own (TeamCode's `remoteIdleTimeoutMinutes`). */
export const REMOTE_IDLE_DEFAULT = 60;

/** The idle pause of remote sessions typed, when it is a number the server reads (0 never pauses them). */
export function remoteIdleOf(text: string): number | undefined {
  return wholeNumber(text, 0, REMOTE_IDLE_MAX);
}

// ---- The instance's runtime ---------------------------------------------------------------------------------------

export const WORKSPACE_MODES = ['ReadWriteOncePod', 'ReadWriteOnce'] as const;
export const TRANSFERS = ['offer', 'disabled'] as const;

/** The session image the server uses while none is stored. */
export const DEFAULT_SESSION_IMAGE = 'docker.io/ostromhq/ostrom-session:latest';

/** What is typed in the runtime form: every value as text, so a half-typed number is never lost. */
export interface RuntimeDraft {
  readonly enabled: boolean;
  readonly runnerImage: string;
  readonly sessionImage: string;
  readonly runnerBinary: string;
  readonly serverUrl: string;
  readonly workspaceAccessMode: string;
  readonly pausedRetentionDays: string;
  readonly failedWorkspaceRetentionDays: string;
  readonly maxRunningSessionsPerMember: string;
  readonly maxRetainedSessionsPerMember: string;
  readonly transcriptRetentionDays: string;
  readonly memberTransfers: string;
}

function text(value: number | string | null | undefined): string {
  return value === undefined || value === null ? '' : String(value);
}

export function runtimeDraftOf(runtime: CloudRuntimeResponse): RuntimeDraft {
  return {
    enabled: runtime.enabled,
    runnerImage: text(runtime.runnerImage),
    // The server sends the effective image: the default is shown as the placeholder, not typed in, so a save
    // does not pin it.
    sessionImage: runtime.sessionImage === DEFAULT_SESSION_IMAGE ? '' : text(runtime.sessionImage),
    runnerBinary: runtime.runnerBinary,
    serverUrl: text(runtime.serverUrl),
    workspaceAccessMode: runtime.workspaceAccessMode,
    pausedRetentionDays: text(runtime.pausedRetentionDays),
    failedWorkspaceRetentionDays: text(runtime.failedWorkspaceRetentionDays),
    maxRunningSessionsPerMember: text(runtime.maxRunningSessionsPerMember),
    maxRetainedSessionsPerMember: text(runtime.maxRetainedSessionsPerMember),
    transcriptRetentionDays: text(runtime.transcriptRetentionDays),
    memberTransfers: runtime.memberTransfers,
  };
}

const RUNTIME_NUMBERS = [
  ['failedWorkspaceRetentionDays', 1, 3650],
  // 0 means no limit (ostrom-server#663, #669, as TeamCode).
  ['maxRunningSessionsPerMember', 0, 1000],
  ['maxRetainedSessionsPerMember', 0, 10000],
] as const;
const RUNTIME_OPTIONAL_NUMBERS = [
  ['pausedRetentionDays', 1, 3650],
  ['transcriptRetentionDays', 1, 3650],
] as const;

/** The first field the form cannot send, by name: what the server would refuse, said before anything is sent. */
export type RuntimeField =
  | (typeof RUNTIME_NUMBERS)[number][0]
  | (typeof RUNTIME_OPTIONAL_NUMBERS)[number][0]
  | 'runnerBinary'
  | 'workspaceAccessMode'
  | 'memberTransfers'
  | 'serverUrl';
export type ClusterField =
  'name' | 'apiUrl' | 'allowedNamespaces' | 'maxRunningPods' | 'caCertificate' | 'serviceAccountToken';
export type ProfileField =
  | 'name'
  | 'clusterId'
  | 'namespace'
  | 'image'
  | 'cpuMillis'
  | 'memoryMebibytes'
  | 'workspaceSizeGibibytes'
  | 'idleTimeoutMinutes';

export function runtimeProblem(draft: RuntimeDraft): RuntimeField | undefined {
  for (const [name, min, max] of RUNTIME_NUMBERS) {
    if (wholeNumber(draft[name], min, max) === undefined) return name;
  }
  for (const [name, min, max] of RUNTIME_OPTIONAL_NUMBERS) {
    if (draft[name].trim() !== '' && wholeNumber(draft[name], min, max) === undefined) return name;
  }
  if (draft.runnerBinary.trim() === '') return 'runnerBinary';
  if (!WORKSPACE_MODES.some((mode) => mode === draft.workspaceAccessMode)) return 'workspaceAccessMode';
  if (!TRANSFERS.some((mode) => mode === draft.memberTransfers)) return 'memberTransfers';
  if (draft.serverUrl.trim() !== '' && !draft.serverUrl.trim().startsWith('https://')) return 'serverUrl';
  return undefined;
}

function workspaceMode(value: string): SaveCloudRuntimeRequest['workspaceAccessMode'] {
  return value === 'ReadWriteOnce' ? 'ReadWriteOnce' : 'ReadWriteOncePod';
}

function transfers(value: string): SaveCloudRuntimeRequest['memberTransfers'] {
  return value === 'disabled' ? 'disabled' : 'offer';
}

/** The save the form makes: the whole runtime, an optional value blank is left out, `updatedAt` as read. */
export function runtimeRequestOf(draft: RuntimeDraft, stored: CloudRuntimeResponse): SaveCloudRuntimeRequest {
  const optional = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim());
  const optionalNumber = (value: string): number | undefined => {
    const typed = optional(value);
    return typed === undefined ? undefined : Number(typed);
  };
  const image = optional(draft.runnerImage);
  const url = optional(draft.serverUrl);
  const paused = optionalNumber(draft.pausedRetentionDays);
  const transcript = optionalNumber(draft.transcriptRetentionDays);
  return {
    enabled: draft.enabled,
    ...(image === undefined ? {} : { runnerImage: image }),
    // Always sent: absent keeps the stored image, blank stores the default (core#282).
    sessionImage: draft.sessionImage.trim(),
    runnerBinary: draft.runnerBinary.trim(),
    ...(url === undefined ? {} : { serverUrl: url }),
    workspaceAccessMode: workspaceMode(draft.workspaceAccessMode),
    ...(paused === undefined ? {} : { pausedRetentionDays: paused }),
    failedWorkspaceRetentionDays: Number(draft.failedWorkspaceRetentionDays),
    maxRunningSessionsPerMember: Number(draft.maxRunningSessionsPerMember),
    maxRetainedSessionsPerMember: Number(draft.maxRetainedSessionsPerMember),
    ...(transcript === undefined ? {} : { transcriptRetentionDays: transcript }),
    memberTransfers: transfers(draft.memberTransfers),
    ...(stored.updatedAt === undefined ? {} : { updatedAt: stored.updatedAt }),
  };
}

// ---- The clusters -------------------------------------------------------------------------------------------------

export interface ClusterDraft {
  readonly name: string;
  readonly apiUrl: string;
  readonly allowedNamespaces: string;
  readonly maxRunningPods: string;
  readonly defaultStorageClass: string;
  /** Write-only: empty keeps the stored one. */
  readonly caCertificate: string;
  /** Write-only: empty keeps the stored one. */
  readonly serviceAccountToken: string;
}

export const EMPTY_CLUSTER: ClusterDraft = {
  name: '',
  apiUrl: '',
  allowedNamespaces: '',
  maxRunningPods: '10',
  defaultStorageClass: '',
  caCertificate: '',
  serviceAccountToken: '',
};

export function clusterDraftOf(cluster: CloudClusterResponse): ClusterDraft {
  return {
    name: cluster.name,
    apiUrl: cluster.apiUrl,
    allowedNamespaces: cluster.allowedNamespaces.join(', '),
    maxRunningPods: String(cluster.maxRunningPods),
    defaultStorageClass: text(cluster.defaultStorageClass),
    caCertificate: '',
    serviceAccountToken: '',
  };
}

const NAMESPACE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/**
 * The first field the form cannot send, by name. A new cluster needs its CA bundle and token; a changed `apiUrl` needs
 * both again, as a credential is never sent to another server.
 */
export function clusterProblem(
  draft: ClusterDraft,
  stored: CloudClusterResponse | undefined,
): ClusterField | undefined {
  if (draft.name.trim() === '') return 'name';
  if (!draft.apiUrl.trim().startsWith('https://')) return 'apiUrl';
  const namespaces = linesOf(draft.allowedNamespaces);
  if (namespaces.length === 0 || namespaces.some((namespace) => !NAMESPACE.test(namespace)))
    return 'allowedNamespaces';
  if (wholeNumber(draft.maxRunningPods, 1, 100000) === undefined) return 'maxRunningPods';
  if (needsCredentials(draft, stored)) {
    if (draft.caCertificate.trim() === '') return 'caCertificate';
    if (draft.serviceAccountToken.trim() === '') return 'serviceAccountToken';
  }
  return undefined;
}

/** A new cluster, one whose address changed, or one missing a secret: its CA bundle and token are written again. */
export function needsCredentials(draft: ClusterDraft, stored: CloudClusterResponse | undefined): boolean {
  return (
    stored?.apiUrl !== draft.apiUrl.trim() ||
    // The server's own cluster reads its credentials from its pod: none is missing.
    (stored.inCluster !== true &&
      (!stored.caCertificate.configured || !stored.serviceAccountToken.configured))
  );
}

export function clusterRequestOf(
  draft: ClusterDraft,
  stored: CloudClusterResponse | undefined,
): SaveCloudClusterRequest {
  const ca = draft.caCertificate.trim();
  const token = draft.serviceAccountToken.trim();
  const storage = draft.defaultStorageClass.trim();
  return {
    name: draft.name.trim(),
    apiUrl: draft.apiUrl.trim(),
    ...(ca === '' ? {} : { caCertificate: ca }),
    ...(token === '' ? {} : { serviceAccountToken: token }),
    allowedNamespaces: linesOf(draft.allowedNamespaces),
    maxRunningPods: Number(draft.maxRunningPods),
    ...(storage === '' ? {} : { defaultStorageClass: storage }),
    version: stored?.version ?? 0,
  };
}

// ---- The profiles -------------------------------------------------------------------------------------------------

export interface ProfileDraft {
  readonly name: string;
  readonly clusterId: string;
  readonly namespace: string;
  readonly image: string;
  readonly allowedImageOverrides: string;
  readonly imagePullSecrets: string;
  readonly cpuMillis: string;
  readonly memoryMebibytes: string;
  readonly workspaceSizeGibibytes: string;
  readonly storageClass: string;
  readonly agentKind: string;
  readonly agentVersion: string;
  readonly idleTimeoutMinutes: string;
  readonly assignedMemberIds: readonly string[];
}

export const EMPTY_PROFILE: ProfileDraft = {
  name: '',
  clusterId: '',
  namespace: '',
  image: '',
  allowedImageOverrides: '',
  imagePullSecrets: '',
  cpuMillis: '',
  memoryMebibytes: '',
  workspaceSizeGibibytes: '',
  storageClass: '',
  agentKind: '',
  agentVersion: '',
  idleTimeoutMinutes: '',
  assignedMemberIds: [],
};

export function profileDraftOf(profile: CloudProfileResponse): ProfileDraft {
  const { spec } = profile;
  return {
    name: profile.name,
    clusterId: spec.clusterId,
    namespace: spec.namespace,
    image: spec.image,
    allowedImageOverrides: (spec.allowedImageOverrides ?? []).join('\n'),
    imagePullSecrets: (spec.imagePullSecrets ?? []).join('\n'),
    cpuMillis: text(spec.resources?.cpuMillis),
    memoryMebibytes: text(spec.resources?.memoryMebibytes),
    workspaceSizeGibibytes: text(spec.workspaceSizeGibibytes),
    storageClass: text(spec.storageClass),
    agentKind: text(spec.agentKind),
    agentVersion: text(spec.agentVersion),
    idleTimeoutMinutes: text(spec.idleTimeoutMinutes),
    assignedMemberIds: profile.assignedMemberIds,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The first field the form cannot send, by name. Resources come as a pair, as the server reads them. */
export function profileProblem(draft: ProfileDraft): ProfileField | undefined {
  if (draft.name.trim() === '') return 'name';
  if (!UUID.test(draft.clusterId.trim())) return 'clusterId';
  if (draft.namespace.trim() === '') return 'namespace';
  if (draft.image.trim() === '') return 'image';
  const cpu = draft.cpuMillis.trim();
  const memory = draft.memoryMebibytes.trim();
  if ((cpu === '') !== (memory === '')) return cpu === '' ? 'cpuMillis' : 'memoryMebibytes';
  if (cpu !== '' && wholeNumber(cpu, 100, 64000) === undefined) return 'cpuMillis';
  if (memory !== '' && wholeNumber(memory, 128, 262144) === undefined) return 'memoryMebibytes';
  const size = draft.workspaceSizeGibibytes.trim();
  if (size !== '' && wholeNumber(size, 1, 2048) === undefined) return 'workspaceSizeGibibytes';
  const idle = draft.idleTimeoutMinutes.trim();
  if (idle !== '' && wholeNumber(idle, 1, 1440) === undefined) return 'idleTimeoutMinutes';
  return undefined;
}

export function profileRequestOf(
  draft: ProfileDraft,
  stored: CloudProfileResponse | undefined,
): SaveCloudProfileRequest {
  const optional = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim());
  const overrides = linesOf(draft.allowedImageOverrides);
  const secrets = linesOf(draft.imagePullSecrets);
  const storage = optional(draft.storageClass);
  const kind = optional(draft.agentKind);
  const agentVersion = optional(draft.agentVersion);
  const size = optional(draft.workspaceSizeGibibytes);
  const idle = optional(draft.idleTimeoutMinutes);
  const cpu = optional(draft.cpuMillis);
  const memory = optional(draft.memoryMebibytes);
  return {
    name: draft.name.trim(),
    version: stored?.version ?? 0,
    spec: {
      clusterId: draft.clusterId.trim(),
      namespace: draft.namespace.trim(),
      image: draft.image.trim(),
      ...(overrides.length === 0 ? {} : { allowedImageOverrides: overrides }),
      ...(secrets.length === 0 ? {} : { imagePullSecrets: secrets }),
      ...(cpu === undefined || memory === undefined
        ? {}
        : { resources: { cpuMillis: Number(cpu), memoryMebibytes: Number(memory) } }),
      ...(size === undefined ? {} : { workspaceSizeGibibytes: Number(size) }),
      ...(storage === undefined ? {} : { storageClass: storage }),
      ...(kind === undefined ? {} : { agentKind: kind }),
      ...(agentVersion === undefined ? {} : { agentVersion }),
      ...(idle === undefined ? {} : { idleTimeoutMinutes: Number(idle) }),
    },
    assignedMemberIds: [...draft.assignedMemberIds],
  };
}

/**
 * The refusals of a profile save that have their own words (`runners.cloud.retention.v1`): the workspace storage class
 * is missing from the cluster, or keeps the volumes of deleted sessions.
 */
export const PROFILE_SAVE_REFUSALS = ['storage_class_missing', 'storage_class_retains_volumes'] as const;
export type ProfileSaveRefusal = (typeof PROFILE_SAVE_REFUSALS)[number];

export function profileSaveRefusalOf(failure: Error | undefined): ProfileSaveRefusal | undefined {
  const code = isApiFailure(failure) ? failure.code : undefined;
  return PROFILE_SAVE_REFUSALS.find((known) => known === code);
}
