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
import { listRules } from '@gen/api/sdk.gen';
import type { GateAction, ListRulesResponse, NewRule, Rule } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { appliedMutation } from '@/shared/api/applied';
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

/**
 * Every rule of the organization, a page after the other: the server gives at most 1 000 at a time (`next`, read back
 * as `after`), and the screen counts, filters and accepts them all.
 */
export async function everyRule(signal: AbortSignal): Promise<ListRulesResponse> {
  const items: Rule[] = [];
  let after: string | undefined;
  do {
    const query = after === undefined ? {} : { after };
    const { data } = await listRules({ query, signal, throwOnError: true });
    items.push(...data.items);
    after = data.next;
  } while (after !== undefined);
  return { items };
}

export function useRules(): RulesViewModel {
  const rules = useQuery(
    ready({
      ...listRulesOptions(),
      queryFn: async ({ signal }: { readonly signal: AbortSignal }) => everyRule(signal),
    }),
  );
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
  /** Whether a decision or an edit of this rule is on its way; several rules may be at once. */
  readonly saving: (id: string) => boolean;
  /** Why this rule's last decision or edit was refused, until the next one for this rule. */
  readonly failure: (id: string) => Error | undefined;
}

export function useRuleDecision(): RuleDecisionViewModel {
  const invalidate = useInvalidate();
  const { mutateAsync } = useMutation({ ...appliedMutation(updateRuleMutation()), onSettled: invalidate });
  // Each save keeps its own answer, by rule: one mutation observer would only remember the last one sent.
  const [pending, setPending] = useState<readonly string[]>([]);
  const [failures, setFailures] = useState<ReadonlyMap<string, unknown>>(new Map());
  const decide = useCallback(
    (id: string, change: RuleChange, onSaved?: () => void) => {
      setFailures((current) => new Map([...current].filter(([failed]) => failed !== id)));
      setPending((ids) => [...ids, id]);
      mutateAsync({ path: { id }, body: change })
        .then(onSaved, (error: unknown) => {
          setFailures((current) => new Map([...current, [id, error]]));
        })
        .finally(() => {
          // Only this save is done: another of the same rule may still be on its way.
          setPending((ids) => {
            const at = ids.indexOf(id);
            return [...ids.slice(0, at), ...ids.slice(at + 1)];
          });
        });
    },
    [mutateAsync],
  );
  const saving = useCallback((id: string) => pending.includes(id), [pending]);
  const failure = useCallback((id: string) => failureOf(failures.get(id)), [failures]);
  return { decide, saving, failure };
}

export interface BulkViewModel {
  readonly accept: (ids: readonly string[]) => void;
  readonly sending: boolean;
  readonly updated: number | undefined;
  readonly failure: Error | undefined;
}

export function useBulkAccept(): BulkViewModel {
  const invalidate = useInvalidate();
  const mutation = useMutation({ ...appliedMutation(bulkUpdateRulesMutation()), onSettled: invalidate });
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
  const mutation = useMutation({ ...appliedMutation(createRuleMutation()), onSettled: invalidate });
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
  /** The last delete was signed, until `dismiss`. */
  readonly deleted: boolean;
  /** Forgets the last delete, once the person moved on. */
  readonly dismiss: () => void;
  readonly failure: Error | undefined;
}

export function useDeleteRule(): DeleteRuleViewModel {
  const invalidate = useInvalidate();
  const mutation = useMutation({ ...appliedMutation(deleteRuleMutation()), onSettled: invalidate });
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
    // A delete on its way keeps its answer: only a settled one is forgotten.
    dismiss: mutation.isPending ? () => undefined : mutation.reset,
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
