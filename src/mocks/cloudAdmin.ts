// SPDX-License-Identifier: Apache-2.0
import {
  handleCreateCloudCluster,
  handleCreateCloudProfile,
  handleGetCloudRuntime,
  handleGetCloudSettings,
  handleListCloudClusters,
  handleListCloudProfiles,
  handleSaveCloudRuntime,
  handleSaveCloudSettings,
  handleUpdateCloudCluster,
  handleUpdateCloudProfile,
} from '@gen/api/msw.gen';
import type {
  CloudCluster,
  CloudProfile,
  CloudProfileSpec,
  CloudRuntime,
  CloudSettings,
} from '@gen/api/types.gen';
import {
  type zCloudProfileSpec,
  zSaveCloudClusterRequest,
  zSaveCloudProfileRequest,
  zSaveCloudRuntimeRequest,
  zSaveCloudSettingsRequest,
} from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import type { z } from 'zod/mini';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { readJson, refusal } from './http';

/** The cloud runtime, clusters, profiles and organization settings, as `runners` of ostrom-server keeps them. */
export interface CloudAdminState {
  /** The instance's runtime; the stored one always has a date, as the server's seed does. */
  cloudRuntime: CloudRuntime;
  cloudClusters: CloudCluster[];
  /** The demo organization's profiles. */
  cloudProfiles: CloudProfile[];
  /** The demo organization's settings: the defaults while nothing is stored. */
  cloudSettings: CloudSettings;
}

export const CLUSTER_ID = '9d0f5a7e-8102-4de4-9f60-718293a4b5c6';
export const PROFILE_ID = 'ae1a6b8f-9213-4ef5-8071-8293a4b5c6d7';

export function initialCloudAdmin(): CloudAdminState {
  return {
    cloudRuntime: {
      enabled: true,
      runnerImage: 'ghcr.io/acme/ostrom-runner:1.4',
      runnerBinary: '/usr/local/bin/ostrom',
      effectiveServerUrl: 'https://ostrom.acme.test',
      workspaceAccessMode: 'ReadWriteOncePod',
      failedWorkspaceRetentionDays: 7,
      maxRunningSessionsPerMember: 3,
      maxRetainedSessionsPerMember: 20,
      memberTransfers: 'offer',
      updatedAt: '2026-11-01T09:00:00Z',
    },
    cloudClusters: [
      {
        id: CLUSTER_ID,
        name: 'eu-west',
        apiUrl: 'https://k8s.acme.test',
        allowedNamespaces: ['ostrom'],
        maxRunningPods: 20,
        version: 1,
        caCertificate: { configured: true },
        serviceAccountToken: { configured: true },
        createdAt: '2026-11-01T09:00:00Z',
        updatedAt: '2026-11-01T09:00:00Z',
      },
    ],
    cloudProfiles: [
      {
        id: PROFILE_ID,
        name: 'default',
        version: 2,
        spec: { clusterId: CLUSTER_ID, namespace: 'ostrom', image: 'ghcr.io/acme/session:latest' },
        assignedMemberIds: [MEMBER_IDS.theo],
        clusterName: 'eu-west',
        createdAt: '2026-11-02T09:00:00Z',
        updatedAt: '2026-11-03T09:00:00Z',
      },
    ],
    cloudSettings: { backgroundWorkMaxMinutes: 240, maxRunningAutomationsPerMember: 2 },
  };
}

/** `{ [key]: value }` when there is one, nothing when there is none: an absent part stays absent, as stored. */
function part<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  if (value !== undefined) out[key] = value;
  return out;
}

/** The spec as stored: what the server read, an absent part left out (the parsed body spells absent as undefined). */
function specOf(spec: z.output<typeof zCloudProfileSpec>): CloudProfileSpec {
  return {
    clusterId: spec.clusterId,
    namespace: spec.namespace,
    image: spec.image,
    ...part('allowedImageOverrides', spec.allowedImageOverrides),
    ...part('imagePullSecrets', spec.imagePullSecrets),
    ...part('resources', spec.resources),
    ...part('workspaceSizeGibibytes', spec.workspaceSizeGibibytes),
    ...part('storageClass', spec.storageClass),
    ...part('agentKind', spec.agentKind),
    ...part('agentVersion', spec.agentVersion),
    ...part('idleTimeoutMinutes', spec.idleTimeoutMinutes),
    ...part('minIdleTimeoutMinutes', spec.minIdleTimeoutMinutes),
    ...part('maxIdleTimeoutMinutes', spec.maxIdleTimeoutMinutes),
  };
}

export interface CloudAdminAccess {
  /** The person is an owner or an admin of the organization the call acts in. */
  readonly manages: (request: Request) => boolean;
  /** The member id of the person, for the profiles assigned to them. */
  readonly memberId: (request: Request) => string | undefined;
  /** The person administers the instance. */
  readonly instanceAdmin: () => boolean;
}

const NOT_INSTANCE_ADMIN = (): ReturnType<typeof refusal> =>
  refusal(403, 'instance_admin_required', 'Only a person who administers the instance does this.');
const NOT_MANAGER = (): ReturnType<typeof refusal> =>
  refusal(403, 'forbidden', 'Only an owner or an admin of the organization does this.');

const HTTPS_PUBLIC = /^https:\/\/(?!localhost|127\.|169\.254\.|0\.)[^/\s]+/;

export function createCloudAdminHandlers(
  state: () => CloudAdminState,
  access: CloudAdminAccess,
  now: () => Date,
): HttpHandler[] {
  const invalid = (type: string, message: string) => refusal(400, type, message);
  return [
    handleGetCloudSettings(() => HttpResponse.json(state().cloudSettings)),
    handleSaveCloudSettings(async ({ request }) => {
      if (!access.manages(request)) return NOT_MANAGER();
      const body = zSaveCloudSettingsRequest.safeParse(await readJson(request));
      if (!body.success)
        return invalid('invalid_cloud_settings', 'backgroundWorkMaxMinutes: a number from 0 to 1440.');
      if (body.data.updatedAt !== state().cloudSettings.updatedAt)
        return refusal(409, 'cloud_settings_conflict', 'The settings were saved by someone else.');
      state().cloudSettings = {
        backgroundWorkMaxMinutes: body.data.backgroundWorkMaxMinutes,
        maxRunningAutomationsPerMember:
          body.data.maxRunningAutomationsPerMember ??
          state().cloudSettings.maxRunningAutomationsPerMember ??
          2,
        updatedAt: now().toISOString(),
        updatedBy: 'maya',
      };
      return HttpResponse.json(state().cloudSettings);
    }),
    handleGetCloudRuntime(() =>
      access.instanceAdmin() ? HttpResponse.json(state().cloudRuntime) : NOT_INSTANCE_ADMIN(),
    ),
    handleSaveCloudRuntime(async ({ request }) => {
      if (!access.instanceAdmin()) return NOT_INSTANCE_ADMIN();
      const body = zSaveCloudRuntimeRequest.safeParse(await readJson(request));
      if (!body.success) return invalid('invalid_cloud_runtime', 'The runtime is not valid.');
      if (body.data.serverUrl !== undefined && !HTTPS_PUBLIC.test(body.data.serverUrl))
        return invalid('invalid_cloud_runtime', 'serverUrl: an https origin that is not a private address.');
      if (body.data.updatedAt !== state().cloudRuntime.updatedAt)
        return refusal(409, 'cloud_runtime_conflict', 'The runtime was saved by someone else.');
      const sent = body.data;
      state().cloudRuntime = {
        enabled: sent.enabled,
        ...part('runnerImage', sent.runnerImage),
        runnerBinary: sent.runnerBinary,
        ...part('serverUrl', sent.serverUrl),
        effectiveServerUrl: sent.serverUrl ?? 'https://ostrom.acme.test',
        workspaceAccessMode: sent.workspaceAccessMode,
        ...part('pausedRetentionDays', sent.pausedRetentionDays),
        failedWorkspaceRetentionDays: sent.failedWorkspaceRetentionDays,
        maxRunningSessionsPerMember: sent.maxRunningSessionsPerMember,
        maxRetainedSessionsPerMember: sent.maxRetainedSessionsPerMember,
        ...part('transcriptRetentionDays', sent.transcriptRetentionDays),
        memberTransfers: sent.memberTransfers,
        updatedAt: now().toISOString(),
      };
      return HttpResponse.json(state().cloudRuntime);
    }),
    handleListCloudClusters(() =>
      access.instanceAdmin() ? HttpResponse.json({ clusters: state().cloudClusters }) : NOT_INSTANCE_ADMIN(),
    ),
    handleCreateCloudCluster(async ({ request }) => {
      if (!access.instanceAdmin()) return NOT_INSTANCE_ADMIN();
      const body = zSaveCloudClusterRequest.safeParse(await readJson(request));
      if (!body.success) return invalid('invalid_cloud_cluster', 'The cluster is not valid.');
      if (!HTTPS_PUBLIC.test(body.data.apiUrl))
        return invalid('invalid_cloud_cluster', 'apiUrl: an https address that is not a private one.');
      if (body.data.caCertificate === undefined || body.data.serviceAccountToken === undefined)
        return invalid('invalid_cloud_cluster', 'A new cluster needs its CA bundle and its token.');
      const at = now().toISOString();
      const cluster: CloudCluster = {
        id: `00000000-0000-4000-8000-${String(state().cloudClusters.length + 1).padStart(12, '0')}`,
        name: body.data.name,
        apiUrl: body.data.apiUrl,
        allowedNamespaces: body.data.allowedNamespaces,
        maxRunningPods: body.data.maxRunningPods,
        ...(body.data.defaultStorageClass === undefined
          ? {}
          : { defaultStorageClass: body.data.defaultStorageClass }),
        version: 1,
        caCertificate: { configured: true },
        serviceAccountToken: { configured: true },
        createdAt: at,
        updatedAt: at,
      };
      state().cloudClusters = [...state().cloudClusters, cluster];
      return HttpResponse.json(cluster, { status: 201 });
    }),
    handleUpdateCloudCluster(async ({ request, params }) => {
      if (!access.instanceAdmin()) return NOT_INSTANCE_ADMIN();
      const stored = state().cloudClusters.find((cluster) => cluster.id === params.id);
      if (stored === undefined) return refusal(404, 'cloud_cluster_not_found', 'No such cluster.');
      const body = zSaveCloudClusterRequest.safeParse(await readJson(request));
      if (!body.success) return invalid('invalid_cloud_cluster', 'The cluster is not valid.');
      if (body.data.version !== stored.version)
        return refusal(409, 'cloud_cluster_conflict', 'The cluster was saved by someone else.');
      // A credential is never sent to another server: a new address needs both again.
      if (
        body.data.apiUrl !== stored.apiUrl &&
        (body.data.caCertificate === undefined || body.data.serviceAccountToken === undefined)
      )
        return invalid('invalid_cloud_cluster', 'A new apiUrl needs the CA bundle and the token again.');
      const saved: CloudCluster = {
        ...stored,
        name: body.data.name,
        apiUrl: body.data.apiUrl,
        allowedNamespaces: body.data.allowedNamespaces,
        maxRunningPods: body.data.maxRunningPods,
        version: stored.version + 1,
        updatedAt: now().toISOString(),
      };
      state().cloudClusters = state().cloudClusters.map((cluster) =>
        cluster.id === saved.id ? saved : cluster,
      );
      return HttpResponse.json(saved);
    }),
    handleListCloudProfiles(({ request }) => {
      const all = state().cloudProfiles;
      if (access.manages(request)) return HttpResponse.json({ profiles: all });
      const me = access.memberId(request);
      return HttpResponse.json({
        profiles: all.filter((profile) => me !== undefined && profile.assignedMemberIds.includes(me)),
      });
    }),
    handleCreateCloudProfile(async ({ request }) => {
      if (!access.manages(request)) return NOT_MANAGER();
      const body = zSaveCloudProfileRequest.safeParse(await readJson(request));
      if (!body.success) return invalid('invalid_cloud_profile', 'The profile is not valid.');
      const cluster = state().cloudClusters.find((item) => item.id === body.data.spec.clusterId);
      if (cluster === undefined) return invalid('invalid_cloud_profile', 'clusterId: no such cluster.');
      if (!cluster.allowedNamespaces.includes(body.data.spec.namespace))
        return invalid('invalid_cloud_profile', 'namespace: the cluster does not allow it.');
      const at = now().toISOString();
      const profile: CloudProfile = {
        id: `10000000-0000-4000-8000-${String(state().cloudProfiles.length + 1).padStart(12, '0')}`,
        name: body.data.name,
        version: 1,
        spec: specOf(body.data.spec),
        assignedMemberIds: body.data.assignedMemberIds ?? [],
        clusterName: cluster.name,
        createdAt: at,
        updatedAt: at,
      };
      state().cloudProfiles = [...state().cloudProfiles, profile];
      return HttpResponse.json(profile, { status: 201 });
    }),
    handleUpdateCloudProfile(async ({ request, params }) => {
      if (!access.manages(request)) return NOT_MANAGER();
      const stored = state().cloudProfiles.find((profile) => profile.id === params.id);
      if (stored === undefined) return refusal(404, 'cloud_profile_not_found', 'No such profile.');
      const body = zSaveCloudProfileRequest.safeParse(await readJson(request));
      if (!body.success) return invalid('invalid_cloud_profile', 'The profile is not valid.');
      if (body.data.version !== stored.version)
        return refusal(409, 'cloud_profile_conflict', 'The profile was saved by someone else.');
      const cluster = state().cloudClusters.find((item) => item.id === body.data.spec.clusterId);
      if (cluster === undefined) return invalid('invalid_cloud_profile', 'clusterId: no such cluster.');
      if (!cluster.allowedNamespaces.includes(body.data.spec.namespace))
        return invalid('invalid_cloud_profile', 'namespace: the cluster does not allow it.');
      const saved: CloudProfile = {
        ...stored,
        name: body.data.name,
        version: stored.version + 1,
        spec: specOf(body.data.spec),
        assignedMemberIds: body.data.assignedMemberIds ?? [],
        updatedAt: now().toISOString(),
      };
      state().cloudProfiles = state().cloudProfiles.map((profile) =>
        profile.id === saved.id ? saved : profile,
      );
      return HttpResponse.json(saved);
    }),
  ];
}
