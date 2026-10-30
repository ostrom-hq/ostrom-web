// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { approvalTone, askedByViewer, checksSummary, shortSha, stillOpen } from './model';

describe('stillOpen', () => {
  it('is open until the request is decided', () => {
    expect([stillOpen(undefined), stillOpen(null), stillOpen({}), stillOpen({ status: 'pending' })]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([stillOpen({ status: 'approved' }), stillOpen({ status: 'expired' })]).toEqual([false, false]);
  });
});

const base: Approval = {
  id: 'a',
  title: 'Run a script',
  requestedFrom: 'owners',
  channel: 'console',
  status: 'pending',
  shownDigest: 'sha256:x',
  askedBy: ['Theo'],
};

describe('approvalTone', () => {
  it('waits for the viewer, or says the viewer asked', () => {
    expect(approvalTone(base, 'maya')).toBe('waiting-you');
    expect(approvalTone(base, 'theo')).toBe('asked-by-you');
    expect(approvalTone(base, undefined)).toBe('waiting-you');
  });

  it('names the decided states', () => {
    expect(approvalTone({ ...base, status: 'approved' }, 'maya')).toBe('approved');
    expect(approvalTone({ ...base, status: 'rejected' }, 'maya')).toBe('refused');
    expect(approvalTone({ ...base, status: 'expired' }, 'maya')).toBe('expired');
  });
});

describe('askedByViewer', () => {
  it('reads a missing asker list as nobody', () => {
    const anonymous = structuredClone(base);
    delete anonymous.askedBy;
    expect(askedByViewer(anonymous, 'theo')).toBe(false);
  });
});

describe('checksSummary', () => {
  it('counts passed and failed checks', () => {
    expect(
      checksSummary([
        { name: 'a', state: 'success' },
        { name: 'b', state: 'failure' },
        { name: 'c', state: 'pending' },
      ]),
    ).toEqual({ passed: 1, failed: 1, total: 3 });
  });
});

describe('labels', () => {
  it('shortens a sha', () => {
    expect(shortSha('9c1e4b2a7d')).toBe('9c1e4b2');
  });
});
