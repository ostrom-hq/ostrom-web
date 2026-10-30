// SPDX-License-Identifier: AGPL-3.0-only
import { isApiFailure } from '@/shared/api/ApiFailure';

/** A refusal (4xx) says the same thing the second time: only a dropped connection or a server error is retried, once. */
export function retryOnce(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!isApiFailure(error)) return true;
  return error.kind === 'network' || error.kind === 'server';
}
