// SPDX-License-Identifier: AGPL-3.0-only
import type { Me } from '@gen/api/types.gen';
import { meOf, viewerName } from './me';

describe('meOf', () => {
  it('reads a body, and nothing from an empty answer', () => {
    const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };
    expect(meOf(me)).toBe(me);
    expect(meOf(undefined)).toBeUndefined();
  });
});

describe('viewerName', () => {
  const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };

  it('names the person, or falls back to the login', () => {
    expect(viewerName(undefined)).toBeUndefined();
    expect(viewerName(me)).toBe('maya');
    expect(viewerName({ ...me, member: { login: 'maya', name: '', avatarUrl: '', role: 'approver' } })).toBe(
      'maya',
    );
    expect(
      viewerName({ ...me, member: { login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'approver' } }),
    ).toBe('Maya Lind (maya)');
  });
});
