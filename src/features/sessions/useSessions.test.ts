// SPDX-License-Identifier: AGPL-3.0-only
import { stillRunning } from './useSessions';

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
