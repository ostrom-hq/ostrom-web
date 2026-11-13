// SPDX-License-Identifier: Apache-2.0
import type { Receipt, Session } from '@gen/api/types.gen';

const SIGNATURE = 'ed25519;kid=4f2a9c1b;sha256=';

const sessions: Session[] = [
  {
    id: 'ses-7f3a',
    agent: 'claude-code',
    dev: 'theo',
    devVerified: true,
    devVia: 'github',
    repo: 'acme/billing-api',
    model: 'claude-opus-5-5',
    harnessVersion: '0.4.1',
    packageDigest: 'sha256:9e1d77c0',
    startedAt: '2026-10-30T07:12:00.000Z',
    lastSeenAt: '2026-10-30T07:58:00.000Z',
    gates: ['apr-merge-412'],
    tools: 214,
    costUsd: 3.42,
  },
  {
    id: 'ses-51c0',
    agent: 'codex',
    dev: 'maya',
    devVerified: true,
    devVia: 'github',
    repo: 'acme/billing-api',
    startedAt: '2026-10-30T06:40:00.000Z',
    gates: ['apr-deploy-88'],
  },
  {
    id: 'ses-2b9e',
    agent: 'claude-code',
    dev: 'samir',
    repo: 'acme/web',
    model: 'claude-sonnet-5',
    segment: 2,
    resumedFrom: 'ses-2b9d',
    previousReceiptId: 'rcpt-ses-2b9d',
    startedAt: '2026-10-29T14:02:00.000Z',
    endedAt: '2026-10-29T16:31:00.000Z',
    endedBy: 'samir',
    receiptId: 'rcpt-ses-2b9e',
    tools: 88,
    costUsd: 1.07,
    exitCode: 0,
  },
];

const receipts: Receipt[] = [
  {
    id: 'rcpt-apr-migration-7',
    subject: { kind: 'gate', id: 'apr-migration-7', digest: 'sha256:0c77aa19' },
    initiator: 'samir',
    agent: 'claude-code',
    model: 'claude-sonnet-5',
    rules: [{ id: 'R-12', digest: 'sha256:11aa' }],
    decisions: [
      { approvalId: 'apr-migration-7', by: 'maya', at: '2026-10-29T16:04:31.000Z', result: 'approved' },
    ],
    createdAt: '2026-10-29T16:04:31.000Z',
    signature: `${SIGNATURE}0c77aa19;sig=mock`,
  },
  {
    id: 'rcpt-ses-2b9e',
    subject: { kind: 'session', id: 'ses-2b9e', digest: 'sha256:7d01e5b2' },
    initiator: 'samir',
    agent: 'claude-code',
    model: 'claude-sonnet-5',
    rules: [
      { id: 'R-3', digest: 'sha256:33cc' },
      { id: 'R-12', digest: 'sha256:11aa' },
    ],
    decisions: [],
    costUsd: 1.07,
    package: { version: '0.4.1', digest: 'sha256:9e1d77c0' },
    nodes: [
      // Signed before receipts said where a check ran: it reads as the workstation's word.
      { id: 'n1', workflowId: 'wf-backend', kind: 'check', label: 'Tests pass', outcome: 'passed' },
      {
        id: 'n3',
        workflowId: 'wf-backend',
        kind: 'check',
        label: 'Lint',
        outcome: 'passed',
        attestation: 'ci',
      },
      {
        id: 'n2',
        workflowId: 'wf-backend',
        kind: 'gate',
        label: 'Merge to main',
        outcome: 'skipped',
        detail: 'No merge',
      },
    ],
    createdAt: '2026-10-29T16:31:02.000Z',
    signature: `${SIGNATURE}7d01e5b2;sig=mock`,
  },
  {
    id: 'rcpt-tampered',
    subject: { kind: 'workflow', id: 'wf-backend', digest: 'sha256:deadbeef' },
    initiator: 'lena',
    rules: [],
    decisions: [],
    createdAt: '2026-10-28T09:00:00.000Z',
    signature: 'ed25519;sha256=deadbeef;sig=tampered',
  },
];

export function initialSessions(): Session[] {
  return structuredClone(sessions);
}

export function initialReceipts(): Receipt[] {
  return structuredClone(receipts);
}
