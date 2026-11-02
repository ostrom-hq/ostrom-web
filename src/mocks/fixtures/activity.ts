// SPDX-License-Identifier: AGPL-3.0-only
import type { ActivityItem } from '@gen/api/types.gen';

/** What happened in Acme, newest first, worded as the server words its summaries (server#72). */
const items: ActivityItem[] = [
  {
    id: 'gate.requested:apr-merge-412',
    at: '2026-10-30T07:55:00.000Z',
    kind: 'gate.requested',
    actor: { kind: 'agent', name: 'claude-code' },
    summary: 'claude-code asked for a yes: Merge PR #412 into main',
    approvalId: 'apr-merge-412',
    gateId: 'apr-merge-412',
  },
  {
    id: 'session.started:ses-7f3a',
    at: '2026-10-30T07:12:00.000Z',
    kind: 'session.started',
    actor: { kind: 'agent', name: 'claude-code' },
    summary: 'theo started a claude-code session in acme/billing-api',
    repo: 'acme/billing-api',
    sessionId: 'ses-7f3a',
  },
  {
    id: 'session.started:ses-51c0',
    at: '2026-10-30T06:40:00.000Z',
    kind: 'session.started',
    actor: { kind: 'agent', name: 'codex' },
    summary: 'maya started a codex session in acme/billing-api',
    repo: 'acme/billing-api',
    sessionId: 'ses-51c0',
  },
  {
    id: 'workflow.changed:dec-wf-release',
    at: '2026-10-29T17:20:00.000Z',
    kind: 'workflow.changed',
    actor: { kind: 'person', name: 'maya' },
    summary: 'maya changed the workflow release',
  },
  {
    id: 'session.ended:ses-2b9e',
    at: '2026-10-29T16:31:00.000Z',
    kind: 'session.ended',
    actor: { kind: 'agent', name: 'claude-code' },
    summary: 'samir’s claude-code session ended in acme/web',
    repo: 'acme/web',
    costUsd: 1.07,
    sessionId: 'ses-2b9e',
  },
  {
    id: 'gate.decided:apr-deploy-88',
    at: '2026-10-29T15:05:00.000Z',
    kind: 'gate.decided',
    actor: { kind: 'person', name: 'maya' },
    summary: 'maya said yes to: Deploy billing-api 2.14.0 to production',
    approvalId: 'apr-deploy-88',
    gateId: 'apr-deploy-88',
  },
  {
    id: 'session.started:ses-2b9e',
    at: '2026-10-29T14:02:00.000Z',
    kind: 'session.started',
    actor: { kind: 'agent', name: 'claude-code' },
    summary: 'samir started a claude-code session in acme/web',
    repo: 'acme/web',
    sessionId: 'ses-2b9e',
  },
  {
    id: 'gate.decided:apr-migration-7',
    at: '2026-10-28T11:40:00.000Z',
    kind: 'gate.decided',
    actor: { kind: 'person', name: 'theo' },
    summary: 'theo said no to: Run migration 0042_add_credit_notes',
    approvalId: 'apr-migration-7',
    gateId: 'apr-migration-7',
  },
];

export function initialActivity(): ActivityItem[] {
  return items.map((item) => ({ ...item, actor: { ...item.actor } }));
}
