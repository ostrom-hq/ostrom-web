// SPDX-License-Identifier: AGPL-3.0-only
import {
  createInvitationLinkMutation,
  getMeOptions,
  inviteOrgMembersMutation,
  listInvitationsOptions,
  listInvitationsQueryKey,
  listOrgMembersOptions,
  listOrgMembersQueryKey,
  removeOrgMemberMutation,
  revokeInvitationMutation,
  updateOrgMemberMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { Invitation, InvitationLink, OrgMember } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { meOf } from '@/shared/auth/me';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { sortInvitations, sortMembers } from './model';

export interface MembersViewModel {
  readonly members: readonly OrgMember[] | undefined;
  /** The live invitations, read by owners and admins only (the server refuses everyone else). */
  readonly invitations: readonly Invitation[] | undefined;
  /** Why the people did not load. */
  readonly failure: Error | undefined;
  /** Why the invitations did not load: said in their own section, the people still show. */
  readonly invitationsFailure: Error | undefined;
  /** The login of the person looking: their own role is never changed from here. */
  readonly viewer: string | undefined;
}

export function useMembers(org: string, role: OrgRole | undefined): MembersViewModel {
  const members = useQuery(ready(listOrgMembersOptions({ path: { org } })));
  const invitations = useQuery(
    ready(listInvitationsOptions({ path: { org } }), { enabled: managesMembers(role), retry: false }),
  );
  // The same freshness as the top bar's: one `/me` for both.
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  const sorted = useMemo(
    () => (members.data === undefined ? undefined : sortMembers(members.data.items)),
    [members.data],
  );
  const pending = useMemo(
    () => (invitations.data === undefined ? undefined : sortInvitations(invitations.data.items)),
    [invitations.data],
  );
  return {
    members: sorted,
    invitations: pending,
    failure: failureOf(members.error),
    invitationsFailure: failureOf(invitations.error),
    viewer: meOf(me.data)?.dev.login,
  };
}

function useInvalidate(org: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listOrgMembersQueryKey({ path: { org } }) }),
      queryClient.invalidateQueries({ queryKey: listInvitationsQueryKey({ path: { org } }) }),
    ]);
  }, [queryClient, org]);
}

export interface RoleChangeViewModel {
  readonly change: (login: string, role: OrgRole) => void;
  readonly remove: (login: string) => void;
  /** The login whose role or membership is being saved. */
  readonly saving: string | undefined;
  readonly failure: Error | undefined;
}

export function useRoleChange(org: string): RoleChangeViewModel {
  const invalidate = useInvalidate(org);
  const update = useMutation({ ...updateOrgMemberMutation(), onSettled: invalidate });
  const removal = useMutation({ ...removeOrgMemberMutation(), onSettled: invalidate });
  const { mutate: updateMutate, reset: resetUpdate } = update;
  const { mutate: removeMutate, reset: resetRemoval } = removal;
  const change = useCallback(
    (login: string, role: OrgRole) => {
      resetRemoval();
      updateMutate({ path: { org, login }, body: { role } });
    },
    [updateMutate, resetRemoval, org],
  );
  const remove = useCallback(
    (login: string) => {
      resetUpdate();
      removeMutate({ path: { org, login } });
    },
    [removeMutate, resetUpdate, org],
  );
  let saving: string | undefined;
  if (update.isPending) saving = update.variables.path.login;
  else if (removal.isPending) saving = removal.variables.path.login;
  return { change, remove, saving, failure: failureOf(update.error ?? removal.error) };
}

export interface InviteViewModel {
  /** Sends the invitations; `onSent` runs once the server took them (the form clears then, not before). */
  readonly invite: (emails: readonly string[], role: OrgRole, onSent: () => void) => void;
  readonly sending: boolean;
  /** The addresses the server sent an invitation to; those already in the organization are left out. */
  readonly invited: readonly string[] | undefined;
  readonly failure: Error | undefined;
}

export function useInvite(org: string): InviteViewModel {
  const invalidate = useInvalidate(org);
  const mutation = useMutation({ ...inviteOrgMembersMutation(), onSuccess: invalidate });
  const { mutate } = mutation;
  const invite = useCallback(
    (emails: readonly string[], role: OrgRole, onSent: () => void) => {
      mutate(
        { path: { org }, body: { invites: emails.map((email) => ({ email, role })) } },
        { onSuccess: onSent },
      );
    },
    [mutate, org],
  );
  return {
    invite,
    sending: mutation.isPending,
    invited: mutation.data?.invited,
    failure: failureOf(mutation.error),
  };
}

export interface InviteLinkViewModel {
  readonly create: (role: OrgRole, maxUses: number) => void;
  readonly creating: boolean;
  /** The link just made: the only time its address is shown (it carries the secret). */
  readonly link: InvitationLink | undefined;
  readonly failure: Error | undefined;
}

export function useInviteLink(org: string): InviteLinkViewModel {
  const invalidate = useInvalidate(org);
  const mutation = useMutation({ ...createInvitationLinkMutation(), onSuccess: invalidate });
  const { mutate } = mutation;
  const create = useCallback(
    (role: OrgRole, maxUses: number) => {
      mutate({ path: { org }, body: { role, maxUses } });
    },
    [mutate, org],
  );
  return {
    create,
    creating: mutation.isPending,
    link: mutation.data,
    failure: failureOf(mutation.error),
  };
}

export interface RevokeViewModel {
  readonly revoke: (id: string) => void;
  readonly revoking: string | undefined;
  readonly failure: Error | undefined;
}

export function useRevokeInvitation(org: string): RevokeViewModel {
  const invalidate = useInvalidate(org);
  const mutation = useMutation({ ...revokeInvitationMutation(), onSettled: invalidate });
  const { mutate } = mutation;
  const revoke = useCallback(
    (id: string) => {
      mutate({ path: { org, id } });
    },
    [mutate, org],
  );
  return {
    revoke,
    revoking: mutation.isPending ? mutation.variables.path.id : undefined,
    failure: failureOf(mutation.error),
  };
}
