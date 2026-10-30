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

/** A member id, as the contract requires one (shared/ never imports the mocks). */
const MAYA = '3d6f9a1e-2b4c-4d8e-9f0a-1b2c3d4e5f60';

describe('viewerName', () => {
  const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };

  it('names the person, or falls back to the login', () => {
    expect(viewerName(undefined)).toBeUndefined();
    expect(viewerName(me)).toBe('maya');
    expect(
      viewerName({ ...me, member: { id: MAYA, login: 'maya', name: '', avatarUrl: '', role: 'approver' } }),
    ).toBe('maya');
    expect(
      viewerName({
        ...me,
        member: { id: MAYA, login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'approver' },
      }),
    ).toBe('Maya Lind (maya)');
  });
});
