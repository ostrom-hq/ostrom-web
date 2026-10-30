// SPDX-License-Identifier: AGPL-3.0-only
import {
  getMeOptions,
  getOrganizationOptions,
  inviteMembersMutation,
  listMembersOptions,
  listMembersQueryKey,
  listTeamsOptions,
  updateMemberMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { Member, Organization, Team } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { type AssignableRole, canManage, sortMembers } from './model';

export interface MembersViewModel {
  readonly organization: Organization | undefined;
  readonly members: readonly Member[] | undefined;
  readonly teams: readonly Team[] | undefined;
  readonly failure: Error | undefined;
  /** The login of the person looking: their own role is never changed from here. */
  readonly viewer: string | undefined;
  readonly canManage: boolean;
}

export function useMembers(): MembersViewModel {
  const organization = useQuery(getOrganizationOptions());
  const members = useQuery(listMembersOptions());
  const teams = useQuery(listTeamsOptions());
  const me = useQuery({ ...getMeOptions(), staleTime: 60_000 });
  const sorted = useMemo(
    () => (members.data === undefined ? undefined : sortMembers(members.data.items)),
    [members.data],
  );
  return {
    organization: organization.data,
    members: sorted,
    teams: teams.data?.items,
    failure: failureOf(members.error ?? organization.error),
    viewer: me.data?.dev.login,
    canManage: canManage(me.data?.member?.role),
  };
}

function useInvalidateMembers(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: listMembersQueryKey() }), [queryClient]);
}

export interface RoleChangeViewModel {
  readonly change: (login: string, role: AssignableRole) => void;
  /** The login whose role is being saved. */
  readonly saving: string | undefined;
  readonly failure: Error | undefined;
}

export function useRoleChange(): RoleChangeViewModel {
  const invalidate = useInvalidateMembers();
  const mutation = useMutation({ ...updateMemberMutation(), onSettled: invalidate });
  const { mutate } = mutation;
  const change = useCallback(
    (login: string, role: AssignableRole) => {
      mutate({ path: { login }, body: { role } });
    },
    [mutate],
  );
  return {
    change,
    saving: mutation.isPending ? mutation.variables.path.login : undefined,
    failure: failureOf(mutation.error),
  };
}

export interface InviteViewModel {
  /** Sends the invitations; `onSent` runs once the server took them (the form clears then, not before). */
  readonly invite: (emails: readonly string[], role: AssignableRole, onSent: () => void) => void;
  readonly sending: boolean;
  /** The addresses the server sent an invitation to; those already in the organization are left out. */
  readonly invited: readonly string[] | undefined;
  readonly failure: Error | undefined;
}

export function useInvite(): InviteViewModel {
  const invalidate = useInvalidateMembers();
  const mutation = useMutation({ ...inviteMembersMutation(), onSuccess: invalidate });
  const { mutate } = mutation;
  const invite = useCallback(
    (emails: readonly string[], role: AssignableRole, onSent: () => void) => {
      mutate({ body: { invites: emails.map((email) => ({ email, role })) } }, { onSuccess: onSent });
    },
    [mutate],
  );
  return {
    invite,
    sending: mutation.isPending,
    invited: mutation.data?.invited,
    failure: failureOf(mutation.error),
  };
}
