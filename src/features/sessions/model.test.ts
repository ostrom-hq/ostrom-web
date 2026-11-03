// SPDX-License-Identifier: AGPL-3.0-only
import type { Session } from '@gen/api/types.gen';
import { sessionState } from './model';

const base: Session = { id: 's', agent: 'codex', dev: 'maya', startedAt: '2026-10-30T08:00:00.000Z' };
const at = (iso: string): Date => new Date(iso);

describe('sessionState', () => {
  it('reads an ended session as ended', () => {
    expect(
      sessionState({ ...base, endedAt: '2026-10-30T09:00:00.000Z' }, at('2026-10-30T09:01:00.000Z')),
    ).toBe('ended');
  });

  it('is live within five minutes of the last report, quiet after', () => {
    const seen = { ...base, lastSeenAt: '2026-10-30T08:30:00.000Z' };
    expect(sessionState(seen, at('2026-10-30T08:35:00.000Z'))).toBe('live');
    expect(sessionState(seen, at('2026-10-30T08:35:01.000Z'))).toBe('quiet');
  });

  it('counts from the start when the session never reported', () => {
    expect(sessionState(base, at('2026-10-30T08:04:00.000Z'))).toBe('live');
    expect(sessionState(base, at('2026-10-30T08:10:00.000Z'))).toBe('quiet');
  });
});
