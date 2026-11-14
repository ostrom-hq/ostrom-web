// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gen/api/types.gen';

/** An open session that reported within this window is live; longer quiet, it may have been left open. */
export const LIVE_WINDOW_MS = 5 * 60_000;

export type SessionState = 'live' | 'quiet' | 'ended';

export function sessionState(session: Session, now: Date): SessionState {
  if (session.endedAt !== undefined) return 'ended';
  const seen = Date.parse(session.lastSeenAt ?? session.startedAt);
  return now.getTime() - seen <= LIVE_WINDOW_MS ? 'live' : 'quiet';
}

export type SessionActivity = 'working' | 'waiting';

/**
 * What the agent of an open session reported last, from its own hooks (`sessions.activity.v1`): it works, or it waits
 * for a person. Undefined when it reported nothing, when the session ended, or for a state this console does not know.
 */
const ACTIVITIES: Readonly<Record<string, SessionActivity>> = {
  working: 'working',
  waiting_for_human: 'waiting',
};

export function sessionActivity(session: Session): SessionActivity | undefined {
  if (session.endedAt !== undefined || session.activity === undefined) return undefined;
  return Object.hasOwn(ACTIVITIES, session.activity) ? ACTIVITIES[session.activity] : undefined;
}

/** What the server accepts as a label key (`sessions.labels.v1`): the first character is a letter or a digit. */
const LABEL_KEY = /^[a-z0-9][a-z0-9._/-]{0,62}$/;

/** At most this many labels on a launch, and in a filter. */
export const MAX_LABELS = 16;

/** The labels of a session's launch as `key=value`, by key. */
export function sessionLabels(session: Session): readonly string[] {
  return Object.entries(session.labels ?? {})
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, value]) => `${key}=${value}`);
}

export interface LabelFilter {
  /** The `key=value` filters to send; a session must carry every one. */
  readonly labels: readonly string[];
  /** What was typed that is not a label, shown before anything is asked. */
  readonly invalid: readonly string[];
}

/** `team=core env=ci` (spaces or commas): the key is everything before the first `=`, as the server splits it. */
export function parseLabelFilter(text: string): LabelFilter {
  const labels: string[] = [];
  const invalid: string[] = [];
  for (const entry of text.split(/[\s,]+/).filter((part) => part !== '')) {
    const at = entry.indexOf('=');
    const valid = at > 0 && LABEL_KEY.test(entry.slice(0, at));
    if (!valid || labels.length >= MAX_LABELS) invalid.push(entry);
    else labels.push(entry);
  }
  return { labels, invalid };
}

/** What a launch's limits may hold (`LaunchLimits` of the contract): USD millionths, and calls at once. */
export const MAX_LAUNCH_CONCURRENCY = 32;
export const MAX_LAUNCH_BUDGET_MICROS = 100_000_000_000_000;

const MICROS = 1_000_000;

/** A launch's budget as the field shows it, in USD: 0 for no cap. */
export function budgetDraftOf(micros: number): string {
  return String(micros / MICROS);
}

/** The USD typed as millionths; undefined for what is not an amount of 0 to 100 000 000 with up to 6 decimals. */
export function budgetMicrosOf(draft: string): number | undefined {
  const text = draft.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return undefined;
  const micros = Math.round(Number(text) * MICROS);
  return micros <= MAX_LAUNCH_BUDGET_MICROS ? micros : undefined;
}

/** The concurrent calls typed, 0 to 32 whole; undefined for anything else. */
export function launchConcurrencyOf(draft: string): number | undefined {
  const text = draft.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const limit = Number(text);
  return limit <= MAX_LAUNCH_CONCURRENCY ? limit : undefined;
}
