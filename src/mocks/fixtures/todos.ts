// SPDX-License-Identifier: AGPL-3.0-only
import type { Todo } from '@gen/api/types.gen';

/** The demo's todos, by session: the first session's agent keeps a plan of nine items, one dropped along the way. */
export function initialTodos(): Record<string, Todo> {
  return {
    'ses-7f3a': {
      id: '9c1e47d2-5b3a-4f60-8a7e-2d4c6b8a0e13',
      sessionId: 'ses-7f3a',
      reference:
        'Move billing-api to the new invoice schema: the plan is in artifact art-invoice-plan, the request is “migrate invoices without downtime”.',
      status: 'active',
      stall: 1,
      createdAt: '2026-10-30T07:14:00.000Z',
      updatedAt: '2026-10-30T07:57:00.000Z',
      nextItemId: 'backfill',
      items: [
        item('schema', 'Write the migration', 'done', {
          proof: {
            at: '2026-10-30T07:30:00.000Z',
            passed: true,
            text: 'pull request merged: acme/billing-api#412',
          },
        }),
        item('dual-write', 'Write both schemas', 'done', {
          origin: 'discovered',
          originReason: 'The old reader still runs',
          unverified: true,
          doneWhen: {
            text: 'Both schemas are written on every save',
            checks: [{ type: 'attested', what: 'the agent saw both tables fill' }],
          },
          proof: { at: '2026-10-30T07:41:00.000Z', text: 'attested by the agent' },
        }),
        item('reader', 'Read from the new schema', 'doing', {
          proof: {
            at: '2026-10-30T07:52:00.000Z',
            passed: false,
            text: 'the pull request is not merged yet',
          },
        }),
        item('backfill', 'Backfill the old invoices', 'todo'),
        item('legacy', 'Remove the legacy table', 'dropped', { dropReason: 'The owner keeps it for audits' }),
        item('release', 'Ship the release', 'drop_requested', {
          dropReason: 'Waiting for the freeze to end',
        }),
      ],
      hookEvents: [
        { at: '2026-10-30T07:45:00.000Z', kind: 'blocked', text: 'Blocked: 2 items open' },
        { at: '2026-10-30T07:50:00.000Z', kind: 'hook_error', text: 'The relay did not answer in time' },
      ],
    },
  };
}

function item(
  id: string,
  name: string,
  status: Todo['items'][number]['status'],
  more: Partial<Todo['items'][number]> = {},
): Todo['items'][number] {
  return {
    id,
    name,
    description: `${name}: what to do, where, and why, in enough words for another agent to take it over alone. Out of scope: the other items of the plan.`,
    doneWhen: {
      text: `${name} is merged and the pipeline is green`,
      checks: [
        { type: 'pr_merged', repo: 'acme/billing-api' },
        { type: 'ci_green', repo: 'acme/billing-api', of: id },
      ],
    },
    origin: 'plan',
    status,
    ...more,
  };
}
