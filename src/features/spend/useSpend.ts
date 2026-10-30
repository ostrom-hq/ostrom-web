// SPDX-License-Identifier: AGPL-3.0-only
import {
  getSpendingOptions,
  listBudgetsOptions,
  listBudgetsQueryKey,
  setBudgetMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { Budget, Spending } from '@gen/api/types.gen';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useViewer } from '@/shared/auth/useViewer';
import { type Period, sortBudgets } from './model';

export interface SpendViewModel {
  readonly spending: Spending | undefined;
  /** The previous period stays on screen while the next one loads. */
  readonly switching: boolean;
  readonly failure: Error | undefined;
  readonly budgets: readonly Budget[] | undefined;
  readonly canManage: boolean;
}

export function useSpend(period: Period): SpendViewModel {
  const spending = useQuery({
    ...getSpendingOptions({ query: { period } }),
    placeholderData: keepPreviousData,
  });
  const budgets = useQuery(listBudgetsOptions());
  const viewer = useViewer();
  const sorted = useMemo(
    () => (budgets.data === undefined ? undefined : sortBudgets(budgets.data.items)),
    [budgets.data],
  );
  return {
    spending: spending.data,
    switching: spending.isPlaceholderData,
    failure: failureOf(spending.error),
    budgets: sorted,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listBudgetsQueryKey() }),
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
