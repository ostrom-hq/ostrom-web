// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, MemberRole } from '@gen/api/types.gen';
import { z } from 'zod';

/** The roles a person can be given; `invited` is a state the server sets until the invitation is accepted. */
export const ASSIGNABLE_ROLES = ['owner', 'admin', 'approver', 'member'] as const satisfies readonly MemberRole[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const ORDER: Readonly<Record<MemberRole, number>> = { owner: 0, admin: 1, approver: 2, member: 3, invited: 4 };

export function canManage(role: MemberRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function displayName(member: Member): string {
  return member.name === undefined || member.name === '' ? member.login : member.name;
}

/** Owners first, invitations last, then by name: the people who decide are the first ones read. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort(
    (a, b) => ORDER[a.role] - ORDER[b.role] || displayName(a).localeCompare(displayName(b), 'en'),
  );
}

export interface ParsedInvites {
  readonly emails: readonly string[];
  readonly invalid: readonly string[];
}

const zEmail = z.email();

/** What a person typed (commas, spaces or lines), as distinct addresses and what is not one. */
export function parseInvites(text: string): ParsedInvites {
  const parts = [...new Set(text.split(/[\s,;]+/).filter((part) => part !== '').map((part) => part.toLowerCase()))];
  return {
    emails: parts.filter((part) => zEmail.safeParse(part).success),
    invalid: parts.filter((part) => !zEmail.safeParse(part).success),
  };
}
