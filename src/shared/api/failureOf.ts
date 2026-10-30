// SPDX-License-Identifier: AGPL-3.0-only
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';

/** A failure the screens can render: typed when the client produced it, generic otherwise. */
export function failureOf(error: unknown): ApiFailure | Error | undefined {
  if (error === null || error === undefined) return undefined;
  if (isApiFailure(error) || error instanceof Error) return error;
  return new Error(String(error));
}
