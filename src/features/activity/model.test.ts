// SPDX-License-Identifier: Apache-2.0
import type { ActivityItem } from '@gen/api/types.gen';
import { ACTIVITY_KINDS, flatten, knownKind, linkOf, toneOf } from './model';

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'i',
    at: '2026-10-30T07:00:00.000Z',
    kind: 'workflow.changed',
    actor: { kind: 'person', name: 'maya' },
    summary: 's',
    ...over,
  };
}

describe('the activity model', () => {
  it('knows the contract’s kinds and no other', () => {
    for (const kind of ACTIVITY_KINDS) expect(knownKind(kind)).toBe(kind);
    expect(knownKind('repo.archived')).toBeUndefined();
  });

  it('gives each kind its tone', () => {
    expect(toneOf('check.failed')).toBe('danger');
    expect(toneOf('gate.requested')).toBe('warning');
    expect(toneOf('check.passed')).toBe('success');
    expect(toneOf('session.started')).toBe('neutral');
    expect(toneOf(undefined)).toBe('neutral');
  });

  it('leads to the request first, then the session, else nowhere', () => {
    expect(linkOf(item({ approvalId: 'apr-1', sessionId: 'ses-1' }))).toEqual({
      to: '/yes/$approvalId',
      params: { approvalId: 'apr-1' },
    });
    expect(linkOf(item({ sessionId: 'ses-1' }))).toEqual({
      to: '/sessions/$sessionId',
      params: { sessionId: 'ses-1' },
    });
    expect(linkOf(item())).toBeUndefined();
  });

  it('puts the pages together, each line once', () => {
    expect(
      flatten([
        { items: [item({ id: 'a' }), item({ id: 'b' })] },
        { items: [item({ id: 'b' }), item({ id: 'c' })] },
      ]).map((line) => line.id),
    ).toEqual(['a', 'b', 'c']);
  });
});
