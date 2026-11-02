// SPDX-License-Identifier: AGPL-3.0-only
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
