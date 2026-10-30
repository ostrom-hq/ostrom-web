// SPDX-License-Identifier: AGPL-3.0-only
import {
  bulkUpdateRulesMutation,
  listDecisionsQueryKey,
  listRulesOptions,
  listRulesQueryKey,
  updateRuleMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { Rule, RuleStatus, RuleStrength } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useViewer } from '@/shared/auth/useViewer';
import { ready } from '@/shared/api/ready';

export interface RulesViewModel {
  readonly rules: readonly Rule[] | undefined;
  readonly failure: Error | undefined;
  /** Owners and admins decide; everyone else reads. */
  readonly canDecide: boolean;
}

export function useRules(): RulesViewModel {
  const rules = useQuery(ready(listRulesOptions()));
  const viewer = useViewer();
  return {
    rules: rules.data?.items,
    failure: failureOf(rules.error),
    canDecide: viewer.canManage,
  };
}

function useInvalidate(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listRulesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: listDecisionsQueryKey() }),
    ]);
  }, [queryClient]);
}

export interface RuleChange {
  readonly status?: RuleStatus;
  readonly statement?: string;
  readonly strength?: RuleStrength;
}

export interface RuleDecisionViewModel {
  /** Sends a decision or an edit; `onSaved` runs once the server signed it (an editor closes then, not before). */
  readonly decide: (id: string, change: RuleChange, onSaved?: () => void) => void;
  /** The rule being saved. */
  readonly saving: string | undefined;
  readonly failure: Error | undefined;
}

export function useRuleDecision(): RuleDecisionViewModel {
  const invalidate = useInvalidate();
  const mutation = useMutation({ ...updateRuleMutation(), onSettled: invalidate });
  const { mutate } = mutation;
  const decide = useCallback(
    (id: string, change: RuleChange, onSaved?: () => void) => {
      mutate({ path: { id }, body: change }, onSaved === undefined ? {} : { onSuccess: onSaved });
    },
    [mutate],
  );
  return {
    decide,
    saving: mutation.isPending ? mutation.variables.path.id : undefined,
    failure: failureOf(mutation.error),
  };
}

export interface BulkViewModel {
  readonly accept: (ids: readonly string[]) => void;
  readonly sending: boolean;
  readonly updated: number | undefined;
  readonly failure: Error | undefined;
}

export function useBulkAccept(): BulkViewModel {
  const invalidate = useInvalidate();
  const mutation = useMutation({ ...bulkUpdateRulesMutation(), onSettled: invalidate });
  const { mutate } = mutation;
  const accept = useCallback(
    (ids: readonly string[]) => {
      mutate({ body: { ids: [...ids], status: 'accepted' } });
    },
    [mutate],
  );
  return {
    accept,
    sending: mutation.isPending,
    updated: mutation.data?.updated,
    failure: failureOf(mutation.error),
  };
}
