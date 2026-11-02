// SPDX-License-Identifier: AGPL-3.0-only
import { ApiFailure } from '@/shared/api/ApiFailure';
import { applied, isConfirmationPending } from '@/shared/api/applied';

const pending = {
  confirmationId: 'gc-1',
  confirmUrl: 'https://app.ostrom.run/confirm/gc-1',
  expiresAt: '2026-11-02T20:15:00Z',
};

describe('applied', () => {
  it('returns what the write returned', () => {
    expect(applied({ selfApproval: 'never' })).toEqual({ selfApproval: 'never' });
    expect(isConfirmationPending({ selfApproval: 'never' })).toBe(false);
    expect(isConfirmationPending(undefined)).toBe(false);
  });

  it('never reads a held change as saved', () => {
    expect(isConfirmationPending(pending)).toBe(true);
    expect(() => applied(pending)).toThrow(ApiFailure);
    try {
      applied(pending);
    } catch (error) {
      expect(error).toMatchObject({ status: 202, code: 'confirmation_pending', body: pending });
    }
  });
});
