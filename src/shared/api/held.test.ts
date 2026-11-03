// SPDX-License-Identifier: AGPL-3.0-only
import { appliedOf, heldOf } from './held';

const pending = {
  confirmationId: 'gc-1',
  confirmUrl: 'https://ostrom.test/confirm/gc-1',
  expiresAt: '2026-11-03T18:00:00.000Z',
};

describe('a write held for a governance confirmation', () => {
  it('is told from a write applied, whatever the write returned', () => {
    expect(heldOf(pending)).toBe(pending);
    expect(heldOf({ role: 'admin' })).toBeUndefined();
    expect(heldOf(undefined)).toBeUndefined();
    expect(heldOf(null)).toBeUndefined();
  });

  it('returns nothing applied while held', () => {
    expect(appliedOf<{ readonly role: string }>(pending)).toBeUndefined();
    expect(appliedOf({ role: 'admin' })).toEqual({ role: 'admin' });
    expect(appliedOf<{ readonly role: string }>(undefined)).toBeUndefined();
  });
});
