// SPDX-License-Identifier: Apache-2.0
import {
  getSessionOptions,
  listSessionsInfiniteOptions,
  listSessionsInfiniteQueryKey,
  listSessionsOptions,
} from '@gen/api/@tanstack/react-query.gen';
import { listSessions } from '@gen/api/sdk.gen';
import type { ListSessionsResponse, Receipt, Session } from '@gen/api/types.gen';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

/** No label filter: one array, so that a list without a filter keeps its queries. */
const NO_LABELS: readonly string[] = [];

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

/**
 * Every open session, a page after the other (`next`, read back as `before`): the server gives 50 at a time, and
 * the list says how many run. Open sessions are the work going on now, a few per person.
 */
export async function everyOpenSession(
  signal: AbortSignal,
  label: readonly string[] = [],
): Promise<ListSessionsResponse> {
  const items: Session[] = [];
  let before: string | undefined;
  do {
    const query = {
      open: true,
      ...(label.length === 0 ? {} : { label: [...label] }),
      ...(before === undefined ? {} : { before }),
    };
    const { data } = await listSessions({ query, signal, throwOnError: true });
    items.push(...data.items);
    before = data.next;
  } while (before !== undefined);
  return { items };
}

/** Polls the ended sessions while only their first page is read: each poll would read every older page again. */
export function endedPoll(query: { readonly state: { readonly data?: unknown } }): number | false {
  const { data } = query.state;
  const pages =
    typeof data === 'object' && data !== null && 'pages' in data && Array.isArray(data.pages)
      ? data.pages.length
      : 0;
  return pages > 1 ? false : SESSIONS_POLL_MS;
}

/**
 * The sessions of the organization, those still open and the ended ones. With `labels` (`key=value`, all of them),
 * only the sessions whose launch carries every one (`sessions.labels.v1`).
 */
export function useSessionList(labels: readonly string[] = NO_LABELS): SessionListViewModel {
  const queryClient = useQueryClient();
  const label = useMemo(() => (labels.length === 0 ? {} : { label: [...labels] }), [labels]);
  const open = useQuery(
    ready(
      {
        ...listSessionsOptions({ query: { open: true, ...label } }),
        queryFn: async ({ signal }: { readonly signal: AbortSignal }) => everyOpenSession(signal, labels),
      },
      { refetchInterval: SESSIONS_POLL_MS },
    ),
  );
  // A session that ends leaves the open list: the ended one follows so it shows up there. The server serves it a
  // page at a time (`next`, read back as `before`): the older pages come when asked, and are read again only when a
  // session ended, not at every poll.
  const ended = useInfiniteQuery({
    ...ready(listSessionsInfiniteOptions({ query: { open: false, ...label } }), {
      refetchInterval: endedPoll,
    }),
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const openIds = useMemo(() => open.data?.items.map((session) => session.id), [open.data]);
  const seen = useRef<readonly string[]>([]);
  useEffect(() => {
    if (openIds === undefined) return;
    const left = seen.current.some((id) => !openIds.includes(id));
    seen.current = openIds;
    const endedKey = listSessionsInfiniteQueryKey({ query: { open: false, ...label } });
    if (left) void queryClient.invalidateQueries({ queryKey: endedKey });
  }, [openIds, queryClient, label]);
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
