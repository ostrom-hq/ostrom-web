// SPDX-License-Identifier: AGPL-3.0-only
import {
  getGatePolicyOptions,
  getGatePolicyQueryKey,
  getMeOptions,
  listMembersOptions,
  listWorkflowsOptions,
  setGatePolicyMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { type ApprovalPoint, approvalPoints, byPerson, type PersonApprovals, type SelfApprovalPolicy } from './model';

export interface ApproversViewModel {
  readonly points: readonly ApprovalPoint[] | undefined;
  readonly people: readonly PersonApprovals[] | undefined;
  readonly failure: Error | undefined;
  /** A login with the name the organization knows, or the login alone. */
  readonly nameOf: (login: string) => string;
}

export function useApprovers(): ApproversViewModel {
  const workflows = useQuery(listWorkflowsOptions());
  const members = useQuery(listMembersOptions());
  const points = useMemo(
    () => (workflows.data === undefined ? undefined : approvalPoints(workflows.data.items)),
    [workflows.data],
  );
  const names = useMemo(
    () => new Map((members.data?.items ?? []).map((member) => [member.login, member.name ?? member.login])),
    [members.data],
  );
  const nameOf = useCallback((login: string) => names.get(login) ?? login, [names]);
  return {
    points,
    people: points === undefined ? undefined : byPerson(points),
    failure: failureOf(workflows.error),
    nameOf,
  };
}

export interface PolicyViewModel {
  readonly policy: string | undefined;
  readonly canEdit: boolean;
  readonly set: (policy: SelfApprovalPolicy) => void;
  readonly saving: boolean;
  readonly failure: Error | undefined;
}

export function useSelfApprovalPolicy(): PolicyViewModel {
  const queryClient = useQueryClient();
  const policy = useQuery(getGatePolicyOptions());
  const me = useQuery({ ...getMeOptions(), staleTime: 60_000 });
  const mutation = useMutation({
    ...setGatePolicyMutation(),
    onSuccess: (data) => {
      queryClient.setQueryData(getGatePolicyQueryKey(), data);
    },
  });
  const { mutate } = mutation;
  const set = useCallback(
    (value: SelfApprovalPolicy) => {
      mutate({ body: { selfApproval: value } });
    },
    [mutate],
  );
  const role = me.data?.member?.role;
  return {
    policy: policy.data?.selfApproval,
    canEdit: role === 'owner' || role === 'admin',
    set,
    saving: mutation.isPending,
    failure: failureOf(mutation.error ?? policy.error),
  };
}
