// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmation, GovernanceConfirmationPerson, OrgMember } from '@gen/api/types.gen';
import { zInvitationLinkCreate, zOrgInvites, zOrgMember } from '@gen/api/zod.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** "Theo Martin (theo)", the login or the name alone, else the member id: never an empty requester. */
export function personName(person: GovernanceConfirmationPerson): string {
  const { name, login, memberId } = person;
  if (name !== undefined && login !== undefined) return `${name} (${login})`;
  return name ?? login ?? memberId;
}

/** "Theo Martin (theo)", or the login alone when the name is empty or the login again. */
export function memberName(member: Pick<OrgMember, 'login' | 'name'>): string {
  return member.name === '' || member.name === member.login
    ? member.login
    : `${member.name} (${member.login})`;
}

/** A change of the organization's people, as the page says it in words rather than JSON. */
export type MemberChange =
  | { readonly kind: 'role'; readonly member: OrgMember; readonly from: string; readonly to: string }
  | { readonly kind: 'remove'; readonly member: OrgMember }
  | {
      readonly kind: 'invite';
      readonly invites: readonly { readonly email: string; readonly role: string }[];
    }
  | { readonly kind: 'link'; readonly role: string; readonly maxUses: number };

/** A role the server takes when the write names none. */
const DEFAULT_ROLE = 'member';
/** How many people a link brings in when the write does not say. */
const DEFAULT_LINK_USES = 10;

/**
 * A `members.*` confirmation read from its before and after: the member and both roles, who leaves, each address
 * invited, a link's role. Anything of another shape, or another kind, is left to the JSON before and after.
 */
export function memberChangeOf(
  confirmation: Pick<GovernanceConfirmation, 'kind' | 'before' | 'after'>,
): MemberChange | undefined {
  const { kind, before, after } = confirmation;
  if (kind === 'members.role') {
    const was = zOrgMember.safeParse(before);
    const is = zOrgMember.safeParse(after);
    return was.success && is.success
      ? { kind: 'role', member: is.data, from: was.data.role, to: is.data.role }
      : undefined;
  }
  if (kind === 'members.remove') {
    const was = zOrgMember.safeParse(before);
    return was.success && after === null ? { kind: 'remove', member: was.data } : undefined;
  }
  if (kind === 'members.invite') {
    const is = zOrgInvites.safeParse(after);
    if (!is.success) return undefined;
    // The same address with the same role twice is one invitation; an address with two roles is said twice.
    const invites = new Map(
      is.data.invites.map((invite) => {
        const role = invite.role ?? DEFAULT_ROLE;
        return [`${invite.email} ${role}`, { email: invite.email, role }];
      }),
    );
    return invites.size === 0 ? undefined : { kind: 'invite', invites: [...invites.values()] };
  }
  if (kind === 'members.link') {
    const is = zInvitationLinkCreate.safeParse(after);
    return is.success
      ? { kind: 'link', role: is.data.role ?? DEFAULT_ROLE, maxUses: is.data.maxUses ?? DEFAULT_LINK_USES }
      : undefined;
  }
  return undefined;
}

/** A JSON object, as a change of a rule, a policy or a workflow reads; arrays and scalars are shown whole. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The same JSON with object keys sorted: two values that differ only in key order read the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** One line of a value shown as JSON, marked when the entry it belongs to changes. */
export interface JsonLine {
  readonly text: string;
  readonly changed: boolean;
}

/** Each line of a nested value, indented under its key. */
function indented(value: unknown): string[] {
  return JSON.stringify(value, null, 2).split('\n');
}

/** The entries an object (by key) or a list (by position) is compared by: `"key": ` or nothing before each. */
function entriesOf(value: unknown): readonly (readonly [string | number, string, unknown])[] | undefined {
  if (Array.isArray(value)) return value.map((item: unknown, index) => [index, '', item] as const);
  if (isRecord(value))
    return Object.entries(value).map(([key, item]) => [key, `${JSON.stringify(key)}: `, item] as const);
  return undefined;
}

/**
 * `value` as indented JSON, with the lines of every top-level entry (a key of an object, a position of a list) that
 * differs from `other` marked; an entry only on one side changes too, key order never does. Two values of different
 * shapes, or scalars, change as a whole.
 */
export function jsonLines(value: unknown, other: unknown): readonly JsonLine[] {
  const entries = entriesOf(value);
  const theirs = entriesOf(other);
  if (entries === undefined || theirs === undefined || Array.isArray(value) !== Array.isArray(other)) {
    const changed = !same(value, other);
    return indented(value).map((text) => ({ text, changed }));
  }
  const otherAt = new Map(theirs.map(([key, , item]) => [key, item]));
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const body = entries.flatMap(([key, label, item], index) => {
    const changed = !same(item, otherAt.get(key));
    const [first = '', ...rest] = indented(item);
    const comma = index === entries.length - 1 ? '' : ',';
    const lines = [`  ${label}${first}`, ...rest.map((line) => `  ${line}`)];
    return lines.map((text, line) => ({
      text: line === lines.length - 1 ? `${text}${comma}` : text,
      changed,
    }));
  });
  return [{ text: open, changed: false }, ...body, { text: close, changed: false }];
}

/** The top-level keys a change writes differently: what the before/after legend counts. */
export function changedKeys(before: unknown, after: unknown): readonly string[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter((key) => !same(before[key], after[key]));
}

/** Milliseconds left before `expiresAt`, never below zero; zero for a date the server sent unreadable. */
export function remainingMs(expiresAt: string, now: number): number {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

/** "14:05": minutes and seconds left, as a countdown reads. */
export function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Why an answer was not taken, as the page says it. */
export type AnswerNotice =
  /** A confirm needs a sign-in of less than five minutes: sign in again, then confirm. */
  | 'step-up'
  /** Not an owner or an admin, or a token: the server's words. */
  | 'forbidden'
  /** Someone answered it first. */
  | 'closed'
  /** What it changes is no longer what it showed: nothing was written. */
  | 'stale'
  /** Its 15 minutes ran out. */
  | 'expired'
  /** The confirmed write itself was refused: the confirmation failed with that error. */
  | 'failed'
  /** Anything else: the network, the server. */
  | 'error';

export function answerNoticeOf(error: unknown): AnswerNotice {
  if (!isApiFailure(error) || error.status === undefined) return 'error';
  if (error.status === 403) return error.code === 'step_up_required' ? 'step-up' : 'forbidden';
  if (error.status === 410 || error.code === 'confirmation_expired') return 'expired';
  // Asking again later can go through (a timeout, a rate limit): the confirmation is still waiting.
  if (error.status === 408 || error.status === 429) return 'error';
  if (error.code === 'confirmation_closed') return 'closed';
  if (error.code === 'confirmation_stale') return 'stale';
  // Signed out or the confirmation gone are not the write's doing; another refusal is its own error (`answer`).
  if (error.status === 401 || error.status === 404 || error.status >= 500) return 'error';
  return error.status >= 400 ? 'failed' : 'error';
}
