// SPDX-License-Identifier: Apache-2.0
import type { BudgetOverride, CreateBudgetOverrideData } from '@gen/api/types.gen';

/**
 * TeamCode's temporary quota overrides (`capacity.budgetoverrides.v1`): for a while, at the latest until midnight UTC,
 * a member's daily limit that stops is replaced by a total daily allowance. Amounts are USD millionths.
 */
const MICROS = 1_000_000;
/** The largest allowance the server takes: $100 000 000. */
export const MAX_OVERRIDE_MICROS = 100_000_000_000_000;
/** An override lasts one minute to a day, and never past the next midnight UTC (the server cuts it there). */
export const MAX_OVERRIDE_MINUTES = 1440;
export const DEFAULT_OVERRIDE_MINUTES = '60';
/** A reason is one line of 1 to 240 characters, as the server checks it. */
export const MAX_REASON_LENGTH = 240;

/** Active: the one in force now; revoked: ended by an administrator; ended: past its deadline, or replaced. */
export type OverrideState = 'active' | 'revoked' | 'ended';

/**
 * The page is read once: the override the server said was in force has ended once its deadline is past, so it is no
 * longer offered for revocation or replacement (the server would answer 409).
 */
export function overrideStateOf(
  item: BudgetOverride,
  activeId: string | undefined,
  now: Date,
): OverrideState {
  if (item.revokedAt !== undefined) return 'revoked';
  return item.id === activeId && Date.parse(item.expiresAt) > now.getTime() ? 'active' : 'ended';
}

/** An allowance in USD, for the reader. */
export function usdOfMicros(micros: number): number {
  return micros / MICROS;
}

/** The allowance typed in USD (0 stops the member's calls), as millionths; undefined when it is not one. */
export function overrideMicrosOf(draft: string): number | undefined {
  const text = draft.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return undefined;
  const micros = Math.round(Number(text) * MICROS);
  return micros <= MAX_OVERRIDE_MICROS ? micros : undefined;
}

/** The allowance an override gives, as the field shows it, in USD. */
export function overrideDraftOf(micros: number): string {
  return String(usdOfMicros(micros));
}

/** A reason as the server takes it: one line, trimmed, 1 to 240 characters; undefined otherwise. */
export function reasonOf(draft: string): string | undefined {
  const text = draft.trim();
  if (text === '' || text.length > MAX_REASON_LENGTH || /[\r\n]/.test(text)) return undefined;
  return text;
}

/** Whole minutes from 1 to 1 440; undefined otherwise. */
export function minutesOf(draft: string): number | undefined {
  const text = draft.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const minutes = Number(text);
  return minutes >= 1 && minutes <= MAX_OVERRIDE_MINUTES ? minutes : undefined;
}

export type OverrideGrant = CreateBudgetOverrideData['body'];

/**
 * The grant to send, or undefined while the form does not describe one. `replacesId` is the override in force, so the
 * server replaces that one, or refuses (409) when another administrator changed it meanwhile.
 */
export function draftOverride(draft: {
  readonly amount: string;
  readonly minutes: string;
  readonly reason: string;
  readonly replacesId: string | undefined;
}): OverrideGrant | undefined {
  const micros = overrideMicrosOf(draft.amount);
  const durationMinutes = minutesOf(draft.minutes);
  const reason = reasonOf(draft.reason);
  if (micros === undefined || durationMinutes === undefined || reason === undefined) return undefined;
  return {
    micros,
    durationMinutes,
    reason,
    ...(draft.replacesId === undefined ? {} : { replacesId: draft.replacesId }),
  };
}
