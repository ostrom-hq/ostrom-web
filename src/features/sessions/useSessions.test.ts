// SPDX-License-Identifier: AGPL-3.0-only
import { endedPoll, SESSIONS_POLL_MS, stillRunning } from './useSessions';

describe('stillRunning', () => {
  it('keeps polling a session until it has ended', () => {
    expect([
      stillRunning(undefined),
      stillRunning(null),
      stillRunning({}),
      stillRunning({ session: null }),
      stillRunning({ session: 'x' }),
      stillRunning({ session: {} }),
      stillRunning({ session: { endedAt: undefined } }),
    ]).toEqual([true, true, true, true, true, true, true]);
    expect(stillRunning({ session: { endedAt: '2026-10-30T08:00:00.000Z' } })).toBe(false);
  });
});

describe('endedPoll', () => {
  it('polls the ended sessions while only their first page is read', () => {
    expect(endedPoll({ state: {} })).toBe(SESSIONS_POLL_MS);
    expect(endedPoll({ state: { data: { pages: [{}] } } })).toBe(SESSIONS_POLL_MS);
    expect(endedPoll({ state: { data: { pages: [{}, {}] } } })).toBe(false);
    expect(endedPoll({ state: { data: { pages: 'none' } } })).toBe(SESSIONS_POLL_MS);
    expect(endedPoll({ state: { data: null } })).toBe(SESSIONS_POLL_MS);
    expect(endedPoll({ state: { data: {} } })).toBe(SESSIONS_POLL_MS);
  });
});
