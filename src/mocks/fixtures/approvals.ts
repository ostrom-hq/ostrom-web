// SPDX-License-Identifier: Apache-2.0
import type { Approval, ApprovalViewResponse, GatePullRequest, MeResponse } from '@gen/api/types.gen';
import { MEMBER_IDS } from './organization';

/** The person signed in to the demo console. */
export const me: MeResponse = {
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
  evidence: [{ label: 'Pull request', value: '#412', url: 'https://github.com/acme/billing-api/pull/412' }],
  requestedFrom: 'billing-owners',
  workflowId: 'wf-backend',
  channel: 'console',
  status: 'pending',
  shownDigest: 'sha256:5b0c2f8e',
  askedBy: ['theo'],
};

const deploy: Approval = {
  id: 'apr-deploy-88',
  title: 'Deploy billing-api 2.14.0 to production',
  repo: 'acme/billing-api',
  sha: 'a91d0e4400000000000000000000000000000000',
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

/** What an approval's view says about the action behind it: the gate class asked for, and the pull request if any. */
const CONTEXT: Readonly<Record<string, { action: string; pr?: GatePullRequest }>> = {
  'apr-merge-412': {
    action: 'merge',
    pr: { number: '412', sha: '9c1e4b2a7d0f5e3c8b6a9d1e2f3a4b5c6d7e8f90', owner: 'theo' },
  },
  'apr-deploy-88': { action: 'deploy' },
  'apr-migration-7': { action: 'migrate' },
};

/** The parts of an approval's view that the approval itself does not hold (`who`, `what`, `pr`, `askedVia`). */
export function approvalContext(
  approval: Approval,
): Pick<ApprovalViewResponse, 'who' | 'what' | 'pr' | 'askedVia'> {
  const context = CONTEXT[approval.id];
  return {
    who: { dev: approval.askedBy?.[0] ?? null },
    what: { action: context?.action ?? 'gate', repo: approval.repo ?? null },
    ...(context?.pr === undefined ? {} : { pr: context.pr }),
    askedVia: [approval.channel],
  };
}
