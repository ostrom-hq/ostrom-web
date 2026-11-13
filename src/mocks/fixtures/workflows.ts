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
      { id: 'n-fix', kind: 'agent', label: 'The agent fixes the failing tests' },
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
];

export function initialWorkflows(): Workflow[] {
  return structuredClone(workflows);
}
