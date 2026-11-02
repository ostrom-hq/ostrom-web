// SPDX-License-Identifier: AGPL-3.0-only
import {
  getApproversGraphOptions,
  getGatePolicyOptions,
  getGatePolicyQueryKey,
  listMembersOptions,
  listWorkflowsOptions,
  setGatePolicyMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { ApproversGraph } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { type ApprovalPoint, approvalPoints, type SelfApprovalPolicy } from './model';

export interface ApproversViewModel {
  readonly points: readonly ApprovalPoint[] | undefined;
  /** Who approves what, as the gates decide it on the server: by person, the gates naming nobody, what no gate covers. */
  readonly graph: ApproversGraph | undefined;
  /** The server does not serve it (an older server): the steps of the workflows still show. */
  readonly graphUnavailable: boolean;
  readonly failure: Error | undefined;
  /** A login with the name the organization knows, or the login alone. */
  readonly nameOf: (login: string) => string;
}

export function useApprovers(): ApproversViewModel {
  const workflows = useQuery(ready(listWorkflowsOptions()));
  const members = useQuery(ready(listMembersOptions()));
  // Read again on every visit: a workflow changed elsewhere changes who approves what.
  const graph = useQuery(ready(getApproversGraphOptions(), { staleTime: 0, retry: false }));
  // Only a server without the route says nothing; any other failure is the page's, and no stale graph shows.
  const graphUnavailable = isApiFailure(graph.error) && graph.error.kind === 'not-found';
  const points = useMemo(
    () => (workflows.data === undefined ? undefined : approvalPoints(workflows.data.items)),
    [workflows.data],
  );
  const names = useMemo(
    () =>
      new Map(
        (members.data?.items ?? []).map((member) => [
          member.login,
          member.name === undefined || member.name === '' ? member.login : member.name,
        ]),
      ),
    [members.data],
  );
  const nameOf = useCallback((login: string) => names.get(login) ?? login, [names]);
  return {
    points,
    graph: graph.isError ? undefined : graph.data,
    graphUnavailable,
    failure: failureOf(workflows.error ?? (graphUnavailable ? null : graph.error) ?? members.error),
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
  const policy = useQuery(ready(getGatePolicyOptions()));
  const viewer = useViewer();
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
  return {
    policy: policy.data?.selfApproval,
    canEdit: viewer.canManage,
    set,
    saving: mutation.isPending,
    failure: failureOf(mutation.error ?? policy.error),
  };
}
