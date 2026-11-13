// SPDX-License-Identifier: AGPL-3.0-only
import { capabilitiesOptions, getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { ready } from '@/shared/api/ready';
import { retryOnce } from '@/shared/api/retry';
import { meOf } from '@/shared/auth/me';
import { announces, type FeatureKey, hasFeature, type ServerStatus, serverStatusOf } from './model';

/** Fresh for five minutes, read again on focus once stale, and every ten minutes in a tab left open. */
const STALE_MS = 5 * 60_000;
const REFRESH_MS = 10 * 60_000;
/** While the server does not answer, ask again every half minute: it never blocks the console meanwhile. */
const RETRY_MS = 30_000;

/**
 * What the server speaks and serves (`GET /capabilities`), asked once the person is signed in (the route needs any
 * credential) and kept for the session. It reads `/auth/me` from the cache without asking it.
 */
export function useServerStatus(): ServerStatus {
  // Reads who is signed in from the cache, never asks: the top bar does (and not on a sign-in page, which asks nobody).
  const signedIn =
    meOf(useQuery(ready(getMeOptions(), { staleTime: 60_000, enabled: false })).data) !== undefined;
  const query = useQuery(
    ready(capabilitiesOptions(), {
      enabled: signedIn,
      staleTime: STALE_MS,
      // A server without the route says 404 each time; a dropped connection or a 5xx is tried once more.
      retry: (count, error) =>
        !(isApiFailure(error) && error.kind === 'not-found') && retryOnce(count, error),
      refetchInterval: (query) => (query.state.error === null ? REFRESH_MS : RETRY_MS),
    }),
  );
  // Nobody signed in (or signed out just now): whatever was read before is the previous account's server answer.
  if (!signedIn) return { kind: 'loading' };
  return serverStatusOf({ data: query.data, error: query.error, pending: query.isPending });
}

/**
 * Whether the server serves a feature. True until the server has answered without it: nothing disappears while the
 * answer is on its way, nor when the server cannot be asked.
 */
export function useFeature(key: FeatureKey): boolean {
  return hasFeature(useServerStatus(), key);
}

/** Whether the server has said it serves a feature: false while it is being asked, so nothing is asked of it before. */
export function useAnnounced(key: FeatureKey): boolean {
  return announces(useServerStatus(), key);
}
