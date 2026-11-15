// SPDX-License-Identifier: Apache-2.0
import {
  getUsageReviewOptions,
  getUsageReviewQueryKey,
  listPendingUsageInfiniteOptions,
  listUsageReconciliationsInfiniteOptions,
  reconcileUsageMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { PendingUsage, UsageReconciliation, UsageReview } from '@gen/api/types.gen';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import type { Reconciliation } from './model';

export interface UsagePageViewModel<T> {
  /** Newest first, every page read so far; undefined while the first loads. */
  readonly items: readonly T[] | undefined;
  /** 403: only an owner or an admin reviews usage. */
  readonly forbidden: boolean;
  readonly failure: Error | undefined;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
}

function pageOf<T>(query: {
  readonly data: { readonly pages: readonly { readonly items: readonly T[] }[] } | undefined;
  readonly error: unknown;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
}): UsagePageViewModel<T> {
  const forbidden = isApiFailure(query.error) && query.error.kind === 'forbidden';
  const { fetchNextPage } = query;
  return {
    items: query.data?.pages.flatMap((page) => page.items),
    forbidden,
    failure: forbidden ? undefined : failureOf(query.error),
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}

/**
 * TeamCode's Usage review lists, 50 at a time (`next` read back as `before`), optionally one member's (`OrgMember.id`):
 * the holds whose usage is unknown, or the corrections made. Only the list shown is read.
 */
export function useUsageLists(
  history: boolean,
  member: string | undefined,
): {
  readonly pending: UsagePageViewModel<PendingUsage>;
  readonly reconciliations: UsagePageViewModel<UsageReconciliation>;
} {
  const options = member === undefined ? {} : { query: { member } };
  const tuning = { retry: false, staleTime: 0 };
  const pending = useInfiniteQuery({
    ...ready(listPendingUsageInfiniteOptions(options), { ...tuning, enabled: !history }),
    refetchOnWindowFocus: false,
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const reconciliations = useInfiniteQuery({
    ...ready(listUsageReconciliationsInfiniteOptions(options), { ...tuning, enabled: history }),
    refetchOnWindowFocus: false,
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  return { pending: pageOf(pending), reconciliations: pageOf(reconciliations) };
}

export interface UsageReservationViewModel {
  readonly review: UsageReview | undefined;
  readonly forbidden: boolean;
  /** 404: neither a hold under review nor a correction of this organization. */
  readonly notFound: boolean;
  readonly failure: Error | undefined;
  readonly reconcile: (body: Reconciliation) => void;
  readonly reconciling: boolean;
  readonly reconcileFailure: Error | undefined;
}

/**
 * One hold under review, or its correction, and the correction itself. Whatever the server answers a correction, the
 * hold and the lists are read again: a 409 means the hold changed or was corrected meanwhile, and the person sees how
 * it is now.
 */
export function useUsageReservation(id: string): UsageReservationViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getUsageReviewOptions({ path: { id } }), { retry: false }));
  const mutation = useMutation({
    ...reconcileUsageMutation(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getUsageReviewQueryKey({ path: { id } }) }),
        queryClient.resetQueries({ queryKey: listPendingUsageInfiniteOptions().queryKey, exact: false }),
        queryClient.resetQueries({
          queryKey: listUsageReconciliationsInfiniteOptions().queryKey,
          exact: false,
        }),
      ]);
    },
  });
  const { mutate } = mutation;
  const reconcile = useCallback(
    (body: Reconciliation) => {
      mutate({ path: { id }, body });
    },
    [mutate, id],
  );
  const kind = isApiFailure(query.error) ? query.error.kind : undefined;
  const failure = useMemo(
    () => (kind === 'forbidden' || kind === 'not-found' ? undefined : failureOf(query.error)),
    [kind, query.error],
  );
  return {
    review: query.data,
    forbidden: kind === 'forbidden',
    notFound: kind === 'not-found',
    failure,
    reconcile,
    reconciling: mutation.isPending,
    reconcileFailure: failureOf(mutation.error),
  };
}
