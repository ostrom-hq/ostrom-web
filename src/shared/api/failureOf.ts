// SPDX-License-Identifier: Apache-2.0
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';

/** A failure the screens can render: typed when the client produced it, generic otherwise. */
export function failureOf(error: unknown): ApiFailure | Error | undefined {
  if (error === null || error === undefined) return undefined;
  if (isApiFailure(error) || error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}
