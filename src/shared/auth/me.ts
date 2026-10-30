// SPDX-License-Identifier: AGPL-3.0-only
import type { GetMeResponse, Me } from '@gen/api/types.gen';

/** "Maya Lind (maya)", or the login alone: who an approval from this browser is signed as. */
export function viewerName(me: Me | undefined): string | undefined {
  if (me === undefined) return undefined;
  const name = me.member?.name;
  return name === undefined || name === '' ? me.dev.login : `${name} (${me.dev.login})`;
}

/**
 * The contract lets `GET /auth/me` answer 204 with no body, which the client hands over as `null`; only a body says
 * who is signed in (`typeof null` is `'object'`, hence `instanceof`).
 */
export function meOf(data: GetMeResponse | null | undefined): Me | undefined {
  return data instanceof Object ? data : undefined;
}
