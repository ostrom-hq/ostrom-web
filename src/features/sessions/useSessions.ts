// SPDX-License-Identifier: AGPL-3.0-only
import {
  getSessionOptions,
  listSessionsInfiniteOptions,
  listSessionsOptions,
} from '@gen/api/@tanstack/react-query.gen';
import type { Receipt, Session } from '@gen/api/types.gen';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

/** Open sessions report every few minutes: the list follows them without a reload. */
export const SESSIONS_POLL_MS = 15_000;

export interface SessionListViewModel {
  readonly open: readonly Session[] | undefined;
  /** Newest first, every page read so far. */
  readonly ended: readonly Session[] | undefined;
  readonly failure: Error | undefined;
  /** There are older ended sessions than the ones read. */
  readonly more: boolean;
  readonly loadingMore: boolean;
  /**
   * Why the last read of the ended sessions failed, once some were read: an older page, or a refresh. What was read
   * stays on screen, and the next read that succeeds clears it.
   */
  readonly moreFailure: Error | undefined;
  readonly loadMore: () => void;
}

export function useSessionList(): SessionListViewModel {
  const open = useQuery(
    ready(listSessionsOptions({ query: { open: true } }), { refetchInterval: SESSIONS_POLL_MS }),
  );
  // A session that ends leaves the open list: the ended one follows at the same pace so it shows up there. The server
  // serves it a page at a time (`next`, read back as `before`): the older pages come when asked.
  const ended = useInfiniteQuery({
    ...ready(listSessionsInfiniteOptions({ query: { open: false } }), { refetchInterval: SESSIONS_POLL_MS }),
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const endedItems = useMemo(() => ended.data?.pages.flatMap((page) => page.items), [ended.data]);
  const { fetchNextPage } = ended;
  // Once a page is read, a failure never takes the list away: not even on the next poll, when TanStack forgets that
  // the failure was an older page's (its fetch direction) but keeps the error until a read succeeds.
  const read = ended.data !== undefined;
  const moreFailure = read ? failureOf(ended.error) : undefined;
  return {
    open: open.data?.items,
    ended: endedItems,
    failure: failureOf(open.error ?? (read ? null : ended.error)),
    more: ended.hasNextPage,
    loadingMore: ended.isFetchingNextPage,
    moreFailure,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}

export interface SessionViewModel {
  readonly session: Session | undefined;
  readonly receipt: Receipt | undefined;
  readonly failure: Error | undefined;
}

/** A session still running, or not loaded yet; an ended one is final, so nobody polls it. */
export function stillRunning(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || !('session' in data)) return true;
  const { session } = data;
  return !(
    typeof session === 'object' &&
    session !== null &&
    'endedAt' in session &&
    session.endedAt !== undefined
  );
}

export function useSession(id: string): SessionViewModel {
  const query = useQuery(
    ready(getSessionOptions({ path: { id } }), {
      refetchInterval: (polled) => (stillRunning(polled.state.data) ? SESSIONS_POLL_MS : false),
    }),
  );
  return { session: query.data?.session, receipt: query.data?.receipt, failure: failureOf(query.error) };
}
