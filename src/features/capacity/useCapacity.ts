// SPDX-License-Identifier: Apache-2.0
import {
  getMemberPolicyOptions,
  getMemberPolicyQueryKey,
  listPoolBudgetsOptions,
  listPoolBudgetsQueryKey,
  savePoolBudgetMutation,
  updateMemberPolicyMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { MemberPolicyResponse, PoolBudgetDto, UpdateMemberPolicyRequest } from '@gen/api/types.gen';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface PoolBudgetsViewModel {
  readonly budgets: readonly PoolBudgetDto[] | undefined;
  readonly failure: Error | undefined;
}

/** `GET /pools/budgets`: the named pools' daily budgets and which lend as shared overflow (owners and admins). */
export function usePoolBudgets(enabled: boolean): PoolBudgetsViewModel {
  const query = useQuery(ready(listPoolBudgetsOptions(), { enabled, retry: false }));
  return { budgets: query.data, failure: failureOf(query.error) };
}

export interface SaveViewModel<T> {
  /** `onDone` runs once the server took it: the form starts again from what it saved. */
  readonly save: (value: T, onDone?: () => void) => void;
  readonly saving: boolean;
  readonly failure: Error | undefined;
}

/** `PUT /pools/budgets`, one form's: each pool's form says its own refusal. */
export function usePoolBudgetSave(): SaveViewModel<PoolBudgetDto> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...savePoolBudgetMutation(),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: listPoolBudgetsQueryKey() }),
  });
  const { mutate } = mutation;
  return {
    save: (body, onDone) => {
      mutate({ body }, { onSuccess: () => onDone?.() });
    },
    saving: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}

export interface MemberPoliciesViewModel {
  /** By login, the policies read so far. */
  readonly policies: ReadonlyMap<string, MemberPolicyResponse>;
  /** Every policy asked for is read. */
  readonly complete: boolean;
  readonly failure: Error | undefined;
}

/** `GET /members/{login}/policy` for each login: their home pool and whether they may borrow shared overflow. */
export function useMemberPolicies(logins: readonly string[]): MemberPoliciesViewModel {
  const queries = useQueries({
    queries: logins.map((login) => ready(getMemberPolicyOptions({ path: { login } }), { retry: false })),
  });
  const policies = new Map<string, MemberPolicyResponse>();
  for (const query of queries) if (query.data !== undefined) policies.set(query.data.member, query.data);
  return {
    policies,
    complete: queries.every((query) => query.data !== undefined),
    failure: failureOf(queries.find((query) => query.error !== null)?.error),
  };
}

/** `PATCH /members/{login}/policy`, one member's form: the whole pool policy, its home pool always sent. */
export function useMemberPolicySave(login: string): SaveViewModel<UpdateMemberPolicyRequest> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...updateMemberPolicyMutation(),
    onSuccess: (policy) => {
      queryClient.setQueryData(getMemberPolicyQueryKey({ path: { login } }), policy);
    },
  });
  const { mutate } = mutation;
  return {
    save: (body, onDone) => {
      mutate({ path: { login }, body }, { onSuccess: () => onDone?.() });
    },
    saving: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}
