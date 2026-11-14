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
