// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import type { CloudCluster, CloudProfile, CloudRuntime } from '@gen/api/types.gen';
import {
  clusterDraftOf,
  clusterProblem,
  clusterRequestOf,
  EMPTY_CLUSTER,
  EMPTY_PROFILE,
  isConflict,
  linesOf,
  minutesOf,
  needsCredentials,
  profileDraftOf,
  profileProblem,
  profileRequestOf,
  runtimeDraftOf,
  runtimeProblem,
  runtimeRequestOf,
  wholeNumber,
} from './model';

const CLUSTER_ID = '9d0f5a7e-8102-4de4-9f60-718293a4b5c6';
const runtime: CloudRuntime = {
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
};
const cluster: CloudCluster = {
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
};
const profile: CloudProfile = {
  id: 'ae1a6b8f-9213-4ef5-8071-8293a4b5c6d7',
  name: 'default',
  version: 2,
  spec: { clusterId: CLUSTER_ID, namespace: 'ostrom', image: 'ghcr.io/acme/session:latest' },
  assignedMemberIds: ['6a9c2d4b-5e7f-4ab1-8c3d-4e5f60718293'],
  clusterName: 'eu-west',
  createdAt: '2026-11-02T09:00:00Z',
  updatedAt: '2026-11-03T09:00:00Z',
};

describe('numbers and lists typed in a form', () => {
  it('reads a whole number within its bounds, and nothing else', () => {
    expect(wholeNumber(' 12 ', 1, 20)).toBe(12);
    expect(wholeNumber('0', 0, 5)).toBe(0);
    for (const bad of ['', 'x', '1.5', '-1', '21', '0']) expect(wholeNumber(bad, 1, 20)).toBeUndefined();
    expect(minutesOf('240')).toBe(240);
    expect(minutesOf('1441')).toBeUndefined();
  });

  it('splits lines and commas, dropping the empty ones', () => {
    expect(linesOf('a, b\n\n c ,')).toEqual(['a', 'b', 'c']);
  });

  it('tells a conflict from any other failure', () => {
    expect(isConflict(new ApiFailure('conflict', 'x', 409, undefined))).toBe(true);
    expect(isConflict(new ApiFailure('server', 'x', 500, undefined))).toBe(false);
    expect(isConflict(undefined)).toBe(false);
  });
});

describe('the runtime form', () => {
  it('fills from what is stored and sends the same back, with the date it read', () => {
    const draft = runtimeDraftOf(runtime);
    expect(draft.runnerBinary).toBe('/usr/local/bin/ostrom');
    expect(draft.pausedRetentionDays).toBe('');
    expect(runtimeProblem(draft)).toBeUndefined();
    expect(runtimeRequestOf(draft, runtime)).toEqual({
      enabled: true,
      runnerImage: 'ghcr.io/acme/ostrom-runner:1.4',
      runnerBinary: '/usr/local/bin/ostrom',
      workspaceAccessMode: 'ReadWriteOncePod',
      failedWorkspaceRetentionDays: 7,
      maxRunningSessionsPerMember: 3,
      maxRetainedSessionsPerMember: 20,
      memberTransfers: 'offer',
      updatedAt: '2026-11-01T09:00:00Z',
    });
  });

  it('sends the optional values typed, and no date while nothing is stored', () => {
    const { updatedAt, ...unsaved } = runtime;
    expect(updatedAt).toBeDefined();
    const draft = {
      ...runtimeDraftOf(unsaved),
      runnerImage: '',
      serverUrl: ' https://ostrom.acme.test ',
      pausedRetentionDays: '30',
      transcriptRetentionDays: '90',
      workspaceAccessMode: 'ReadWriteOnce',
      memberTransfers: 'disabled',
    };
    expect(runtimeRequestOf(draft, unsaved)).toEqual({
      enabled: true,
      runnerBinary: '/usr/local/bin/ostrom',
      serverUrl: 'https://ostrom.acme.test',
      workspaceAccessMode: 'ReadWriteOnce',
      pausedRetentionDays: 30,
      failedWorkspaceRetentionDays: 7,
      maxRunningSessionsPerMember: 3,
      maxRetainedSessionsPerMember: 20,
      transcriptRetentionDays: 90,
      memberTransfers: 'disabled',
    });
  });

  it('names the first field it cannot send', () => {
    const draft = runtimeDraftOf(runtime);
    expect(runtimeProblem({ ...draft, failedWorkspaceRetentionDays: '0' })).toBe(
      'failedWorkspaceRetentionDays',
    );
    expect(runtimeProblem({ ...draft, maxRunningSessionsPerMember: '' })).toBe('maxRunningSessionsPerMember');
    expect(runtimeProblem({ ...draft, maxRetainedSessionsPerMember: 'x' })).toBe(
      'maxRetainedSessionsPerMember',
    );
    expect(runtimeProblem({ ...draft, pausedRetentionDays: '0' })).toBe('pausedRetentionDays');
    expect(runtimeProblem({ ...draft, transcriptRetentionDays: '9999' })).toBe('transcriptRetentionDays');
    expect(runtimeProblem({ ...draft, runnerBinary: ' ' })).toBe('runnerBinary');
    expect(runtimeProblem({ ...draft, workspaceAccessMode: 'x' })).toBe('workspaceAccessMode');
    expect(runtimeProblem({ ...draft, memberTransfers: 'x' })).toBe('memberTransfers');
    expect(runtimeProblem({ ...draft, serverUrl: 'http://x.test' })).toBe('serverUrl');
  });
});

describe('the cluster form', () => {
  it('fills from a cluster with its secrets empty, and keeps them when the address is the same', () => {
    const draft = clusterDraftOf(cluster);
    expect(draft).toMatchObject({ name: 'eu-west', allowedNamespaces: 'ostrom', caCertificate: '' });
    expect(needsCredentials(draft, cluster)).toBe(false);
    expect(clusterProblem(draft, cluster)).toBeUndefined();
    expect(clusterRequestOf(draft, cluster)).toEqual({
      name: 'eu-west',
      apiUrl: 'https://k8s.acme.test',
      allowedNamespaces: ['ostrom'],
      maxRunningPods: 20,
      version: 1,
    });
  });

  it('asks for the CA bundle and the token again when the address changes, and for a new cluster', () => {
    const moved = { ...clusterDraftOf(cluster), apiUrl: 'https://other.acme.test' };
    expect(needsCredentials(moved, cluster)).toBe(true);
    expect(clusterProblem(moved, cluster)).toBe('caCertificate');
    expect(clusterProblem({ ...moved, caCertificate: 'PEM' }, cluster)).toBe('serviceAccountToken');
    const complete = {
      ...moved,
      caCertificate: ' PEM ',
      serviceAccountToken: ' tok ',
      defaultStorageClass: 'fast',
    };
    expect(clusterProblem(complete, cluster)).toBeUndefined();
    expect(clusterRequestOf(complete, cluster)).toMatchObject({
      apiUrl: 'https://other.acme.test',
      caCertificate: 'PEM',
      serviceAccountToken: 'tok',
      defaultStorageClass: 'fast',
      version: 1,
    });
    expect(needsCredentials(EMPTY_CLUSTER, undefined)).toBe(true);
    expect(clusterRequestOf({ ...complete, name: 'new' }, undefined).version).toBe(0);
  });

  it('names the first field it cannot send', () => {
    const ok = clusterDraftOf(cluster);
    expect(clusterProblem({ ...ok, name: ' ' }, cluster)).toBe('name');
    expect(clusterProblem({ ...ok, apiUrl: 'http://x.test' }, cluster)).toBe('apiUrl');
    expect(clusterProblem({ ...ok, allowedNamespaces: '' }, cluster)).toBe('allowedNamespaces');
    expect(clusterProblem({ ...ok, allowedNamespaces: 'Bad_Name' }, cluster)).toBe('allowedNamespaces');
    expect(clusterProblem({ ...ok, maxRunningPods: '0' }, cluster)).toBe('maxRunningPods');
  });
});

describe('the profile form', () => {
  it('fills from a profile and sends the version it read', () => {
    const draft = profileDraftOf(profile);
    expect(profileProblem(draft)).toBeUndefined();
    expect(profileRequestOf(draft, profile)).toEqual({
      name: 'default',
      version: 2,
      spec: { clusterId: profile.spec.clusterId, namespace: 'ostrom', image: 'ghcr.io/acme/session:latest' },
      assignedMemberIds: profile.assignedMemberIds,
    });
  });

  it('sends every optional part typed, resources as a pair', () => {
    const typed = {
      ...profileDraftOf(profile),
      allowedImageOverrides: 'a/*\nb',
      imagePullSecrets: 'pull',
      cpuMillis: '500',
      memoryMebibytes: '1024',
      workspaceSizeGibibytes: '20',
      storageClass: 'fast',
      agentKind: 'claude',
      agentVersion: '1.0',
      idleTimeoutMinutes: '30',
    };
    expect(profileProblem(typed)).toBeUndefined();
    expect(profileRequestOf(typed, undefined)).toMatchObject({
      version: 0,
      spec: {
        allowedImageOverrides: ['a/*', 'b'],
        imagePullSecrets: ['pull'],
        resources: { cpuMillis: 500, memoryMebibytes: 1024 },
        workspaceSizeGibibytes: 20,
        storageClass: 'fast',
        agentKind: 'claude',
        agentVersion: '1.0',
        idleTimeoutMinutes: 30,
      },
    });
  });

  it('reads a profile with every optional part set back into its form', () => {
    const full = {
      ...profile,
      spec: {
        ...profile.spec,
        allowedImageOverrides: ['x'],
        imagePullSecrets: ['p'],
        resources: { cpuMillis: 200, memoryMebibytes: 256 },
        workspaceSizeGibibytes: 5,
        storageClass: 's',
        agentKind: 'codex',
        agentVersion: '2',
        idleTimeoutMinutes: 10,
      },
    };
    expect(profileDraftOf(full)).toMatchObject({
      cpuMillis: '200',
      memoryMebibytes: '256',
      agentKind: 'codex',
    });
  });

  it('names the first field it cannot send', () => {
    const ok = { ...EMPTY_PROFILE, ...profileDraftOf(profile) };
    expect(profileProblem({ ...ok, name: ' ' })).toBe('name');
    expect(profileProblem({ ...ok, clusterId: 'nope' })).toBe('clusterId');
    expect(profileProblem({ ...ok, namespace: '' })).toBe('namespace');
    expect(profileProblem({ ...ok, image: '' })).toBe('image');
    expect(profileProblem({ ...ok, cpuMillis: '500' })).toBe('memoryMebibytes');
    expect(profileProblem({ ...ok, memoryMebibytes: '512' })).toBe('cpuMillis');
    expect(profileProblem({ ...ok, cpuMillis: '5', memoryMebibytes: '512' })).toBe('cpuMillis');
    expect(profileProblem({ ...ok, cpuMillis: '500', memoryMebibytes: '5' })).toBe('memoryMebibytes');
    expect(profileProblem({ ...ok, workspaceSizeGibibytes: '0' })).toBe('workspaceSizeGibibytes');
    expect(profileProblem({ ...ok, idleTimeoutMinutes: '2000' })).toBe('idleTimeoutMinutes');
  });
});
