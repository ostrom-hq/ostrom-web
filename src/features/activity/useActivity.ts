// SPDX-License-Identifier: AGPL-3.0-only
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
  /** There are older lines. */
  readonly more: boolean;
  readonly loadingMore: boolean;
  /** Why the older lines did not come; what was read stays. */
  readonly moreFailure: Error | undefined;
  readonly loadMore: () => void;
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
  // Only the whole feed says whether the route is served: a 404 with a filter is about that filter.
  const unavailable =
    repo === '' && query.data === undefined && isApiFailure(query.error) && query.error.kind === 'not-found';
  const { fetchNextPage } = query;
  return {
    items,
    unavailable,
    failure: query.data === undefined && !unavailable ? failureOf(query.error) : undefined,
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    moreFailure: query.isFetchNextPageError ? failureOf(query.error) : undefined,
    staleFailure: query.isRefetchError ? failureOf(query.error) : undefined,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}
