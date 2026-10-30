// SPDX-License-Identifier: AGPL-3.0-only
import type { GetMeResponse, Me } from '@gen/api/types.gen';

/** "Maya Lind (maya)", or the login alone: who an approval from this browser is signed as. */
export function viewerName(me: Me | undefined): string | undefined {
  if (me === undefined) return undefined;
  const name = me.member?.name;
  return name === undefined || name === '' ? me.dev.login : `${name} (${me.dev.login})`;
}

/** The contract lets `GET /auth/me` answer 204 with no body; only a body says who is signed in. */
/** "Maya Lind (maya)", or the login alone: who an approval from this browser is signed as. */
export function viewerName(me: Me | undefined): string | undefined {
  if (me === undefined) return undefined;
  const name = me.member?.name;
  return name === undefined || name === '' ? me.dev.login : `${name} (${me.dev.login})`;
}

export function meOf(data: GetMeResponse | undefined): Me | undefined {
  return typeof data === 'object' ? data : undefined;
}
