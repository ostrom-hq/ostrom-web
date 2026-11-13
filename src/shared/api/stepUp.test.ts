// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import { stepUpOf } from '@/shared/api/stepUp';

describe('stepUpOf', () => {
  it('offers to sign in again only when the server asks for a fresh sign-in', () => {
    const plain = (code?: string): ApiFailure =>
      new ApiFailure('forbidden', 'sign in again', 403, undefined, code);
    expect(stepUpOf(plain('step_up_required'))).toBe(true);
    expect(stepUpOf(plain())).toBe(false);
    expect(stepUpOf(plain('forbidden'))).toBe(false);
    expect(stepUpOf(plain('self_approval_refused'))).toBe(false);
    expect(stepUpOf(new ApiFailure('conflict', 'changed', 409, undefined, 'step_up_required'))).toBe(false);
    expect(stepUpOf(new Error('step_up_required'))).toBe(false);
  });
});
