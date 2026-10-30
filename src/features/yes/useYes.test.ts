// SPDX-License-Identifier: AGPL-3.0-only
import type { Me } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { changedOf, failureOf, refusalOf, viewerName } from './useYes';

describe('failureOf', () => {
  it('passes errors through and wraps anything else', () => {
    const typed = new ApiFailure('server', 'HTTP 500', 500, undefined);
    const plain = new Error('boom');
    expect(failureOf(null)).toBeUndefined();
    expect(failureOf(undefined)).toBeUndefined();
    expect(failureOf(typed)).toBe(typed);
    expect(failureOf(plain)).toBe(plain);
    expect(failureOf('odd')?.message).toBe('odd');
  });
});

describe('refusalOf and changedOf', () => {
  it('read a 403 as a refusal and a shown-digest 409 as a change', () => {
    const forbidden = new ApiFailure('forbidden', 'samir has to approve it', 403, undefined, 'self_approval_refused');
    const changed = new ApiFailure('conflict', 'changed', 409, undefined, 'shown_digest_mismatch');
    expect([refusalOf(forbidden), changedOf(forbidden)]).toEqual(['samir has to approve it', false]);
    expect([refusalOf(changed), changedOf(changed)]).toEqual([undefined, true]);
    expect([refusalOf(new Error('x')), changedOf(new Error('x'))]).toEqual([undefined, false]);
  });
});

describe('viewerName', () => {
  const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };

  it('names the person, or falls back to the login', () => {
    expect(viewerName(undefined)).toBeUndefined();
    expect(viewerName(me)).toBe('maya');
    expect(viewerName({ ...me, member: { login: 'maya', name: '', avatarUrl: '', role: 'approver' } })).toBe('maya');
    expect(viewerName({ ...me, member: { login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'approver' } })).toBe(
      'Maya Lind (maya)',
    );
  });
});
