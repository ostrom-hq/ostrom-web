// SPDX-License-Identifier: Apache-2.0
import type { ArtifactResponse, ArtifactVersionResponse } from '@gen/api/types.gen';
import type { SharedAccountRow } from '@/features/sharing/components/AccountCard';
import { groupId, type MockGroup } from '../groups';
import { initialOrganization, MEMBER_IDS } from './organization';

const artifacts: ArtifactResponse[] = [
  {
    id: 'art-7',
    title: 'Billing API: latency study',
    owner: 'maya',
    access: 'personal',
    relation: 'owner',
    latestVersion: 3,
    url: 'https://app.ostrom.run/a/art-7',
    createdAt: '2026-10-27T09:00:00.000Z',
    updatedAt: '2026-10-29T18:40:00.000Z',
    origin: { launchId: 'launch-4d2e8a6b90c1' },
  },
  {
    id: 'art-5',
    title: 'Release checklist',
    owner: 'theo',
    access: 'team',
    relation: 'team',
    latestVersion: 1,
    url: 'https://app.ostrom.run/a/art-5',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    origin: { launchId: 'launch-71c0e5a9d2b3', cloudSessionId: 'session-b83f1a05e7c9' },
  },
  {
    id: 'art-2',
    title: 'Draft: pricing page',
    owner: 'maya',
    access: 'personal',
    relation: 'owner',
    latestVersion: 1,
    url: 'javascript:alert(1)',
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
  },
];

const versions: Record<string, ArtifactVersionResponse[]> = {
  'art-7': [
    {
      number: 3,
      files: ['index.html', 'chart.svg', 'data.json'],
      fileDetails: [
        { path: 'chart.svg', size: 18_432, contentType: 'image/svg+xml' },
        { path: 'data.json', size: 1_258_291, contentType: 'application/json' },
        { path: 'index.html', size: 812, contentType: 'text/html; charset=utf-8' },
      ],
      entry: 'index.html',
      createdAt: '2026-10-29T18:40:00.000Z',
      createdBy: 'maya',
    },
    {
      number: 2,
      files: ['index.html'],
      entry: 'index.html',
      createdAt: '2026-10-28T11:00:00.000Z',
      createdBy: 'theo',
    },
    {
      number: 1,
      files: ['index.html'],
      entry: 'index.html',
      createdAt: '2026-10-27T09:00:00.000Z',
      createdBy: 'maya',
    },
  ],
};

/** The members an artifact is shared with, by member id (`Member.id`), as the server lists them. */
const members: Record<string, string[]> = { 'art-7': [MEMBER_IDS.maya, MEMBER_IDS.theo] };

const accounts: SharedAccountRow[] = [
  {
    id: 'acc-1',
    mine: true,
    priority: 0,
    limits: {},
    createdAt: '2026-10-10T09:00:00.000Z',
    provider: 'claude',
    label: 'Maya’s Claude Max',
    owner: 'maya',
    status: 'ready',
    sharedWith: ['theo', 'samir'],
    poolId: 'billing',
    dailyAllocationUsd: 40,
    paused: false,
  },
  {
    id: 'acc-2',
    mine: false,
    priority: 0,
    limits: {},
    createdAt: '2026-10-12T09:00:00.000Z',
    provider: 'codex',
    label: 'Theo’s ChatGPT Pro',
    owner: 'theo',
    status: 'disabled',
    sharedWith: ['maya'],
    paused: true,
  },
  // Brought in by the TeamCode import: TeamCode may still renew its tokens, so it waits for its handover.
  {
    id: 'acc-3',
    mine: true,
    priority: 0,
    limits: {},
    createdAt: '2026-10-20T09:00:00.000Z',
    provider: 'claude',
    label: 'Team Max (TeamCode)',
    owner: 'maya',
    status: 'pending_handover',
    refreshOwnership: 'pending_handover',
    sharedWith: ['theo'],
    paused: false,
  },
];

export function initialArtifacts(): ArtifactResponse[] {
  return structuredClone(artifacts);
}
export function initialArtifactVersions(): Record<string, ArtifactVersionResponse[]> {
  return structuredClone(versions);
}
export function initialArtifactMembers(): Record<string, string[]> {
  return structuredClone(members);
}
export function initialSharedAccounts(): SharedAccountRow[] {
  return structuredClone(accounts);
}

/** A member id the groups still name: Jo, who left the organization after joining Platform. */
export const LEFT_MEMBER = '8cbe4f6d-7091-4cd3-8e5f-60718293a4b5';

/**
 * Two groups of the demo organization: Platform lends Maya's Claude Max, and Samir is paused in it for three days
 * from when the demo opened; Billing lends nothing.
 */
export function initialGroups(opened: number): MockGroup[] {
  const orgId = initialOrganization().id;
  return [
    {
      id: groupId(1),
      orgId,
      name: 'Platform',
      members: ['theo', 'samir', LEFT_MEMBER],
      accounts: ['acc-1'],
      pauses: [{ login: 'samir', until: new Date(opened + 3 * 86_400_000).toISOString() }],
    },
    { id: groupId(2), orgId, name: 'Billing', members: ['maya', 'lena'], accounts: [], pauses: [] },
  ];
}
