// SPDX-License-Identifier: Apache-2.0
import type { Wait } from '@gen/api/types.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const at = (ms: number): string => new Date(ms).toISOString();

const BODY = `## Migration

The migration \`2026_11_add_ledger\` is ready on staging.

- It adds **two** tables and one index.
- Rolling back is *safe* until the backfill starts.

1. Read the [runbook](https://docs.acme.dev/runbooks/ledger)
2. Pick a window

> Nothing runs before you say so.

---

<script>window.stolen = true</script>
[not a link](javascript:alert(1))

\`\`\`sh
make migrate ENV=prod
\`\`\``;

/**
 * The demo's waits, newest first, as `GET /waits` lists them for the demo person (Maya): two asked of her by a
 * teammate's agent (one with every field type), one asked of Theo by her own agent, a cloud session's permission
 * request, and one of each end (answered, cancelled, ended without an answer). `now` is in ms.
 */
export function initialWaits(now: number): Wait[] {
  return [
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a01',
      kind: 'human_request',
      status: 'open',
      sessionId: 'ses-7f3a',
      assignee: MEMBER_IDS.maya,
      createdBy: MEMBER_IDS.samir,
      createdAt: at(now - 5 * 60_000),
      question: {
        title: 'Ship the ledger migration to production?',
        body: BODY,
        refs: [
          { kind: 'session', id: 'ses-7f3a', title: 'The migration session' },
          { kind: 'artifact', id: 'art-ledger-plan', title: 'Ledger plan' },
          { kind: 'url', url: 'https://github.com/acme/billing-api/pull/412', title: 'Pull request 412' },
          { kind: 'url', url: 'javascript:alert(1)', title: 'Not a link' },
          { kind: 'note' },
        ],
        fields: [
          { id: 'intro', type: 'info', label: 'Before you answer', help: 'Staging passed all 214 checks.' },
          { id: 'reason', type: 'text', label: 'Reason', help: 'Said to the agent.', maxLength: 40 },
          { id: 'notes', type: 'text', label: 'Notes', default: 'Go ahead' },
          {
            id: 'window',
            type: 'choice',
            label: 'Window',
            options: ['Tonight', 'Tomorrow'],
            allowOther: true,
            required: true,
            default: 'Tonight',
          },
          {
            id: 'regions',
            type: 'choice',
            label: 'Regions',
            options: ['eu', 'us', 'ap'],
            multiple: true,
            allowOther: true,
            default: ['eu', 'sa'],
          },
          { id: 'backfill', type: 'confirm', label: 'Run the backfill', default: true },
          { id: 'batch', type: 'number', label: 'Batch size', default: 500 },
          { id: 'on', type: 'date', label: 'Day', default: '2026-11-20' },
          { id: 'ticket', type: 'file', label: 'Screenshot' },
        ],
        actions: [
          { id: 'approve', label: 'Approve', style: 'primary', requires: ['reason'] },
          { id: 'later', label: 'Not now' },
          { id: 'reject', label: 'Reject', style: 'danger', requires: ['notes'] },
        ],
      },
    },
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a02',
      kind: 'human_request',
      status: 'open',
      assignee: MEMBER_IDS.maya,
      createdBy: MEMBER_IDS.samir,
      createdAt: at(now - 3 * 3_600_000),
      question: {
        title: 'Which region first?',
        fields: [{ id: 'region', type: 'choice', label: 'Region', options: ['eu', 'us'] }],
      },
    },
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a03',
      kind: 'human_request',
      status: 'open',
      sessionId: 'ses-51c0',
      assignee: MEMBER_IDS.theo,
      createdBy: 'maya',
      createdAt: at(now - 5 * 3_600_000),
      question: { title: 'Does the billing team own the retry job?', body: 'Asked by your agent.' },
    },
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a04',
      kind: 'permission',
      status: 'open',
      sessionId: 'ses-51c0',
      assignee: MEMBER_IDS.maya,
      createdBy: MEMBER_IDS.maya,
      createdAt: at(now - 6 * 3_600_000),
      question: { title: 'Allow Bash(rm -rf build)?' },
    },
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a05',
      kind: 'human_request',
      status: 'resolved',
      assignee: MEMBER_IDS.maya,
      createdBy: MEMBER_IDS.samir,
      createdAt: at(now - 26 * 3_600_000),
      resolvedAt: at(now - 25 * 3_600_000),
      question: {
        title: 'Rotate the staging key?',
        fields: [{ id: 'when', type: 'text', label: 'When' }],
        actions: [{ id: 'yes', label: 'Rotate', style: 'primary' }],
      },
      answer: {
        action: 'yes',
        values: { when: 'Friday', tags: ['a', 'b'], ok: true, size: 3, extra: { deep: 1 } },
        author: MEMBER_IDS.maya,
        answeredAt: at(now - 25 * 3_600_000),
      },
    },
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a06',
      kind: 'human_request',
      status: 'cancelled',
      assignee: MEMBER_IDS.maya,
      createdBy: MEMBER_IDS.samir,
      createdAt: at(now - 30 * 3_600_000),
      resolvedAt: at(now - 29 * 3_600_000),
      question: { title: 'Pick a logo' },
    },
    {
      id: '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a07',
      kind: 'time',
      status: 'resolved',
      assignee: MEMBER_IDS.maya,
      createdAt: at(now - 48 * 3_600_000),
      resolvedAt: at(now - 47 * 3_600_000),
      question: { title: 'Wake me in an hour' },
    },
  ];
}
