// SPDX-License-Identifier: AGPL-3.0-only
import type { Me } from '@gen/api/types.gen';
import { meInOrgOptions, meOf, signedInName, viewerName } from './me';

describe('meOf', () => {
  it('reads a body, and nothing from an empty answer', () => {
    const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };
    expect(meOf(me)).toBe(me);
    expect(meOf(undefined)).toBeUndefined();
    expect(meOf(null)).toBeUndefined();
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

describe('meInOrgOptions', () => {
  it('names the organization in the header and the cache key, or reads who is signed in only', () => {
    const named = meInOrgOptions('org-acme').queryKey[0];
    expect(named.headers).toEqual({ 'Ostrom-Org': 'org-acme' });
    expect(meInOrgOptions(undefined).queryKey[0]).not.toHaveProperty('headers');
  });
});

describe('signedInName', () => {
  it('names the member, or gives the login', () => {
    const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };
    expect(signedInName(me)).toBe('maya');
    expect(
      signedInName({
        ...me,
        member: { id: MAYA, login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'billing' },
      }),
    ).toBe('Maya Lind (maya)');
  });
});
