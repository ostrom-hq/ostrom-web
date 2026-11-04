// SPDX-License-Identifier: AGPL-3.0-only
import type { Session } from '@gen/api/types.gen';

/** An open session that reported within this window is live; longer quiet, it may have been left open. */
export const LIVE_WINDOW_MS = 5 * 60_000;

export type SessionState = 'live' | 'quiet' | 'ended';

export function sessionState(session: Session, now: Date): SessionState {
  if (session.endedAt !== undefined) return 'ended';
  const seen = Date.parse(session.lastSeenAt ?? session.startedAt);
  return now.getTime() - seen <= LIVE_WINDOW_MS ? 'live' : 'quiet';
}
