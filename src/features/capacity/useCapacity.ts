// SPDX-License-Identifier: Apache-2.0
import {
  getInferenceSettingsOptions,
  getInferenceSettingsQueryKey,
  getMemberCapacityOptions,
  getMemberPolicyOptions,
  getMemberPolicyQueryKey,
  listBudgetsOptions,
  listBudgetsQueryKey,
  listPoolBudgetsOptions,
  listPoolBudgetsQueryKey,
  savePoolBudgetMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { setBudget, setInferenceSettings, updateMemberPolicy } from '@gen/api/sdk.gen';
import type {
  BudgetDto,
  InferenceSettingsDto,
  MemberCapacityResponse,
  MemberPolicyResponse,
  PoolBudgetDto,
  UpdateMemberPolicyRequest,
} from '@gen/api/types.gen';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';

/** Every member's capacity (a key prefix): a weight or a pool's budget changes each share in the pool. */
const EVERY_CAPACITY = [{ _id: 'getMemberCapacity' }];

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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listPoolBudgetsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: EVERY_CAPACITY }),
      ]);
    },
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

/**
 * `GET /members/{login}/capacity` for each login (TeamCode's member capacity): their weight and pool share, their
 * spend since midnight UTC against their daily limit, and their requests running and waiting. A member whose capacity
 * could not be read has none in the map: their row leaves it out.
 */
export function useMemberCapacities(logins: readonly string[]): ReadonlyMap<string, MemberCapacityResponse> {
  const queries = useQueries({
    queries: logins.map((login) => ready(getMemberCapacityOptions({ path: { login } }), { retry: false })),
  });
  const capacities = new Map<string, MemberCapacityResponse>();
  for (const query of queries) if (query.data !== undefined) capacities.set(query.data.member, query.data);
  return capacities;
}

export interface MemberLimitsViewModel {
  /** The organization's budgets, once read: the members' daily caps. */
  readonly budgets: readonly BudgetDto[] | undefined;
  /** The inference settings, once read where the server has the admission queue: the members' concurrency. */
  readonly settings: InferenceSettingsDto | undefined;
  /** Both answered (or not asked): the forms wait for it, so a late answer never starts one again under the typing. */
  readonly settled: boolean;
}

/**
 * What TeamCode's member row adds to the pool, for an owner or an admin: the daily cap (`GET /budgets`, in dollars)
 * and the concurrent requests (`GET /inference/settings`). A value that could not be read leaves its field out.
 */
export function useMemberLimits(): MemberLimitsViewModel {
  const queued = useAnnounced('inference.queue.v1');
  const budgets = useQuery(ready(listBudgetsOptions(), { retry: false }));
  const settings = useQuery(ready(getInferenceSettingsOptions(), { enabled: queued, retry: false }));
  return {
    budgets: budgets.data?.items,
    settings: settings.data,
    settled: !budgets.isPending && (!queued || !settings.isPending),
  };
}

/** What one « Save limits » writes: only the parts that changed. */
export interface MemberLimitsChange {
  readonly policy?: UpdateMemberPolicyRequest | undefined;
  readonly budget?: BudgetDto | undefined;
  readonly settings?: InferenceSettingsDto | undefined;
}

/**
 * TeamCode's « Save limits », one member's form: their pool and weight (`PATCH /members/{login}/policy`), then their daily cap
 * (`PUT /budgets`), then their concurrent requests (`PUT /inference/settings`, written whole), each only if changed.
 * The first refusal stops the rest and is said.
 */
export function useMemberLimitsSave(login: string): SaveViewModel<MemberLimitsChange> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (change: MemberLimitsChange) => {
      const policy =
        change.policy === undefined
          ? undefined
          : (await updateMemberPolicy({ path: { login }, body: change.policy, throwOnError: true })).data;
      if (change.budget !== undefined) await setBudget({ body: change.budget, throwOnError: true });
      if (change.settings !== undefined)
        await setInferenceSettings({ body: change.settings, throwOnError: true });
      return policy;
    },
    // Only once everything is saved: the form starts again from what is read, so a refusal halfway keeps the form, the
    // values typed and the refusal on screen (a retry sends the policy again, which is the same).
    onSuccess: async (policy) => {
      if (policy !== undefined)
        queryClient.setQueryData(getMemberPolicyQueryKey({ path: { login } }), policy);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listBudgetsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getInferenceSettingsQueryKey() }),
      ]);
    },
    // A policy saved before a later refusal already changed the pool's shares; the form does not depend on them.
    onSettled: async () => queryClient.invalidateQueries({ queryKey: EVERY_CAPACITY }),
  });
  const { mutate } = mutation;
  return {
    // The form starts again from what the server saved: no `onDone` is needed.
    save: (change) => {
      mutate(change);
    },
    saving: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}
