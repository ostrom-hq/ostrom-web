// SPDX-License-Identifier: Apache-2.0
import { isApiFailure } from '@/shared/api/ApiFailure';

/**
 * A gesture refused until the person signs in again: a yes needs a sign-in of less than five minutes (S2-54), and
 * the server says so with `error.type` `step_up_required` (core, `answerApproval`); deleting an organization will ask
 * the same. Any other 403 (not an approver, the asker who has to wait, not the owner) is a refusal that signing in
 * again would not change.
 */
export function stepUpOf(error: unknown): boolean {
  return isApiFailure(error) && error.kind === 'forbidden' && error.code === 'step_up_required';
}
