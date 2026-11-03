// SPDX-License-Identifier: AGPL-3.0-only
import { appliedOf, heldOf, latestHeld } from './held';

const pending = {
  confirmationId: 'gc-1',
  confirmUrl: 'https://ostrom.test/confirm/gc-1',
  expiresAt: '2026-11-03T18:00:00.000Z',
};

describe('a write held for a governance confirmation', () => {
  it('is told from a write applied, whatever the write returned', () => {
    expect(heldOf(pending)).toEqual(pending);
    expect(heldOf({ confirmationId: 'gc-1' })).toBeUndefined();
    expect(heldOf({ role: 'admin' })).toBeUndefined();
    expect(heldOf(undefined)).toBeUndefined();
    expect(heldOf(null)).toBeUndefined();
  });

  it('returns nothing applied while held', () => {
    expect(appliedOf<{ readonly role: string }>(pending)).toBeUndefined();
    expect(appliedOf({ role: 'admin' })).toEqual({ role: 'admin' });
    expect(appliedOf<{ readonly role: string }>(undefined)).toBeUndefined();
  });

  it('is the last write sent, so an older one held stops being said once another goes', () => {
    const other = { ...pending, confirmationId: 'gc-2' };
    expect(latestHeld([])).toBeUndefined();
    expect(latestHeld([{ held: undefined, sentAt: 0 }])).toBeUndefined();
    expect(
      latestHeld([
        { held: pending, sentAt: 1 },
        { held: other, sentAt: 2 },
        { held: undefined, sentAt: 0 },
      ]),
    ).toBe(other);
    expect(
      latestHeld([
        { held: pending, sentAt: 1 },
        { held: undefined, sentAt: 3 },
      ]),
    ).toBeUndefined();
  });
});
