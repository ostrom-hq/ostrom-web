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

/** "2 h 29 min", "45 min", "under a minute": how long a session ran, in the viewer's language. */
export function formatDuration(fromIso: string, toIso: string, locale: string): string {
  const minutes = Math.max(0, Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  const unit = (value: number, name: 'hour' | 'minute'): string =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return unit(rest, 'minute');
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
}
