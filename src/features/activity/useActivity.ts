// SPDX-License-Identifier: Apache-2.0
import { listActivityInfiniteOptions } from '@gen/api/@tanstack/react-query.gen';
import type { ActivityItem } from '@gen/api/types.gen';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { flatten } from './model';

export interface ActivityViewModel {
  /** Newest first, every page read so far; undefined while the first loads. */
  readonly items: readonly ActivityItem[] | undefined;
  /** The server does not serve the feed (it is planned in the contract): the screen says so, nothing else. */
  readonly unavailable: boolean;
  /** Why the first page did not come. */
  readonly failure: Error | undefined;
  /** Why the lines on screen could not be read again: they may be out of date. */
  readonly staleFailure: Error | undefined;
  /** The lines on screen are the previous filter's, until this one's come. */
  readonly switching: boolean;
  /** There are older lines. */
  readonly more: boolean;
  readonly loadingMore: boolean;
  /** Why the older lines did not come; what was read stays. */
  readonly moreFailure: Error | undefined;
  readonly loadMore: () => void;
  /** Reads the filter on screen again, from its first page. */
  readonly reload: () => void;
}

/** The organization's feed, optionally one repository's sessions only, read a page at a time. */
export function useActivity(repo: string): ActivityViewModel {
  const query = useInfiniteQuery({
    ...ready(listActivityInfiniteOptions(repo === '' ? {} : { query: { repo } }), {
      retry: false,
      // Read again on every visit: what happened since is the point of the page.
      staleTime: 0,
      // Another filter keeps the lines on screen until its own come: no skeleton, no jump.
      placeholderData: (previous) => previous,
    }),
    // Every page read would be read again, one after the other, at each return to the window.
    refetchOnWindowFocus: false,
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const items = useMemo(
    () => (query.data === undefined ? undefined : flatten(query.data.pages)),
    [query.data],
  );
  // The server filters on the repository: an unknown one is an empty page, never a 404 (server#72,
  // ReportsPostgresTest). A 404 here means the route itself is not served.
  const unavailable =
    query.data === undefined && isApiFailure(query.error) && query.error.kind === 'not-found';
  const { fetchNextPage, refetch } = query;
  return {
    items,
    unavailable,
    failure: query.data === undefined && !unavailable ? failureOf(query.error) : undefined,
    switching: query.isPlaceholderData,
    // The older lines of the previous filter are not this one's.
    more: query.hasNextPage && !query.isPlaceholderData,
    loadingMore: query.isFetchingNextPage,
    moreFailure: query.isFetchNextPageError ? failureOf(query.error) : undefined,
    staleFailure: query.isRefetchError ? failureOf(query.error) : undefined,
    loadMore: () => {
      void fetchNextPage();
    },
    reload: () => {
      void refetch();
    },
  };
}
