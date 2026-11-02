// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { changedOf, combineDecided, refusalOf } from './useYes';

describe('refusalOf and changedOf', () => {
  it('read a 403 as a refusal and a shown-digest 409 as a change', () => {
    const forbidden = new ApiFailure(
      'forbidden',
      'samir has to approve it',
      403,
      undefined,
      'self_approval_refused',
    );
    const changed = new ApiFailure('conflict', 'changed', 409, undefined, 'shown_digest_mismatch');
    expect([refusalOf(forbidden), changedOf(forbidden)]).toEqual(['samir has to approve it', false]);
    expect([refusalOf(changed), changedOf(changed)]).toEqual([undefined, true]);
    expect([refusalOf(new Error('x')), changedOf(new Error('x'))]).toEqual([undefined, false]);
  });
});

describe('combineDecided', () => {
  const at = (id: string, decidedAt?: string, expiresAt?: string): Approval => ({
    id,
    title: id,
    requestedFrom: 'owners',
    channel: 'console',
    status: 'approved',
    shownDigest: 'sha256:x',
    ...(decidedAt === undefined ? {} : { decidedAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  });

  it('waits until a page is loaded', () => {
    expect(combineDecided([{ data: undefined, error: null }])).toEqual({
      decided: undefined,
      error: undefined,
    });
  });

  it('merges the pages, latest decision (or expiry) first, and passes the first error on', () => {
    const boom = new Error('boom');
    const result = combineDecided([
      { data: { items: [at('a', '2026-10-30T08:00:00Z'), at('b')] }, error: null },
      { data: { items: [at('c', undefined, '2026-10-30T09:00:00Z')] }, error: null },
      { data: undefined, error: boom },
    ]);
    expect(result.decided?.map((approval) => approval.id)).toEqual(['c', 'a', 'b']);
    expect(result.error).toBe(boom);
  });
});
