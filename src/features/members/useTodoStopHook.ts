// SPDX-License-Identifier: AGPL-3.0-only
import {
  listTodoStopHooksOptions,
  listTodoStopHooksQueryKey,
  setMemberTodoStopHookMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import { managesMembers, type OrgRole } from '@/shared/org/roles';

export interface TodoStopHookViewModel {
  /**
   * Whether a member's todo Stop hook is on; absent where the switch is not offered (the server does not announce
   * `todos.v1`, the viewer does not administer the organization, or the list could not be read).
   */
  readonly enabled: ((memberId: string) => boolean) | undefined;
  readonly set: (memberId: string, enabled: boolean) => void;
  /** The member whose switch is being saved. */
  readonly saving: string | undefined;
  readonly failure: Error | undefined;
}

/**
 * The per-member "Todo Stop hook" switch: the server lists the members whose hook is off (a member without a setting
 * has it on) and an owner or an admin changes one, with a browser session only.
 */
export function useTodoStopHook(role: OrgRole | undefined): TodoStopHookViewModel {
  const queryClient = useQueryClient();
  const offered = useAnnounced('todos.v1') && managesMembers(role);
  const list = useQuery(ready(listTodoStopHooksOptions(), { enabled: offered, retry: false }));
  const mutation = useMutation({
    ...setMemberTodoStopHookMutation(),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: listTodoStopHooksQueryKey() }),
  });
  const { mutate } = mutation;
  const off = useMemo(
    () =>
      list.data === undefined
        ? undefined
        : new Set(list.data.members.filter((hook) => !hook.enabled).map((hook) => hook.memberId)),
    [list.data],
  );
  const set = useCallback(
    (memberId: string, enabled: boolean) => {
      mutate({ path: { memberId }, body: { enabled } });
    },
    [mutate],
  );
  return {
    enabled: offered && off !== undefined ? (memberId) => !off.has(memberId) : undefined,
    set,
    saving: mutation.isPending ? mutation.variables.path.memberId : undefined,
    failure: failureOf(mutation.error),
  };
}
