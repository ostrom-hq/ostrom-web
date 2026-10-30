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

/** GitHub's own rule: letters, digits and single inner hyphens, 39 characters at most. */
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/;

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
