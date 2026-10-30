// SPDX-License-Identifier: AGPL-3.0-only
import type { Decision, Rule } from '@gen/api/types.gen';

const rules: Rule[] = [
  {
    id: 'R-12',
    statement: 'A pull request into main needs one review from an owner of the repository.',
    why: 'Every merge to main of the last 90 days had one, and the two without were reverted.',
    output: 'gate',
    group: 'Reviews',
    scope: ['acme/billing-api', 'acme/web'],
    sources: [
      { kind: 'pr', ref: 'acme/billing-api#398', url: 'https://github.com/acme/billing-api/pull/398' },
      { kind: 'file', ref: 'CODEOWNERS', url: 'javascript:alert(1)' },
      { kind: 'review', ref: 'acme/web#77' },
    ],
    strength: 'required',
    confidence: 0.96,
    status: 'proposed',
    foundBy: 'deep-pass',
    foundAt: '2026-10-29T21:10:00.000Z',
  },
  {
    id: 'R-3',
    statement: 'Run `pnpm test` before pushing.',
    output: 'check',
    group: 'Tests',
    strength: 'recommended',
    confidence: 0.71,
    status: 'proposed',
    foundBy: 'deep-pass',
    foundAt: '2026-10-29T21:12:00.000Z',
  },
  {
    id: 'R-7',
    statement: 'Migrations run only from the release pipeline.',
    output: 'gate',
    group: 'Releases',
    scope: ['acme/billing-api'],
    strength: 'required',
    confidence: 0.92,
    status: 'accepted',
    foundBy: 'deep-pass',
    foundAt: '2026-10-28T10:00:00.000Z',
    decidedBy: 'lena',
    decidedAt: '2026-10-28T16:00:00.000Z',
  },
  {
    id: 'R-9',
    statement: 'Commit messages are in French.',
    output: 'note',
    group: 'Style',
    strength: 'recommended',
    confidence: 0.4,
    status: 'rejected',
    foundBy: 'deep-pass',
    foundAt: '2026-10-28T10:05:00.000Z',
    decidedBy: 'maya',
    decidedAt: '2026-10-28T16:05:00.000Z',
  },
];

const decisions: Decision[] = [
  {
    id: 'dec-2',
    at: '2026-10-28T16:05:00.000Z',
    by: 'maya',
    subject: { kind: 'rule', id: 'R-9', label: 'Commit messages are in French.' },
    action: 'rejected',
    receiptId: 'rcpt-dec-2',
  },
  {
    id: 'dec-1',
    at: '2026-10-28T16:00:00.000Z',
    by: 'lena',
    subject: { kind: 'rule', id: 'R-7' },
    action: 'accepted',
    receiptId: 'rcpt-dec-1',
  },
];

export function initialRules(): Rule[] {
  return structuredClone(rules);
}

/** Newest first, as the server lists them. */
export function initialDecisions(): Decision[] {
  return structuredClone(decisions);
}
