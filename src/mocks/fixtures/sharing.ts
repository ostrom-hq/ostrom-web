// SPDX-License-Identifier: AGPL-3.0-only
import type { Artifact, ArtifactVersion, SharedAccount } from '@gen/api/types.gen';
import { MEMBER_IDS } from './organization';

const artifacts: Artifact[] = [
  {
    id: 'art-7',
    title: 'Billing API: latency study',
    owner: 'maya',
    access: 'personal',
    latestVersion: 3,
    url: 'https://app.ostrom.run/a/art-7',
    createdAt: '2026-10-27T09:00:00.000Z',
    updatedAt: '2026-10-29T18:40:00.000Z',
  },
  {
    id: 'art-5',
    title: 'Release checklist',
    owner: 'theo',
    access: 'team',
    latestVersion: 1,
    url: 'https://app.ostrom.run/a/art-5',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
  },
  {
    id: 'art-2',
    title: 'Draft: pricing page',
    owner: 'maya',
    access: 'personal',
    latestVersion: 1,
    url: 'javascript:alert(1)',
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
  },
];

const versions: Record<string, ArtifactVersion[]> = {
  'art-7': [
    {
      number: 3,
      files: ['index.html', 'chart.svg', 'data.json'],
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

const accounts: SharedAccount[] = [
  {
    id: 'acc-1',
    provider: 'anthropic',
    label: 'Maya’s Claude Max',
    owner: 'maya',
    status: 'active',
    sharedWith: ['theo', 'samir'],
    pool: 'billing',
    dailyAllocationUsd: 40,
    paused: false,
  },
  {
    id: 'acc-2',
    provider: 'openai',
    label: 'Theo’s ChatGPT Pro',
    owner: 'theo',
    status: 'expired',
    sharedWith: ['maya'],
    paused: true,
  },
];

export function initialArtifacts(): Artifact[] {
  return structuredClone(artifacts);
}
export function initialArtifactVersions(): Record<string, ArtifactVersion[]> {
  return structuredClone(versions);
}
export function initialArtifactMembers(): Record<string, string[]> {
  return structuredClone(members);
}
export function initialSharedAccounts(): SharedAccount[] {
  return structuredClone(accounts);
}
