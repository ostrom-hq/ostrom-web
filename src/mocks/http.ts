// SPDX-License-Identifier: Apache-2.0
import type { ApiError } from '@gen/api/types.gen';
import { HttpResponse } from 'msw';

/** A refusal as the server writes it: the contract's `ApiError`, a stable `type` and a message. */
export function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

/** A request body that is not JSON reads as nothing: the handler's schema then refuses it. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** How long a sign-in may say yes or confirm a governance change, as on the server (S2-54). */
export const FRESH_SIGN_IN_MS = 5 * 60_000;
