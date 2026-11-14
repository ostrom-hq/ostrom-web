// SPDX-License-Identifier: Apache-2.0
import type { Workflow } from '@gen/api/types.gen';

const workflows: Workflow[] = [
  {
    id: 'wf-backend',
    name: 'Backend changes',
    domain: 'acme/billing-api',
    description: 'From a branch to production for the billing API.',
    version: 7,
    status: 'accepted',
    foundAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-28T15:20:00.000Z',
    updatedBy: 'maya',
    start: 'n-start',
    nodes: [
      { id: 'n-start', kind: 'trigger', label: 'A branch is pushed' },
      {
        id: 'n-tests',
        kind: 'check',
        label: 'Tests pass',
        detail: 'pnpm test on the pushed commit',
        ruleIds: ['R-3'],
      },
      {
        id: 'n-fix',
        kind: 'agent',
        label: 'The agent fixes the failing tests',
        run: { repository: 'acme/billing-api' },
      },
      {
        id: 'n-merge',
        kind: 'gate',
        label: 'Merge to main',
        owner: 'billing-owners',
        approvers: ['maya', 'samir'],
        approverReason: 'Owners of acme/billing-api',
        actions: [
          {
            class: 'merge-main',
            label: 'Merge into main',
            patterns: ['gh pr merge'],
            repos: ['acme/billing-api'],
          },
        ],
        ruleIds: ['R-12'],
      },
      {
        id: 'n-deploy',
        kind: 'gate',
        label: 'Deploy to production',
        owner: 'release-owners',
        approvers: ['samir'],
        when: { hours: '09:00-18:00', days: 'mon-fri', risk: 'high' },
        actions: [
          {
            class: 'deploy',
            label: 'Deploy',
            patterns: ['helm upgrade', 'kubectl apply'],
            repos: ['acme/billing-api'],
          },
        ],
      },
    ],
    edges: [
      { from: 'n-start', to: 'n-tests' },
      { from: 'n-tests', to: 'n-merge', on: 'success' },
      { from: 'n-tests', to: 'n-fix', on: 'failure', label: 'Tests fail' },
      { from: 'n-fix', to: 'n-tests' },
      { from: 'n-merge', to: 'n-deploy' },
      { from: 'n-deploy', to: null },
    ],
  },
  {
    id: 'wf-migrations',
    name: 'Database migrations',
    domain: 'acme/billing-api',
    status: 'proposed',
    foundAt: '2026-10-20T08:00:00.000Z',
    nodes: [
      {
        id: 'm-gate',
        kind: 'gate',
        label: 'Run a migration',
        owner: 'billing-owners',
        approvers: ['maya'],
        actions: [
          {
            class: 'migrate',
            label: 'Migrate',
            patterns: ['prisma migrate deploy'],
            repos: ['acme/billing-api'],
          },
        ],
      },
      {
        id: 'm-orphan',
        kind: 'gate',
        label: 'Drop a table',
        actions: [
          {
            class: 'drop-table',
            label: 'Drop a table',
            patterns: ['DROP TABLE'],
            repos: ['acme/billing-api'],
          },
        ],
      },
    ],
    edges: [{ from: 'm-gate', to: 'm-orphan' }],
  },
  {
    id: 'wf-release',
    name: 'Release notes',
    domain: 'acme/billing-api',
    description: 'An agent drafts the release notes and hands in the pull request.',
    version: 2,
    status: 'accepted',
    foundAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-29T09:00:00.000Z',
    updatedBy: 'maya',
    start: 'r-start',
    sessionMode: 'same',
    limits: { maxNodes: 50, maxVisits: 100 },
    inputs: [
      { id: 'tag', label: 'Release tag', required: true, maxLength: 40 },
      { id: 'audience', label: 'Audience', default: 'customers' },
    ],
    nodes: [
      { id: 'r-start', kind: 'trigger', label: 'A release is cut' },
      {
        id: 'r-draft',
        kind: 'agent',
        label: 'The agent drafts the notes',
        run: {
          instructions: 'Draft the release notes for the tag and open a pull request.',
          deliverable: { type: 'url', label: 'The pull request', domain: 'github.com' },
        },
      },
    ],
    edges: [
      { from: 'r-start', to: 'r-draft' },
      { from: 'r-draft', to: null },
    ],
  },
  {
    id: 'wf-legacy',
    name: 'Legacy hotfix',
    domain: 'acme/billing-api',
    version: 1,
    status: 'rejected',
    foundAt: '2026-10-10T08:00:00.000Z',
    nodes: [{ id: 'l-start', kind: 'trigger', label: 'A hotfix is asked' }],
    edges: [{ from: 'l-start', to: null }],
  },
];

export function initialWorkflows(): Workflow[] {
  return structuredClone(workflows);
}
