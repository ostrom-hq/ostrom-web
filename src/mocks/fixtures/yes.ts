import type { Ask, Viewer } from '@gen/api/types.gen';

export const viewer: Viewer = { login: 'maya', via: 'operator-account', name: 'Maya Lind' };

const mergeAsk: Ask = {
  id: 'ask-merge-412',
  status: 'pending',
  title: 'Merge pull request #412 into main',
  channel: 'console',
  requestedAt: '2026-10-30T07:42:10.000Z',
  who: { dev: 'theo', agent: 'claude-code', model: 'claude-opus-5-5', session: 'ses-7f3a' },
  what: {
    action: 'Merge a pull request',
    command: 'gh pr merge 412 --squash',
    repo: 'acme/billing-api',
    harness: 'pkg-2026.10.30-3',
  },
  gate: {
    label: 'Merge to main',
    workflow: 'Ship a backend change',
    workflowId: 'wf-backend',
    approvers: ['maya', 'samir'],
  },
  rules: [
    {
      id: 'R-12',
      statement: 'Every invoice change ships with a migration test.',
      strength: 'required',
      status: 'accepted',
    },
    { id: 'R-31', statement: 'No direct push to main.', strength: 'required', status: 'accepted' },
  ],
  commits: [
    { sha: '9c1e4b2a7d', title: 'fix(invoices): round VAT per line, not per total', author: 'theo' },
    { sha: '3fa0d81c55', title: 'test(invoices): cover the 0.005 rounding case', author: 'theo' },
  ],
  diff: 'invoices/vat.kt  +18 -6\ninvoices/VatTest.kt  +42 -0',
  evidence: [
    { label: 'CI', value: 'green (12 checks)', url: 'https://github.com/acme/billing-api/pull/412/checks' },
  ],
  shownDigest: 'sha256:5b0c2f8e',
  askedBy: ['theo'],
  askedVia: ['hook', 'ci'],
  pr: { number: '412', sha: '9c1e4b2a7d' },
  you: { login: 'maya', self: false, canApprove: true },
};

const deployAsk: Ask = {
  id: 'ask-deploy-88',
  status: 'pending',
  title: 'Deploy billing-api 2.14.0 to production',
  channel: 'console',
  requestedAt: '2026-10-30T07:55:00.000Z',
  who: { dev: 'maya', agent: 'codex', session: 'ses-11b2' },
  what: { action: 'Deploy', command: 'make deploy ENV=prod', repo: 'acme/billing-api' },
  gate: {
    label: 'Production deploy',
    workflow: 'Release',
    workflowId: 'wf-release',
    approvers: ['maya', 'samir'],
  },
  rules: [],
  evidence: [],
  shownDigest: 'sha256:a91d0e44',
  askedBy: ['maya'],
  you: {
    login: 'maya',
    self: true,
    canApprove: false,
    reason: 'You asked for this action: samir has to approve it.',
  },
};

const decidedAsk: Ask = {
  id: 'ask-migration-7',
  status: 'approved',
  title: 'Run migration 0042_add_credit_notes',
  channel: 'slack',
  requestedAt: '2026-10-29T16:02:00.000Z',
  decidedBy: 'maya',
  decidedAt: '2026-10-29T16:04:31.000Z',
  who: { dev: 'samir', agent: 'claude-code' },
  what: { action: 'Database migration', command: 'flyway migrate', repo: 'acme/billing-api' },
  rules: [],
  evidence: [],
  shownDigest: 'sha256:0c77aa19',
  askedBy: ['samir'],
  receipt: {
    id: 'rcpt-20261029-0042',
    kind: 'gate',
    signature: 'ed25519;kid=4f2a9c1b;sha256=0c77aa19;sig=MEUCIQ',
    createdAt: '2026-10-29T16:04:31.000Z',
    valid: true,
    digest: 'sha256:0c77aa19',
    by: 'maya',
    result: 'approved',
  },
};

export function initialAsks(): Ask[] {
  return [structuredClone(mergeAsk), structuredClone(deployAsk), structuredClone(decidedAsk)];
}
