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
  return [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || seen(b) - seen(a));
}

/** The time zone this browser shows every time in: the organization has none of its own yet. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
