// SPDX-License-Identifier: AGPL-3.0-only
import {
  addGroupMemberMutation,
  createGroupMutation,
  deleteGroupMutation,
  getGroupOptions,
  getGroupQueryKey,
  listGroupsOptions,
  listGroupsQueryKey,
  listSharedAccountsOptions,
  pauseGroupMemberMutation,
  removeGroupMemberMutation,
  updateGroupMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { CreateGroupData, Group, OrgMember, SharedAccount } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { type OrgMembers, useOrgMembers } from '@/shared/org/members';
import { managesMembers } from '@/shared/org/roles';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { isGone } from './groups';

/** What every group screen reads beside the groups: the names it shows, and whether the person may change them. */
export interface GroupsContext {
  /** The shared subscriptions the person reads, to name the ones a group lends (by id). */
  readonly accounts: readonly SharedAccount[] | undefined;
  /** The organization's members: the ones to add, and who of a group left (named by id then). */
  readonly members: readonly OrgMember[] | undefined;
  /** The next page of members, and whether every page is read (only then is anyone said to have left). */
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore' | 'complete'>;
  /** Owners and admins change groups; the server refuses anyone else (403). */
  readonly canManage: boolean;
  readonly failure: Error | undefined;
}

function useGroupsContext(): GroupsContext {
  const current = useCurrentOrg();
  const { org } = current;
  // Only names: a refusal is said once, not asked again, and the groups still show.
  const accounts = useQuery(ready(listSharedAccountsOptions(), { retry: false }));
  const people = useOrgMembers(org?.id ?? '', { enabled: org !== undefined, retry: false });
  return {
    accounts: accounts.data?.items,
    members: people.members,
    people: { more: people.more, loadingMore: people.loadingMore, complete: people.complete },
    canManage: managesMembers(current.role),
    failure: failureOf(accounts.error ?? people.error) ?? current.failure,
  };
}

export interface GroupsViewModel extends GroupsContext {
  readonly groups: readonly Group[] | undefined;
}

export function useGroups(): GroupsViewModel {
  const groups = useQuery(ready(listGroupsOptions()));
  const context = useGroupsContext();
  return {
    ...context,
    groups: groups.data?.items,
    failure: failureOf(groups.error) ?? context.failure,
  };
}

export interface GroupViewModel extends GroupsContext {
  readonly group: Group | undefined;
  /** Deleted, or of another organization: the screen goes back to the list and says so. */
  readonly gone: boolean;
}

export function useGroup(id: string): GroupViewModel {
  // A group that is not there stays so: never asked three more times.
  const group = useQuery(ready(getGroupOptions({ path: { id } }), { retry: false }));
  const context = useGroupsContext();
  const failure = failureOf(group.error);
  return {
    ...context,
    group: group.data,
    gone: isGone(failure),
    failure: failure ?? context.failure,
  };
}

export type NewGroup = CreateGroupData['body'];

/** A refusal is shown through `failure`, not thrown at the caller. */
function ignore(): undefined {
  return undefined;
}

export interface GroupChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly create: (body: NewGroup, onDone: () => void) => void;
  readonly rename: (id: string, name: string, onDone: () => void) => void;
  /** The whole list of subscriptions lent: an empty one lends nothing. */
  readonly lend: (id: string, accounts: readonly string[], onDone: () => void) => void;
  readonly add: (id: string, login: string, onDone: () => void) => void;
  readonly remove: (id: string, login: string) => void;
  /** Until an instant; an instant already past ends the pause. */
  readonly pause: (id: string, login: string, until: string) => void;
  readonly drop: (id: string, onDone: () => void) => void;
  readonly pending: boolean;
  readonly failure: Error | undefined;
}

export function useGroupChange(): GroupChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    async (id?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listGroupsQueryKey() }),
        id === undefined
          ? undefined
          : queryClient.invalidateQueries({ queryKey: getGroupQueryKey({ path: { id } }) }),
      ]);
    },
    [queryClient],
  );
  const created = useMutation({ ...createGroupMutation(), onSettled: async () => refresh() });
  const updated = useMutation({
    ...updateGroupMutation(),
    onSettled: async (_data, _error, variables) => refresh(variables.path.id),
  });
  const added = useMutation({
    ...addGroupMemberMutation(),
    onSettled: async (_data, _error, variables) => refresh(variables.path.id),
  });
  const removed = useMutation({
    ...removeGroupMemberMutation(),
    onSettled: async (_data, _error, variables) => refresh(variables.path.id),
  });
  const paused = useMutation({
    ...pauseGroupMemberMutation(),
    onSettled: async (_data, _error, variables) => refresh(variables.path.id),
  });
  // A deleted group's own page is left, never asked for again: only the list is refreshed.
  const dropped = useMutation({ ...deleteGroupMutation(), onSettled: async () => refresh() });
  const all = [created, updated, added, removed, paused, dropped];
  const { mutateAsync: createAsync, reset: resetCreate } = created;
  const { mutateAsync: updateAsync, reset: resetUpdate } = updated;
  const { mutateAsync: addAsync, reset: resetAdd } = added;
  const { mutate: removeMutate, reset: resetRemove } = removed;
  const { mutate: pauseMutate, reset: resetPause } = paused;
  const { mutateAsync: dropAsync, reset: resetDrop } = dropped;
  // One change at a time: a new one clears what the last one said.
  const clear = useCallback(() => {
    resetCreate();
    resetUpdate();
    resetAdd();
    resetRemove();
    resetPause();
    resetDrop();
  }, [resetCreate, resetUpdate, resetAdd, resetRemove, resetPause, resetDrop]);
  return {
    create: useCallback(
      (body: NewGroup, onDone: () => void) => {
        clear();
        createAsync({ body }).then(onDone, ignore);
      },
      [createAsync, clear],
    ),
    rename: useCallback(
      (id: string, name: string, onDone: () => void) => {
        clear();
        updateAsync({ path: { id }, body: { name } }).then(onDone, ignore);
      },
      [updateAsync, clear],
    ),
    lend: useCallback(
      (id: string, accounts: readonly string[], onDone: () => void) => {
        clear();
        updateAsync({ path: { id }, body: { accounts: [...accounts] } }).then(onDone, ignore);
      },
      [updateAsync, clear],
    ),
    add: useCallback(
      (id: string, login: string, onDone: () => void) => {
        clear();
        addAsync({ path: { id, login } }).then(onDone, ignore);
      },
      [addAsync, clear],
    ),
    remove: useCallback(
      (id: string, login: string) => {
        clear();
        removeMutate({ path: { id, login } });
      },
      [removeMutate, clear],
    ),
    pause: useCallback(
      (id: string, login: string, until: string) => {
        clear();
        pauseMutate({ path: { id, login }, body: { until } });
      },
      [pauseMutate, clear],
    ),
    drop: useCallback(
      (id: string, onDone: () => void) => {
        clear();
        dropAsync({ path: { id } }).then(() => {
          onDone();
          // Gone: its page is never shown again from what was read before.
          queryClient.removeQueries({ queryKey: getGroupQueryKey({ path: { id } }) });
        }, ignore);
      },
      [dropAsync, clear, queryClient],
    ),
    pending: all.some((mutation) => mutation.isPending),
    failure: failureOf(all.find((mutation) => mutation.error !== null)?.error),
  };
}
