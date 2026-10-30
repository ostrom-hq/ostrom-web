// SPDX-License-Identifier: AGPL-3.0-only
import type { GetMeResponse, Me } from '@gen/api/types.gen';

/** The contract lets `GET /auth/me` answer 204 with no body; only a body says who is signed in. */
export function meOf(data: GetMeResponse | undefined): Me | undefined {
  return typeof data === 'object' ? data : undefined;
}
