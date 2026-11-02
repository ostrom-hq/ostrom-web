// SPDX-License-Identifier: AGPL-3.0-only
import {
  bulkUpdateRulesMutation,
  createRuleMutation,
  deleteRuleMutation,
  getGateCatalogOptions,
  getGateCatalogQueryKey,
  listDecisionsQueryKey,
  listRulesOptions,
  listRulesQueryKey,
  updateRuleMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { GateAction, NewRule, Rule } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useViewer } from '@/shared/auth/useViewer';
import { ready } from '@/shared/api/ready';
import type { RuleChange } from './model';

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
      // The catalogue holds the actions of the decided rules' gates.
      queryClient.invalidateQueries({ queryKey: getGateCatalogQueryKey() }),
    ]);
  }, [queryClient]);
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
  const { mutateAsync } = mutation;
  const decide = useCallback(
    (id: string, change: RuleChange, onSaved?: () => void) => {
      // Each save keeps its own answer: a decision on another rule meanwhile never loses this one's `onSaved`.
      mutateAsync({ path: { id }, body: change }).then(onSaved, () => undefined);
    },
    [mutateAsync],
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

export interface CreateRuleViewModel {
  /** Writes the rule; `onSaved` runs once the server signed it, so the form empties then, not before. */
  readonly create: (rule: NewRule, onSaved: () => void) => void;
  readonly creating: boolean;
  readonly failure: Error | undefined;
}

export function useCreateRule(): CreateRuleViewModel {
  const invalidate = useInvalidate();
  const mutation = useMutation({ ...createRuleMutation(), onSettled: invalidate });
  const { mutate } = mutation;
  const create = useCallback(
    (rule: NewRule, onSaved: () => void) => {
      mutate({ body: rule }, { onSuccess: onSaved });
    },
    [mutate],
  );
  return { create, creating: mutation.isPending, failure: failureOf(mutation.error) };
}

export interface DeleteRuleViewModel {
  readonly remove: (id: string) => void;
  /** The rule being deleted. */
  readonly deleting: string | undefined;
  /** The last delete was signed. */
  readonly deleted: boolean;
  readonly failure: Error | undefined;
}

export function useDeleteRule(): DeleteRuleViewModel {
  const invalidate = useInvalidate();
  const mutation = useMutation({ ...deleteRuleMutation(), onSettled: invalidate });
  const { mutate } = mutation;
  const remove = useCallback(
    (id: string) => {
      mutate({ path: { id } });
    },
    [mutate],
  );
  return {
    remove,
    deleting: mutation.isPending ? mutation.variables.path.id : undefined,
    deleted: mutation.isSuccess,
    failure: failureOf(mutation.error),
  };
}

export interface GateCatalogViewModel {
  readonly actions: readonly GateAction[] | undefined;
  readonly failure: Error | undefined;
}

/** The actions a gate can cover, read from the catalogue the hooks and the gates decide on; only once a gate is drawn. */
export function useGateCatalog(enabled: boolean): GateCatalogViewModel {
  const catalog = useQuery(ready(getGateCatalogOptions(), { enabled, retry: false }));
  return { actions: catalog.data?.actions, failure: failureOf(catalog.error) };
}
