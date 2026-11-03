// SPDX-License-Identifier: AGPL-3.0-only
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
  readonly error: unknown;
  readonly pending: boolean;
}

/** The organization's members, a page of a hundred at a time (`limit`, then `after` the previous `next`). */
export function useOrgMembers(org: string, tuning: QueryTuning = {}): OrgMembers {
  const query = useInfiniteQuery({
    ...ready(listOrgMembersInfiniteOptions({ path: { org }, query: { limit: MEMBERS_PAGE } }), tuning),
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
            void fetchNextPage();
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
    error: query.error,
    pending: query.isPending,
  };
}
