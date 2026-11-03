// SPDX-License-Identifier: AGPL-3.0-only
import {
  getSpendingOptions,
  getSpendingQueryKey,
  listBudgetsOptions,
  listBudgetsQueryKey,
  setBudgetMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { Budget, Spending } from '@gen/api/types.gen';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { type OrgMembers, useOrgMembers } from '@/shared/org/members';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { type Period, sortBudgets } from './model';

export interface SpendViewModel {
  readonly spending: Spending | undefined;
  /** The previous period stays on screen while the next one loads. */
  readonly switching: boolean;
  readonly failure: Error | undefined;
  readonly budgets: readonly Budget[] | undefined;
  /**
   * The organization's members read so far, a page at a time: a member budget names them by id, people choose and
   * read them by login.
   */
  readonly people: Pick<OrgMembers, 'members' | 'more' | 'loadingMore'>;
  readonly canManage: boolean;
}

export function useSpend(period: Period): SpendViewModel {
  const spending = useQuery(
    ready(getSpendingOptions({ query: { period } }), { placeholderData: keepPreviousData }),
  );
  const budgets = useQuery(ready(listBudgetsOptions()));
  const { org } = useCurrentOrg();
  // The one shared members query: only a name for each budget; without it, budgets still show, by id.
  const people = useOrgMembers(org?.id ?? '', { enabled: org !== undefined });
  const viewer = useViewer();
  const sorted = useMemo(
    () => (budgets.data === undefined ? undefined : sortBudgets(budgets.data.items)),
    [budgets.data],
  );
  return {
    spending: spending.data,
    switching: spending.isPlaceholderData,
    failure: failureOf(spending.error ?? budgets.error),
    budgets: sorted,
    people,
    canManage: viewer.canManage,
  };
}

export interface BudgetChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly save: (budget: Budget, onDone: () => void) => void;
  readonly saving: boolean;
  readonly failure: Error | undefined;
}

export function useBudgetChange(): BudgetChangeViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...setBudgetMutation(),
    onSuccess: async () => {
      // The spending carries the organization's budget too: its meter follows the new one.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listBudgetsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getSpendingQueryKey() }),
      ]);
    },
  });
  const { mutate } = mutation;
  const save = useCallback(
    (budget: Budget, onDone: () => void) => {
      mutate({ body: budget }, { onSuccess: onDone });
    },
    [mutate],
  );
  return { save, saving: mutation.isPending, failure: failureOf(mutation.error) };
}
