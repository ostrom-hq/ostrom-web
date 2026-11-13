// SPDX-License-Identifier: Apache-2.0
import { QueryClient } from '@tanstack/react-query';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { applied, appliedMutation, isConfirmationPending } from '@/shared/api/applied';

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

describe('appliedMutation', () => {
  it('passes on what the write returned, and refuses a held change', async () => {
    const saved = appliedMutation<{ ok: boolean }, Error, string>({
      mutationFn: async (value: string) => Promise.resolve(value === 'held' ? pending : { ok: true }),
    });
    const send = saved.mutationFn;
    expect(send).toBeDefined();
    const context = { client: new QueryClient(), meta: undefined };
    await expect(send?.('write', context)).resolves.toEqual({ ok: true });
    await expect(send?.('held', context)).rejects.toMatchObject({ code: 'confirmation_pending' });
  });

  it('needs the generated function', () => {
    expect(() => appliedMutation({})).toThrow('a generated mutation always carries its function');
  });
});
