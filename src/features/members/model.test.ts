// SPDX-License-Identifier: AGPL-3.0-only
import type { Member } from '@gen/api/types.gen';
import { displayName, parseInvites, sortMembers } from './model';

const member = (login: string, role: Member['role'], name?: string): Member =>
  name === undefined
    ? { id: `id-${login}`, login, role, avatarUrl: '' }
    : { id: `id-${login}`, login, role, avatarUrl: '', name };

describe('displayName and sortMembers', () => {
  it('names a member, or falls back to the login', () => {
    expect(displayName(member('maya', 'admin', 'Maya Lind'))).toBe('Maya Lind');
    expect(displayName(member('theo', 'member', ''))).toBe('theo');
    expect(displayName(member('theo', 'member'))).toBe('theo');
  });

  it('puts owners first, invitations last, then sorts by name', () => {
    const sorted = sortMembers([
      member('jo', 'invited'),
      member('zed', 'member'),
      member('amy', 'member'),
      member('lena', 'owner'),
    ]);
    expect(sorted.map((item) => item.login)).toEqual(['lena', 'amy', 'zed', 'jo']);
  });
});

describe('parseInvites', () => {
  it('splits on commas, spaces and lines, drops duplicates and sets aside what is not a GitHub login', () => {
    expect(parseInvites('@Ana, bo-dev\nana  no_pe; -x; @')).toEqual({
      logins: ['ana', 'bo-dev'],
      invalid: ['no_pe', '-x'],
    });
    expect(parseInvites('  ')).toEqual({ logins: [], invalid: [] });
  });
});
