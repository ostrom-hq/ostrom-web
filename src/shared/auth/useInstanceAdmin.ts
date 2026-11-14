// SPDX-License-Identifier: Apache-2.0
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { ready } from '@/shared/api/ready';
import { meOf } from './me';

/**
 * Whether the person signed in administers the instance (`Me.instanceAdmin`: a person only, never a key). The same
 * `/auth/me` read as the rest of the console, kept fresh for a minute. Undefined until the server has said who is
 * signed in.
 */
export function useInstanceAdmin(ask = true): boolean | undefined {
  // `ask: false` only reads the cache: the navigation never asks who is signed in on a page that asks nobody.
  const me = meOf(useQuery(ready(getMeOptions(), { staleTime: 60_000, enabled: ask })).data);
  return me === undefined ? undefined : me.instanceAdmin === true;
}
