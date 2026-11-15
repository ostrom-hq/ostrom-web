// SPDX-License-Identifier: Apache-2.0
import {
  createBudgetOverrideMutation,
  listBudgetOverridesInfiniteOptions,
  revokeBudgetOverrideMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { BudgetOverrideDto } from '@gen/api/types.gen';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import type { OverrideGrant } from './overrides';

export interface BudgetOverridesViewModel {
  /** The member's grants, newest first, every page read so far; undefined while the first loads. */
  readonly overrides: readonly BudgetOverrideDto[] | undefined;
  /** The override in force now, as the server said on its first page. */
  readonly activeId: string | undefined;
  readonly failure: Error | undefined;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly grant: (grant: OverrideGrant, onDone: () => void) => void;
  readonly granting: boolean;
  readonly grantFailure: Error | undefined;
  readonly revoke: (id: string, reason: string, onDone: () => void) => void;
  readonly revoking: boolean;
  readonly revokeFailure: Error | undefined;
}

/**
 * A member's temporary daily budgets (`/members/{login}/budget-overrides`), read 50 at a time, with the grant, its
 * replacement and the revocation. Every write, refused or not, reads the list again: a 409 means another administrator
 * changed the override in force, and the person sees the one in force now before trying again.
 */
export function useBudgetOverrides(login: string): BudgetOverridesViewModel {
  const queryClient = useQueryClient();
  const path = { login };
  const query = useInfiniteQuery({
    ...ready(listBudgetOverridesInfiniteOptions({ path }), { retry: false }),
    refetchOnWindowFocus: false,
    initialPageParam: { path },
    getNextPageParam: (last) => last.next,
  });
  const overrides = useMemo(() => query.data?.pages.flatMap((page) => page.items), [query.data]);
  const queryKey = listBudgetOverridesInfiniteOptions({ path }).queryKey;
  // Back to the first page only: older pages read with the previous cursors would shift by the new grant.
  const settled = async (): Promise<void> => {
    await queryClient.resetQueries({ queryKey });
  };
  const granting = useMutation({ ...createBudgetOverrideMutation(), onSettled: settled });
  const revoking = useMutation({ ...revokeBudgetOverrideMutation(), onSettled: settled });
  const { mutate: grantMutate } = granting;
  const { mutate: revokeMutate } = revoking;
  const grant = useCallback(
    (body: OverrideGrant, onDone: () => void) => {
      grantMutate({ path: { login }, body }, { onSuccess: onDone });
    },
    [grantMutate, login],
  );
  const revoke = useCallback(
    (id: string, reason: string, onDone: () => void) => {
      revokeMutate({ path: { login, id }, body: { reason } }, { onSuccess: onDone });
    },
    [revokeMutate, login],
  );
  const { fetchNextPage } = query;
  return {
    overrides,
    activeId: query.data?.pages[0]?.activeId ?? undefined,
    failure: failureOf(query.error),
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => {
      void fetchNextPage();
    },
    grant,
    granting: granting.isPending,
    grantFailure: failureOf(granting.error),
    revoke,
    revoking: revoking.isPending,
    revokeFailure: failureOf(revoking.error),
  };
}
