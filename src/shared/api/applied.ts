// SPDX-License-Identifier: Apache-2.0
import type { GovernanceConfirmationPending } from '@gen/api/types.gen';
import type { UseMutationOptions } from '@tanstack/react-query';
import { zGovernanceConfirmationPending } from '@gen/api/zod.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';

/** The 202 of a governance write: nothing was written, an owner or an admin confirms it on the console first. */
export function isConfirmationPending(response: unknown): response is GovernanceConfirmationPending {
  return zGovernanceConfirmationPending.safeParse(response).success;
}

/**
 * What a governance write the console sent returned. A browser session's write applies at once (core#57): only a
 * CLI token's is held for a confirmation, so a 202 here is a server that took the console for a CLI. It is said as a
 * failure, never read as saved.
 */
export function applied<T>(response: T | GovernanceConfirmationPending): T {
  if (isConfirmationPending(response))
    throw new ApiFailure(
      'unexpected',
      'Ostrom held this change for a confirmation instead of writing it.',
      202,
      response,
      'confirmation_pending',
    );
  return response;
}

/**
 * A generated mutation of a governance write, with its 202 read as a failure ({@link applied}): what it returns, and
 * every screen that reads it, is only ever what the server wrote.
 */
export function appliedMutation<TData, TError, TVariables>(
  options: UseMutationOptions<TData | GovernanceConfirmationPending, TError, TVariables>,
): UseMutationOptions<TData, TError, TVariables> {
  const { mutationFn } = options;
  if (mutationFn === undefined) throw new Error('a generated mutation always carries its function');
  return {
    ...options,
    mutationFn: async (...args: Parameters<typeof mutationFn>) => applied(await mutationFn(...args)),
  };
}
