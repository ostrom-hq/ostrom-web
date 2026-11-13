// SPDX-License-Identifier: Apache-2.0
import { listAuditInfiniteOptions } from '@gen/api/@tanstack/react-query.gen';
import type { AuditEvent } from '@gen/api/types.gen';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface AuditViewModel {
  /** Newest first, every page read so far; undefined while the first loads. */
  readonly events: readonly AuditEvent[] | undefined;
  /** The server reads the log to an owner or an admin only: anyone else is told so, nothing else. */
  readonly forbidden: boolean;
  /** The server does not serve the log: the screen says so, nothing else. */
  readonly unavailable: boolean;
  /** Why the first page did not come. */
  readonly failure: Error | undefined;
  /** There are older lines. */
  readonly more: boolean;
  readonly loadingMore: boolean;
  /** Why the older lines did not come; what was read stays. */
  readonly moreFailure: Error | undefined;
  readonly loadMore: () => void;
}

/** The organization's audit log, read a page at a time (50 lines, `next` read back as `before`). */
export function useAudit(): AuditViewModel {
  const query = useInfiniteQuery({
    // A refusal is the answer, not a hiccup: it is shown at once, never asked three more times.
    ...ready(listAuditInfiniteOptions(), { retry: false, staleTime: 0 }),
    // Every page read would be read again, one after the other, at each return to the window.
    refetchOnWindowFocus: false,
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const events = useMemo(() => query.data?.pages.flatMap((page) => page.items), [query.data]);
  const first = query.data === undefined && isApiFailure(query.error) ? query.error.kind : undefined;
  const forbidden = first === 'forbidden';
  const unavailable = first === 'not-found';
  const moreFailure = query.isFetchNextPageError ? failureOf(query.error) : undefined;
  const { fetchNextPage } = query;
  return {
    events,
    forbidden,
    unavailable,
    failure: query.data === undefined && !forbidden && !unavailable ? failureOf(query.error) : undefined,
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    moreFailure,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}
