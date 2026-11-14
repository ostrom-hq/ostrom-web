// SPDX-License-Identifier: Apache-2.0
import {
  listOrgMembersInfiniteOptions,
  listOrgMembersInfiniteQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import type { OrgMember, OrgMemberList } from '@gen/api/types.gen';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type QueryTuning, ready } from '@/shared/api/ready';

/** The members a page asks the server for: the first page on load, the next one when the person asks. */
export const MEMBERS_PAGE = 100;

/** The one query every screen reads the members through: a change invalidates it, wherever they are shown. */
export function orgMembersKey(org: string): ReturnType<typeof listOrgMembersInfiniteQueryKey> {
  return listOrgMembersInfiniteQueryKey({ path: { org }, query: { limit: MEMBERS_PAGE } });
}

export interface OrgMembers {
  /** Each page read, in the order read. */
  readonly pages: readonly (readonly OrgMember[])[] | undefined;
  /** The members read so far, oldest first: the first page, then each page asked for. */
  readonly members: readonly OrgMember[] | undefined;
  /** Every page is read: a login missing from `members` is then someone who left. */
  readonly complete: boolean;
  /** Reads the next page; absent once every page is read. */
  readonly more: (() => void) | undefined;
  readonly loadingMore: boolean;
  /** A page is on its way: the first, a next one, or the pages read again. */
  readonly fetching: boolean;
  /** The last next page asked for failed: the pages read stay, and `more` asks for it again. */
  readonly moreFailed: boolean;
  readonly error: unknown;
  readonly pending: boolean;
  /** The pages shown are another search's, kept while this one is read. */
  readonly stale: boolean;
}

/**
 * The organization's members, a page of a hundred at a time (`limit`, then `after` the previous `next`); with `q`,
 * only those whose login or name starts with it, as the server finds them.
 */
export function useOrgMembers(org: string, tuning: QueryTuning = {}, q?: string): OrgMembers {
  const query = useInfiniteQuery({
    ...ready(
      listOrgMembersInfiniteOptions({
        path: { org },
        query: q === undefined ? { limit: MEMBERS_PAGE } : { limit: MEMBERS_PAGE, q },
      }),
      tuning,
    ),
    // The first page asks for nothing more than the query's own `limit`; each next one adds `after`.
    initialPageParam: { path: { org } },
    getNextPageParam: (last: OrgMemberList) => last.next,
  });
  const { data, hasNextPage, fetchNextPage } = query;
  const pages = useMemo(() => data?.pages.map((page) => page.items), [data]);
  const members = useMemo(() => pages?.flat(), [pages]);
  const more = useMemo(
    () =>
      hasNextPage
        ? () => {
            // Asked again while it is read (a second screen part, or a second click): the page on its way is kept.
            void fetchNextPage({ cancelRefetch: false });
          }
        : undefined,
    [hasNextPage, fetchNextPage],
  );
  return {
    pages,
    members,
    complete: data !== undefined && !hasNextPage,
    more,
    loadingMore: query.isFetchingNextPage,
    fetching: query.isFetching,
    moreFailed: query.isFetchNextPageError,
    error: query.error,
    pending: query.isPending,
    stale: query.isPlaceholderData,
  };
}
