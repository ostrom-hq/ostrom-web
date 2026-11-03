// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval, ApprovalCallerView, ApprovalQueue } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  changedOf,
  combineDecided,
  githubLinkOf,
  githubLinkRequired,
  linkRequiredOf,
  refusalOf,
} from './useYes';

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

describe('the GitHub link a yes waits for (Q-GATES-G1 a)', () => {
  const you = (rights: Partial<ApprovalCallerView>): ApprovalCallerView => ({
    login: 'maya',
    self: false,
    canApprove: false,
    ...rights,
  });
  const approval = (id: string): Approval => ({
    id,
    title: id,
    requestedFrom: 'owners',
    channel: 'console',
    status: 'pending',
    shownDigest: 'sha256:x',
  });

  it('reads a yes held for the link from the rights, and nothing else', () => {
    expect(githubLinkRequired(you({ reasonType: 'github_link_required' }))).toBe(true);
    expect(githubLinkRequired(you({ canApprove: true, reasonType: 'github_link_required' }))).toBe(false);
    expect(githubLinkRequired(you({ reasonType: 'self_approval_refused' }))).toBe(false);
    expect(githubLinkRequired(you({ reason: 'not an approver' }))).toBe(false);
    expect(githubLinkRequired(undefined)).toBe(false);
  });

  it('reads the 403 of a yes refused for want of the link', () => {
    const link = new ApiFailure('forbidden', 'link GitHub', 403, undefined, 'github_link_required');
    const self = new ApiFailure('forbidden', 'you asked', 403, undefined, 'self_approval_refused');
    expect([githubLinkOf(link), githubLinkOf(self), githubLinkOf(new Error('x'))]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('lists the waiting requests held for the link, none before the queue is read', () => {
    expect(linkRequiredOf(undefined).size).toBe(0);
    const queue: ApprovalQueue = {
      operator: 'maya',
      you: { login: 'maya', via: 'console' },
      pending: [
        { approval: approval('a'), you: you({ reasonType: 'github_link_required' }) },
        { approval: approval('b'), you: you({ canApprove: true }) },
      ],
      recent: [
        {
          approval: { ...approval('c'), status: 'approved' },
          you: you({ reasonType: 'github_link_required' }),
        },
      ],
    };
    expect([...linkRequiredOf(queue)]).toEqual(['a']);
  });
});
