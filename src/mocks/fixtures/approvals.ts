// SPDX-License-Identifier: Apache-2.0
import type { Approval, Me } from '@gen/api/types.gen';
import { MEMBER_IDS } from './organization';

/** The person signed in to the demo console. */
export const me: Me = {
  dev: { login: 'maya', verified: true, via: 'github' },
  member: { id: MEMBER_IDS.maya, login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'admin' },
  capabilities: [],
};

const merge: Approval = {
  id: 'apr-merge-412',
  title: 'Merge PR #412 into main',
  repo: 'acme/billing-api',
  sha: '9c1e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6d7e8f90',
  commits: ['9c1e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6d7e8f90', '3fa0d81c55e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6'],
  commitDetails: [
    {
      sha: '9c1e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6d7e8f90',
      title: 'fix(invoices): round VAT per line',
      author: 'theo',
    },
    {
      sha: '3fa0d81c55e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6',
      title: 'test(invoices): cover the 0.005 rounding case',
      author: 'theo',
      url: 'https://github.com/acme/billing-api/commit/3fa0d81c55',
    },
  ],
  checks: [
    { name: 'test', state: 'success', url: 'https://github.com/acme/billing-api/actions/runs/1' },
    { name: 'lint', state: 'success' },
    { name: 'e2e', state: 'pending' },
  ],
  evidence: [{ label: 'Pull request', value: '#412', url: 'https://github.com/acme/billing-api/pull/412' }],
  action: {
    kind: 'merge',
    repo: 'acme/billing-api',
    ref: 'main',
    headSha: '9c1e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6d7e8f90',
    baseSha: '1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e',
    risk: 'low',
  },
  diffStats: { files: 3, additions: 42, deletions: 7 },
  diffTruncated: false,
  requestedFrom: 'billing-owners',
  workflowId: 'wf-backend',
  channel: 'console',
  status: 'pending',
  shownDigest: 'sha256:5b0c2f8e',
  askedBy: ['theo'],
  expiresAt: '2026-10-30T18:00:00.000Z',
};

const deploy: Approval = {
  id: 'apr-deploy-88',
  title: 'Deploy billing-api 2.14.0 to production',
  repo: 'acme/billing-api',
  sha: 'a91d0e4400000000000000000000000000000000',
  checks: [{ name: 'smoke', state: 'failure' }],
  action: {
    kind: 'deploy',
    repo: 'acme/billing-api',
    ref: 'production',
    headSha: 'a91d0e4400000000000000000000000000000000',
    risk: 'high',
  },
  diffStats: { files: 1, additions: 1, deletions: 1 },
  diffTruncated: true,
  requestedFrom: 'release-owners',
  channel: 'slack',
  status: 'pending',
  shownDigest: 'sha256:a91d0e44',
  askedBy: ['maya'],
};

const migration: Approval = {
  id: 'apr-migration-7',
  title: 'Run migration 0042_add_credit_notes',
  repo: 'acme/billing-api',
  requestedFrom: 'billing-owners',
  channel: 'console',
  status: 'approved',
  decidedBy: 'maya',
  decidedAt: '2026-10-29T16:04:31.000Z',
  shownDigest: 'sha256:0c77aa19',
  askedBy: ['samir'],
};

/** Who may answer each demo approval: the mock applies the server's self-approval rule with it. */
export function initialApprovers(): Record<string, readonly string[]> {
  return { [merge.id]: ['maya', 'samir'], [deploy.id]: ['maya', 'samir'], [migration.id]: ['maya'] };
}

export function initialApprovals(): Approval[] {
  return [structuredClone(merge), structuredClone(deploy), structuredClone(migration)];
}
