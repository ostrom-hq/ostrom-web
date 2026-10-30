// SPDX-License-Identifier: AGPL-3.0-only
import type { AuthSession } from '@gen/api/types.gen';

export const ORG_NAME_MAX = 100;

/** A name the server takes: 1 to 100 characters once trimmed, and not the one it already has. */
export function renameProblem(typed: string, current: string): 'empty' | 'long' | 'same' | undefined {
  const name = typed.trim();
  if (name === '') return 'empty';
  if (name.length > ORG_NAME_MAX) return 'long';
  return name === current ? 'same' : undefined;
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
