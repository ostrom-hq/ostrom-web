// SPDX-License-Identifier: Apache-2.0
import type { InferenceSettings, Invitation, OrgMember } from '@gen/api/types.gen';
import { type OrgRole, orgRoleOf } from '@/shared/org/roles';

/** Owners first, then admins, approvers, members and billing: the people who decide are the first ones read. */
const ORDER: Readonly<Record<OrgRole, number>> = { owner: 0, admin: 1, approver: 2, member: 3, billing: 4 };

/** A role the console does not know sorts last. */
function rank(role: string): number {
  const known = orgRoleOf(role);
  return known === undefined ? Object.keys(ORDER).length : ORDER[known];
}

export function displayName(member: Pick<OrgMember, 'login' | 'name'>): string {
  return member.name === '' ? member.login : member.name;
}

/** By role, then by name. */
export function sortMembers(members: readonly OrgMember[]): OrgMember[] {
  return [...members].sort((a, b) => {
    const byRole = rank(a.role) - rank(b.role);
    return byRole !== 0 ? byRole : displayName(a).localeCompare(displayName(b), 'en');
  });
}

/** Invitations to an address first, by address; then links, newest first. */
export function sortInvitations(invitations: readonly Invitation[]): Invitation[] {
  return [...invitations].sort((a, b) => {
    if (a.email !== null && b.email !== null) return a.email.localeCompare(b.email, 'en');
    if (a.email !== null) return -1;
    if (b.email !== null) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export interface ParsedInvites {
  readonly emails: readonly string[];
  readonly invalid: readonly string[];
}

/** A light check, the server has the last word: something, an at sign, a domain with a dot. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a person typed or pasted (commas, spaces, semicolons or lines), as distinct addresses and what is not one. */
export function parseInvites(text: string): ParsedInvites {
  const parts = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((part) => part.replace(/^<|>$/g, '').toLowerCase())
        .filter((part) => part !== ''),
    ),
  ];
  return {
    emails: parts.filter((part) => EMAIL.test(part)),
    invalid: parts.filter((part) => !EMAIL.test(part)),
  };
}

/** The most people one invitation link can bring in (`MAX_LINK_USES` of the server), and the default. */
export const LINK_MAX_USES = 100;
export const LINK_DEFAULT_USES = 10;

/** The most concurrent requests a member may be given (the contract's `maximum`). */
export const MAX_MEMBER_CONCURRENCY = 32;

/** A member's concurrent requests in the inference settings: 0, the default, for unlimited (TeamCode's member policy). */
export function concurrencyOf(settings: InferenceSettings, memberId: string): number {
  return settings.memberConcurrency?.[memberId] ?? 0;
}

/** The settings with a member's concurrent requests changed, every other setting kept; 0 drops the member's entry. */
export function withConcurrency(
  settings: InferenceSettings,
  memberId: string,
  limit: number,
): InferenceSettings {
  const others = Object.entries(settings.memberConcurrency ?? {}).filter(([id]) => id !== memberId);
  return {
    ...settings,
    memberConcurrency: Object.fromEntries(limit === 0 ? others : [...others, [memberId, limit]]),
  };
}

/** What a draft of the concurrency field says: a whole number from 0 to the maximum, or undefined. */
export function concurrencyDraft(draft: string): number | undefined {
  const limit = /^\d{1,2}$/.test(draft.trim()) ? Number(draft.trim()) : MAX_MEMBER_CONCURRENCY + 1;
  return limit <= MAX_MEMBER_CONCURRENCY ? limit : undefined;
}
