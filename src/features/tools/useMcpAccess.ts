// SPDX-License-Identifier: Apache-2.0
import {
  assignMcpServerMutation,
  createMcpArgumentPolicyMutation,
  deleteMcpArgumentPolicyMutation,
  getMcpSettingsOptions,
  getMcpSettingsQueryKey,
  listMcpArgumentPoliciesOptions,
  listMcpArgumentPoliciesQueryKey,
  listMcpAssignmentsOptions,
  listMcpAssignmentsQueryKey,
  putMcpSettingsMutation,
  unassignMcpServerMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  McpArgumentPolicy,
  McpArgumentPolicyRequest,
  McpAssignment,
  McpAssignmentRequest,
  OrgMember,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { EVERYONE, sortAssignments } from './model';
import { sentInOrg, whenSameOrg } from '@/shared/org/sameOrg';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';
import type { OrgMembers } from '@/shared/org/members';

export interface McpSettingsViewModel {
  /** The prefix agents see before each relayed server's name. */
  readonly prefix: string | undefined;
  readonly failure: Error | undefined;
  /** `onDone` runs once the server took it. */
  readonly save: (prefix: string, onDone: () => void) => void;
  readonly saving: boolean;
  readonly saveFailure: Error | undefined;
}

/** The organization's relay settings: everyone reads them, owners and admins change them. */
export function useMcpSettings(): McpSettingsViewModel {
  const queryClient = useQueryClient();
  const settings = useQuery(ready(getMcpSettingsOptions()));
  const put = useMutation({
    ...putMcpSettingsMutation(),
    onMutate: sentInOrg,
    onSuccess: (saved, _body, sent) => {
      whenSameOrg(sent, () => {
        queryClient.setQueryData(getMcpSettingsQueryKey(), saved);
      });
    },
  });
  const { mutate } = put;
  const save = useCallback(
    (prefix: string, onDone: () => void) => {
      mutate({ body: { agentPrefix: prefix } }, { onSuccess: onDone });
    },
    [mutate],
  );
  return {
    prefix: settings.data?.agentPrefix,
    failure: failureOf(settings.error),
    save,
    saving: put.isPending,
    saveFailure: failureOf(put.error),
  };
}

export interface ServerAccessViewModel {
  /** Everyone first, then each member given the server. */
  readonly assignments: readonly McpAssignment[] | undefined;
  readonly policies: readonly McpArgumentPolicy[] | undefined;
  /** The organization's members, to name an assignment and to pick whom to give the server; absent if unreadable. */
  readonly members: readonly OrgMember[] | undefined;
  /** The next page of members, read when asked. */
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore'>;
  readonly failure: Error | undefined;
}

/** Who reaches one server and which calls it refuses or holds: read by owners and admins only, as the server does. */
export function useServerAccess(server: string): ServerAccessViewModel {
  const path = { name: server };
  const assignments = useQuery(ready(listMcpAssignmentsOptions({ path })));
  const policies = useQuery(ready(listMcpArgumentPoliciesOptions({ path })));
  // Only names: a refusal is not asked again, an assignment then reads as its member id.
  const members = useCurrentOrgMembers();
  const sorted = useMemo(
    () => (assignments.data === undefined ? undefined : sortAssignments(assignments.data.items)),
    [assignments.data],
  );
  return {
    assignments: sorted,
    policies: policies.data?.policies,
    members: members.members,
    people: { more: members.more, loadingMore: members.loadingMore },
    failure: failureOf(assignments.error ?? policies.error),
  };
}

export interface ServerAccessChangeViewModel {
  /** `member` is a member id or `all`; `onDone` runs once the server took it. */
  readonly assign: (member: string, request: McpAssignmentRequest, onDone: () => void) => void;
  readonly unassign: (member: string | undefined) => void;
  readonly addPolicy: (request: McpArgumentPolicyRequest, onDone: () => void) => void;
  readonly removePolicy: (id: string) => void;
  /** Something of this server is being saved. */
  readonly pending: boolean;
  readonly failure: Error | undefined;
}

export function useServerAccessChange(server: string): ServerAccessChangeViewModel {
  const queryClient = useQueryClient();
  const refreshAssignments = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listMcpAssignmentsQueryKey({ path: { name: server } }) });
  }, [queryClient, server]);
  const refreshPolicies = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: listMcpArgumentPoliciesQueryKey({ path: { name: server } }),
    });
  }, [queryClient, server]);
  const assigned = useMutation({ ...assignMcpServerMutation(), onSettled: refreshAssignments });
  const unassigned = useMutation({ ...unassignMcpServerMutation(), onSettled: refreshAssignments });
  const created = useMutation({ ...createMcpArgumentPolicyMutation(), onSettled: refreshPolicies });
  const deleted = useMutation({ ...deleteMcpArgumentPolicyMutation(), onSettled: refreshPolicies });
  const { mutate: assignMutate, reset: resetAssign } = assigned;
  const { mutate: unassignMutate, reset: resetUnassign } = unassigned;
  const { mutate: createMutate, reset: resetCreate } = created;
  const { mutate: deleteMutate, reset: resetDelete } = deleted;
  // One failure at a time: the last gesture's, never an older one left over.
  const resetAll = useCallback(() => {
    resetAssign();
    resetUnassign();
    resetCreate();
    resetDelete();
  }, [resetAssign, resetUnassign, resetCreate, resetDelete]);
  const assign = useCallback(
    (member: string, request: McpAssignmentRequest, onDone: () => void) => {
      resetAll();
      assignMutate({ path: { name: server, member }, body: request }, { onSuccess: onDone });
    },
    [assignMutate, resetAll, server],
  );
  const unassign = useCallback(
    (member: string | undefined) => {
      resetAll();
      unassignMutate({ path: { name: server, member: member ?? EVERYONE } });
    },
    [unassignMutate, resetAll, server],
  );
  const addPolicy = useCallback(
    (request: McpArgumentPolicyRequest, onDone: () => void) => {
      resetAll();
      createMutate({ path: { name: server }, body: request }, { onSuccess: onDone });
    },
    [createMutate, resetAll, server],
  );
  const removePolicy = useCallback(
    (id: string) => {
      resetAll();
      deleteMutate({ path: { name: server, policyId: id } });
    },
    [deleteMutate, resetAll, server],
  );
  return {
    assign,
    unassign,
    addPolicy,
    removePolicy,
    pending: assigned.isPending || unassigned.isPending || created.isPending || deleted.isPending,
    failure: failureOf(assigned.error ?? unassigned.error ?? created.error ?? deleted.error),
  };
}
