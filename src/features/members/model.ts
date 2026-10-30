// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, MemberRole } from '@gen/api/types.gen';

/** The roles a person can be given; `invited` is a state the server sets until the invitation is accepted. */
export const ASSIGNABLE_ROLES = [
  'owner',
  'admin',
  'approver',
  'member',
] as const satisfies readonly MemberRole[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** The roles an invitation can carry: the server refuses `owner` (and `invited`, a state). */
export const INVITABLE_ROLES = ['admin', 'approver', 'member'] as const satisfies readonly AssignableRole[];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const ORDER: Readonly<Record<MemberRole, number>> = {
  owner: 0,
  admin: 1,
  approver: 2,
  member: 3,
  invited: 4,
};

export function displayName(member: Member): string {
  return member.name === undefined || member.name === '' ? member.login : member.name;
}

/** Owners first, invitations last, then by name: the people who decide are the first ones read. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort((a, b) => {
    const byRole = ORDER[a.role] - ORDER[b.role];
    return byRole !== 0 ? byRole : displayName(a).localeCompare(displayName(b), 'en');
  });
}

export interface ParsedInvites {
  readonly logins: readonly string[];
  readonly invalid: readonly string[];
}

/**
 * A light check, the server has the last word: letters, digits, single inner hyphens, and the underscore of the
 * managed users of GitHub Enterprise (`ana_acme`), 100 characters at most.
 */
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d_]|-(?=[a-z\d_])){0,99}$/;

/** What a person typed (commas, spaces or lines, `@` allowed), as distinct GitHub logins and what is not one. */
export function parseInvites(text: string): ParsedInvites {
  const parts = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((part) => part.replace(/^@/, '').toLowerCase())
        .filter((part) => part !== ''),
    ),
  ];
  return {
    logins: parts.filter((part) => GITHUB_LOGIN.test(part)),
    invalid: parts.filter((part) => !GITHUB_LOGIN.test(part)),
  };
}
