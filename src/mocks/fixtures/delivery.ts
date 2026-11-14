// SPDX-License-Identifier: Apache-2.0
import type {
  ArtifactFileContent,
  Assignment,
  HookEntry,
  HookVersion,
  SkillEntry,
  SkillInstallation,
  SkillVersion,
} from '@gen/api/types.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const digest = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;

export function initialSkills(): SkillEntry[] {
  return [
    {
      id: 'skl-1',
      name: 'review-pr',
      pinnedVersion: '1.2.0',
      retired: false,
      allMembers: true,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: 'skl-2',
      name: 'release-notes',
      pinnedVersion: null,
      retired: false,
      allMembers: false,
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
    },
    {
      id: 'skl-3',
      name: 'old-lint',
      retired: true,
      allMembers: false,
      createdAt: '2026-09-01T09:00:00.000Z',
      updatedAt: '2026-10-15T10:00:00.000Z',
    },
    {
      id: 'skl-4',
      name: 'maya-notes',
      pinnedVersion: '0.1.0',
      retired: false,
      allMembers: false,
      ownerId: MEMBER_IDS.maya,
      createdAt: '2026-11-03T09:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
    },
    {
      id: 'skl-5',
      name: 'theo-sql',
      retired: false,
      allMembers: false,
      ownerId: MEMBER_IDS.theo,
      createdAt: '2026-11-05T09:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    },
  ];
}

const skillVersion = (
  version: string,
  seed: string,
  pinned: boolean,
  retired = false,
  publishedBy: string = MEMBER_IDS.lena,
): SkillVersion => ({
  version,
  digest: digest(seed),
  sizeBytes: 1204,
  fileCount: 3,
  publishedBy,
  publishedAt: '2026-10-30T08:00:00.000Z',
  retired,
  pinned,
});

export function initialSkillVersions(): Record<string, SkillVersion[]> {
  return {
    'review-pr': [
      skillVersion('1.2.0', 'a', true),
      skillVersion('1.1.0', 'b', false),
      skillVersion('1.0.0', 'c', false, true, 'a-key-creator-that-left'),
    ],
    'release-notes': [skillVersion('0.3.0', 'd', false)],
    'old-lint': [skillVersion('2.0.0', 'e', false)],
    'maya-notes': [skillVersion('0.1.0', 'f', true, false, MEMBER_IDS.maya)],
    'theo-sql': [skillVersion('0.0.1', '1', false, false, MEMBER_IDS.theo)],
  };
}

export function initialSkillAssignments(): Record<string, Assignment[]> {
  return {
    'review-pr': [{ memberId: MEMBER_IDS.theo, decision: 'deny', updatedAt: '2026-11-01T10:00:00.000Z' }],
    'release-notes': [
      { memberId: MEMBER_IDS.samir, decision: 'allow', updatedAt: '2026-11-01T10:00:00.000Z' },
    ],
  };
}

/** What each member's workstations last reported, by member id. */
export function initialSkillInstallations(): Record<string, SkillInstallation[]> {
  return {
    [MEMBER_IDS.theo]: [
      {
        deviceId: 'dev-theo',
        deviceName: 'theo-laptop',
        name: 'review-pr',
        version: '1.2.0',
        digest: digest('a'),
        status: 'installed',
        reportedAt: '2026-11-06T09:00:00.000Z',
      },
      {
        deviceId: 'dev-theo',
        deviceName: 'theo-laptop',
        name: 'old-lint',
        status: 'failed',
        reportedAt: '2026-11-06T09:00:00.000Z',
      },
      {
        deviceId: 'dev-theo-2',
        deviceName: 'theo-desktop',
        name: 'release-notes',
        version: null,
        status: 'removed',
        reportedAt: '2026-11-05T09:00:00.000Z',
      },
    ],
    [MEMBER_IDS.maya]: [
      {
        deviceId: 'dev-maya',
        deviceName: 'maya-mbp',
        name: 'review-pr',
        version: '1.2.0',
        digest: digest('a'),
        status: 'installed',
        reportedAt: '2026-11-07T09:00:00.000Z',
      },
    ],
  };
}

export function initialHooks(): HookEntry[] {
  return [
    {
      id: 'hok-1',
      name: 'require-status',
      pinnedVersion: '1.0.0',
      allMembers: false,
      createdAt: '2026-10-05T09:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: 'hok-2',
      name: 'audit-tools',
      allMembers: true,
      createdAt: '2026-10-20T09:00:00.000Z',
      updatedAt: '2026-10-29T10:00:00.000Z',
    },
  ];
}

export function initialHookVersions(): Record<string, HookVersion[]> {
  return {
    'require-status': [
      {
        version: '1.0.0',
        digest: digest('2'),
        definition: {
          events: ['Stop', 'SubagentStop'],
          command: 'bin/require-status.sh',
          timeoutSeconds: 30,
        },
        sizeBytes: 640,
        fileCount: 2,
        publishedBy: MEMBER_IDS.lena,
        publishedAt: '2026-10-30T08:00:00.000Z',
        pinned: true,
      },
      {
        version: '0.9.0',
        digest: digest('3'),
        definition: { events: ['Stop'], command: 'bin/require-status.sh' },
        sizeBytes: 480,
        fileCount: 1,
        publishedBy: MEMBER_IDS.lena,
        publishedAt: '2026-10-20T08:00:00.000Z',
        pinned: false,
      },
    ],
    'audit-tools': [
      {
        version: '0.1.0',
        digest: digest('4'),
        definition: { events: ['PreToolUse'], matcher: 'Bash', command: 'audit.sh', timeoutSeconds: 10 },
        sizeBytes: 120,
        fileCount: 1,
        publishedBy: MEMBER_IDS.lena,
        publishedAt: '2026-10-29T08:00:00.000Z',
        pinned: false,
      },
    ],
  };
}

export function initialHookAssignments(): Record<string, Assignment[]> {
  return {
    'require-status': [
      { memberId: MEMBER_IDS.lena, decision: 'allow', updatedAt: '2026-11-01T10:00:00.000Z' },
    ],
  };
}

const file = (path: string, mode: string, text: string): ArtifactFileContent => ({
  path,
  mode,
  size: text.length,
  sha256: digest('9').slice(7),
  contentBase64: btoa(text),
});

/** The files of each hook version, by `name@version`. */
export function initialHookFiles(): Record<string, ArtifactFileContent[]> {
  const script = '#!/bin/sh\n# Refuse to stop without saying where it stands.\nexec cat >/dev/null\n';
  return {
    'require-status@1.0.0': [
      file('bin/require-status.sh', 'executable', script),
      // Not text: two bytes no UTF-8 text holds.
      { path: 'data/blob.bin', mode: 'file', size: 2, sha256: digest('8').slice(7), contentBase64: '//4=' },
    ],
    'require-status@0.9.0': [file('bin/require-status.sh', 'executable', script)],
    'audit-tools@0.1.0': [file('audit.sh', 'executable', '#!/bin/sh\necho audit\n')],
  };
}
