// SPDX-License-Identifier: Apache-2.0
import {
  createInvitationLinkMutation,
  getMeOptions,
  inviteOrgMembersMutation,
  listInvitationsOptions,
  listInvitationsQueryKey,
  removeOrgMemberMutation,
  revokeInvitationMutation,
  updateOrgMemberMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  GovernanceConfirmationPending,
  Invitation,
  InvitationLink,
  OrgMember,
} from '@gen/api/types.gen';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { appliedOf, type HeldWrite, heldOf } from '@/shared/api/held';
import { ready } from '@/shared/api/ready';
import { meOf } from '@/shared/auth/me';
import { useDebounced } from '@/shared/lib/useDebounced';
import { orgMembersKey, useOrgMembers } from '@/shared/org/members';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { sortInvitations, sortMembers } from './model';

/** How long the typing pauses before the search is sent. */
export const SEARCH_PAUSE_MS = 250;

export interface MembersViewModel {
  /** How many people of the organization are read so far: the count the screen gives, whatever is searched. */
  readonly read: number | undefined;
  /** Every person of the organization is read. */
  readonly everyoneRead: boolean;
  /** The search the list shows, as sent: trimmed, empty for none. */
  readonly search: string;
  /** The people the list shows, a page of a hundred at a time: everyone, or those the search found. */
  readonly members: readonly OrgMember[] | undefined;
  /** The list shows the last search's people while the new one is read. */
  readonly stale: boolean;
  /** Reads the next hundred of the list; absent once all are read. */
  readonly more: (() => void) | undefined;
  readonly loadingMore: boolean;
  /** Why the search did not answer: the list and its box stay. */
  readonly searchFailure: Error | undefined;
  /** The live invitations, read by owners and admins only (the server refuses everyone else). */
  readonly invitations: readonly Invitation[] | undefined;
  /** Why the people did not load. */
  readonly failure: Error | undefined;
  /** Why the invitations did not load: said in their own section, the people still show. */
  readonly invitationsFailure: Error | undefined;
  /** The login of the person looking: their own role is never changed from here. */
  readonly viewer: string | undefined;
}

/**
 * The organization's people, and those the server finds for `search` (the start of a login or a name), sent once
 * the typing pauses; the search it replaces is called off as its query loses its last observer.
 */
export function useMembers(org: string, role: OrgRole | undefined, search = ''): MembersViewModel {
  const people = useOrgMembers(org);
  const q = useDebounced(search.trim(), SEARCH_PAUSE_MS);
  // Without a search, the same query as `people`: one read for both.
  // A failed search is said at once, not asked three more times; without one, the list's own options stand.
  const shown = useOrgMembers(
    org,
    q === '' ? { placeholderData: keepPreviousData } : { placeholderData: keepPreviousData, retry: false },
    q === '' ? undefined : q,
  );
  const invitations = useQuery(
    ready(listInvitationsOptions({ path: { org } }), { enabled: managesMembers(role), retry: false }),
  );
  // The same freshness as the top bar's: one `/me` for both.
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  // Sorted page by page: the next hundred come under the people already on screen, never among them.
  const sorted = useMemo(() => shown.pages?.flatMap(sortMembers), [shown.pages]);
  const pending = useMemo(
    () => (invitations.data === undefined ? undefined : sortInvitations(invitations.data.items)),
    [invitations.data],
  );
  return {
    read: people.members?.length,
    everyoneRead: people.complete,
    search: q,
    members: sorted,
    stale: shown.stale,
    // The next hundred of the search being read, not of the one still shown.
    more: shown.stale ? undefined : shown.more,
    loadingMore: shown.loadingMore,
    searchFailure: q === '' ? undefined : failureOf(shown.error),
    invitations: pending,
    failure: failureOf(people.error),
    invitationsFailure: failureOf(invitations.error),
    viewer: meOf(me.data)?.dev.login,
  };
}

function useInvalidate(org: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orgMembersKey(org) }),
      queryClient.invalidateQueries({ queryKey: listInvitationsQueryKey({ path: { org } }) }),
    ]);
  }, [queryClient, org]);
}

export interface RoleChangeViewModel extends HeldWrite {
  readonly change: (login: string, role: OrgRole) => void;
  readonly remove: (login: string) => void;
  /** The login whose role or membership is being saved. */
  readonly saving: string | undefined;
  /** The change the server held for a confirmation rather than applied (a token's write; never the console's). */
  readonly held: GovernanceConfirmationPending | undefined;
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
  return {
    change,
    remove,
    saving,
    held: heldOf(update.data ?? removal.data),
    // One of the two is reset when the other is sent: the later is the one that was.
    sentAt: Math.max(update.submittedAt, removal.submittedAt),
    failure: failureOf(update.error ?? removal.error),
  };
}

export interface InviteViewModel extends HeldWrite {
  /** Sends the invitations; `onSent` runs once the server took them (the form clears then, not before). */
  readonly invite: (emails: readonly string[], role: OrgRole, onSent: () => void) => void;
  readonly sending: boolean;
  /** The addresses the server sent an invitation to; those already in the organization are left out. */
  readonly invited: readonly string[] | undefined;
  /** The invitations the server held for a confirmation rather than sent. */
  readonly held: GovernanceConfirmationPending | undefined;
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
    invited: appliedOf(mutation.data)?.invited,
    held: heldOf(mutation.data),
    sentAt: mutation.submittedAt,
    failure: failureOf(mutation.error),
  };
}

export interface InviteLinkViewModel extends HeldWrite {
  readonly create: (role: OrgRole, maxUses: number) => void;
  readonly creating: boolean;
  /** The link just made: the only time its address is shown (it carries the secret). */
  readonly link: InvitationLink | undefined;
  /** The link the server held for a confirmation rather than made. */
  readonly held: GovernanceConfirmationPending | undefined;
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
    link: appliedOf(mutation.data),
    held: heldOf(mutation.data),
    sentAt: mutation.submittedAt,
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
