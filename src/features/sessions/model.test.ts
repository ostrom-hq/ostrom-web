// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gen/api/types.gen';
import { sessionActivity, sessionState } from './model';

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

describe('sessionActivity', () => {
  it('says whether the agent of an open session works or waits for a person', () => {
    expect(sessionActivity({ ...base, activity: 'working' })).toBe('working');
    expect(sessionActivity({ ...base, activity: 'waiting_for_human' })).toBe('waiting');
  });

  it('says nothing without a report, for an unknown state or once the session ended', () => {
    expect(sessionActivity(base)).toBeUndefined();
    expect(sessionActivity({ ...base, activity: 'thinking' })).toBeUndefined();
    expect(
      sessionActivity({ ...base, activity: 'waiting_for_human', endedAt: '2026-10-30T09:00:00.000Z' }),
    ).toBeUndefined();
  });
});
