// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmation, GovernanceConfirmationPerson } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** "Theo Martin (theo)", the login or the name alone, else the member id: never an empty requester. */
export function personName(person: GovernanceConfirmationPerson): string {
  const { name, login, memberId } = person;
  if (name !== undefined && login !== undefined) return `${name} (${login})`;
  return name ?? login ?? memberId;
}

/** A JSON object, as a change of a rule, a policy or a workflow reads; arrays and scalars are shown whole. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** One line of a value shown as JSON: the top-level key it belongs to, when it changes. */
export interface JsonLine {
  readonly text: string;
  readonly changed: boolean;
}

/** Each line of a nested value, indented under its key. */
function indented(value: unknown): string[] {
  return JSON.stringify(value, null, 2).split('\n');
}

/**
 * `value` as indented JSON, with the lines of every top-level key whose value differs from `other` marked. Objects
 * are read key by key (a key only on one side changes too); anything else changes as a whole.
 */
export function jsonLines(value: unknown, other: unknown): readonly JsonLine[] {
  if (!isRecord(value) || !isRecord(other)) {
    const changed = !same(value, other);
    return indented(value).map((text) => ({ text, changed }));
  }
  const entries = Object.entries(value);
  const body = entries.flatMap(([key, item], index) => {
    const changed = !same(item, other[key]);
    const [first = '', ...rest] = indented(item);
    const comma = index === entries.length - 1 ? '' : ',';
    const lines = [`  ${JSON.stringify(key)}: ${first}`, ...rest.map((line) => `  ${line}`)];
    return lines.map((text, at) => ({ text: at === lines.length - 1 ? `${text}${comma}` : text, changed }));
  });
  return [{ text: '{', changed: false }, ...body, { text: '}', changed: false }];
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

export type ShownStatus = GovernanceConfirmation['status'];

/** A pending confirmation past its time reads as expired at once, before the server says so on the next read. */
export function shownStatus(confirmation: GovernanceConfirmation, now: number): ShownStatus {
  return confirmation.status === 'pending' && remainingMs(confirmation.expiresAt, now) === 0
    ? 'expired'
    : confirmation.status;
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
  if (error.code === 'confirmation_closed') return 'closed';
  if (error.code === 'confirmation_stale') return 'stale';
  // Signed out or the confirmation gone are not the write's doing; another refusal is its own error (`answer`).
  if (error.status === 401 || error.status === 404 || error.status >= 500) return 'error';
  return error.status >= 400 ? 'failed' : 'error';
}
