// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkflowRun } from '@gen/api/types.gen';

/** Acme's runs, newest first: one running in a session, one cancelled, one finished, one failed. */
const runs: WorkflowRun[] = [
  {
    id: 'run-backend-3',
    workflowId: 'wf-backend',
    workflowName: 'Backend changes',
    workflowVersion: 7,
    status: 'running',
    startedBy: 'maya',
    source: 'manual',
    inputs: {},
    currentNodeId: 'n-tests',
    sessionId: 'ses-7f3a',
    startedAt: '2026-10-30T07:50:00.000Z',
  },
  {
    id: 'run-migrations-1',
    workflowId: 'wf-migrations',
    workflowName: 'Database migrations',
    workflowVersion: 1,
    status: 'cancelled',
    startedBy: 'lena',
    source: 'manual',
    startedAt: '2026-10-30T07:00:00.000Z',
    endedAt: '2026-10-30T07:03:00.000Z',
  },
  {
    id: 'run-backend-2',
    workflowId: 'wf-backend',
    workflowName: 'Backend changes',
    workflowVersion: 7,
    status: 'succeeded',
    startedBy: 'lena',
    source: 'automation',
    automationId: 'auto-nightly',
    startedAt: '2026-10-29T15:00:00.000Z',
    endedAt: '2026-10-29T15:42:00.000Z',
  },
  {
    id: 'run-backend-1',
    workflowId: 'wf-backend',
    workflowName: 'Backend changes',
    workflowVersion: 6,
    status: 'failed',
    startedBy: 'maya',
    source: 'manual',
    failure: 'Tests fail on main',
    startedAt: '2026-10-28T09:00:00.000Z',
    endedAt: '2026-10-28T09:12:00.000Z',
  },
];

export function initialWorkflowRuns(): WorkflowRun[] {
  return structuredClone(runs);
}
