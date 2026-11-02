// SPDX-License-Identifier: AGPL-3.0-only
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import type { GetMeResponse, Me } from '@gen/api/types.gen';

/** "Maya Lind (maya)", or the login alone: who an approval from this browser is signed as. */
export function viewerName(me: Me | undefined): string | undefined {
  return me === undefined ? undefined : signedInName(me);
}

/** "Maya Lind (maya)" when the answer has the person's member and a name in it, else the login alone. */
export function signedInName(me: Me): string {
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

/**
 * `GET /auth/me` in the organization the console acts in: `Ostrom-Org` adds the person's member there (name, role) and
 * the organization (ostrom-server#92). Without one, who is signed in only. The route acts in no organization, so the
 * client never adds the header itself (shared/api/orgHeader.ts): it is named here, and is part of the cache key.
 */
export function meInOrgOptions(org: string | undefined): ReturnType<typeof getMeOptions> {
  return getMeOptions(org === undefined ? undefined : { headers: { 'Ostrom-Org': org } });
}
