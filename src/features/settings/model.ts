// SPDX-License-Identifier: AGPL-3.0-only
import type { AuthSession } from '@gen/api/types.gen';
import { nameProblem } from '@/shared/org/slug';

/** A name the server takes (`validOrgName`) and not the one it already has. */
export function renameProblem(
  typed: string,
  current: string,
): 'empty' | 'long' | 'control' | 'same' | undefined {
  return nameProblem(typed) ?? (typed.trim() === current ? 'same' : undefined);
}

/** The deletion is confirmed by the short name typed again, exactly as the server compares it. */
export function deletionConfirmed(typed: string, slug: string): boolean {
  return typed === slug;
}

/** This browser first, then the most recently seen; a session never seen since sign-in by when it started. */
export function sortSessions(sessions: readonly AuthSession[]): AuthSession[] {
  const seen = (session: AuthSession): number => Date.parse(session.lastSeenAt ?? session.createdAt);
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return seen(b) - seen(a);
  });
}

/**
 * What the name field shows once the organization's name changed from `from` to `now` (this save, another tab,
 * another admin): a field left as it was, or holding the new name already, follows it; anything else typed stays.
 */
export function followName(typed: string, from: string, now: string): string {
  const name = typed.trim();
  if (name === from) return now;
  if (name === now) return now;
  return typed;
}

/** The time zone this browser shows every time in: the organization has none of its own yet. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
