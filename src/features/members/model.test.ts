// SPDX-License-Identifier: AGPL-3.0-only
import type { Invitation, OrgMember } from '@gen/api/types.gen';
import { displayName, parseInvites, sortInvitations, sortMembers } from './model';

const member = (login: string, role: string, name = ''): OrgMember => ({
  id: '3d6f9a1e-2b4c-4d8e-9f0a-1b2c3d4e5f60',
  login,
  name,
  role,
  avatarUrl: '',
  email: null,
  joinedAt: '2026-10-01T00:00:00Z',
});

const invitation = (id: string, email: string | null, createdAt: string): Invitation => ({
  id,
  email,
  role: 'member',
  createdAt,
  expiresAt: '2026-11-01T00:00:00Z',
  maxUses: email === null ? 10 : 1,
  uses: 0,
});

describe('displayName and sortMembers', () => {
  it('names a member, or falls back to the login', () => {
    expect(displayName(member('maya', 'admin', 'Maya Lind'))).toBe('Maya Lind');
    expect(displayName(member('theo', 'member'))).toBe('theo');
  });

  it('puts owners first, then admins, approvers, members, billing and an unknown role, then sorts by name', () => {
    const sorted = sortMembers([
      member('kim', 'auditor'),
      member('ines', 'billing'),
      member('zed', 'member'),
      member('amy', 'member'),
      member('sam', 'approver'),
      member('maya', 'admin'),
      member('lena', 'owner'),
    ]);
    expect(sorted.map((item) => item.login)).toEqual(['lena', 'maya', 'sam', 'amy', 'zed', 'ines', 'kim']);
  });
});

describe('sortInvitations', () => {
  it('lists addresses first, by address, then links, newest first', () => {
    const sorted = sortInvitations([
      invitation('old-link', null, '2026-10-01T00:00:00Z'),
      invitation('bo', 'bo@acme.dev', '2026-10-02T00:00:00Z'),
      invitation('new-link', null, '2026-10-03T00:00:00Z'),
      invitation('ana', 'ana@acme.dev', '2026-10-04T00:00:00Z'),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['ana', 'bo', 'new-link', 'old-link']);
  });
});

describe('parseInvites', () => {
  it('splits on commas, spaces, semicolons and lines, drops duplicates and sets aside what is not an address', () => {
    expect(parseInvites('Ana@Acme.dev, <bo@acme.dev>\nana@acme.dev  no.pe; theo@; @acme.dev')).toEqual({
      emails: ['ana@acme.dev', 'bo@acme.dev'],
      invalid: ['no.pe', 'theo@', '@acme.dev'],
    });
    expect(parseInvites('  ')).toEqual({ emails: [], invalid: [] });
  });
});
