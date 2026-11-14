// SPDX-License-Identifier: Apache-2.0
import {
  getApproversGraphOptions,
  getGatePolicyOptions,
  getGatePolicyQueryKey,
  listWorkflowsOptions,
  setGatePolicyMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { ApproversGraph } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { appliedMutation } from '@/shared/api/applied';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { type ApprovalPoint, approvalPoints, type SelfApprovalPolicy } from './model';
import { sentInOrg, whenSameOrg } from '@/shared/org/sameOrg';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';

export interface ApproversViewModel {
  /** The steps, as soon as the workflows come: a slow graph never holds them. */
  readonly points: readonly ApprovalPoint[] | undefined;
  /** Who approves what, as the gates decide it on the server: by person, the gates naming nobody, what no gate covers. */
  readonly graph: ApproversGraph | undefined;
  /** The server does not serve it (an older server): the steps of the workflows still show. */
  readonly graphUnavailable: boolean;
  /** Why the graph did not come; the steps still show, with this in place of the notes and the people. */
  readonly graphFailure: Error | undefined;
  readonly failure: Error | undefined;
  /** A login with the name the organization knows, or the login alone. */
  readonly nameOf: (login: string) => string;
}

export function useApprovers(): ApproversViewModel {
  const workflows = useQuery(ready(listWorkflowsOptions()));
  const members = useCurrentOrgMembers();
  // Read again on every visit: a workflow changed elsewhere changes who approves what.
  const graph = useQuery(ready(getApproversGraphOptions(), { staleTime: 0, retry: false }));
  // A server without the route says nothing; any other failure says why. Neither leaves a stale graph on screen.
  const graphUnavailable = isApiFailure(graph.error) && graph.error.kind === 'not-found';
  const points = useMemo(
    () => (workflows.data === undefined ? undefined : approvalPoints(workflows.data.items)),
    [workflows.data],
  );
  const names = useMemo(
    () =>
      new Map(
        (members.members ?? []).map((member) => [
          member.login,
          member.name === '' ? member.login : member.name,
        ]),
      ),
    [members.members],
  );
  const nameOf = useCallback((login: string) => names.get(login) ?? login, [names]);
  return {
    points,
    graph: graph.isError ? undefined : graph.data,
    graphUnavailable,
    graphFailure: graphUnavailable ? undefined : failureOf(graph.error),
    failure: failureOf(workflows.error ?? members.error),
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
    ...appliedMutation(setGatePolicyMutation()),
    onMutate: sentInOrg,
    onSuccess: (data, _body, sent) => {
      whenSameOrg(sent, () => {
        queryClient.setQueryData(getGatePolicyQueryKey(), data);
      });
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
