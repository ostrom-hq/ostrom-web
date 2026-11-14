// SPDX-License-Identifier: Apache-2.0
import {
  addInstanceAdminMutation,
  getMeOptions,
  listInstanceAdminsOptions,
  listInstanceAdminsQueryKey,
  listInstanceSettingsOptions,
  listInstanceSettingsQueryKey,
  removeInstanceAdminMutation,
  saveInstanceSettingsMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { InstanceAdmin, InstanceSettings, SaveInstanceSettingsRequest } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { meOf } from '@/shared/auth/me';

export interface InstanceAdminsViewModel {
  readonly admins: readonly InstanceAdmin[] | undefined;
  /** The login of the person looking: they are marked in the list. */
  readonly viewer: string | undefined;
  readonly failure: Error | undefined;
}

/** The instance's administrators, oldest first, read afresh on each visit. */
export function useInstanceAdmins(): InstanceAdminsViewModel {
  const query = useQuery(ready(listInstanceAdminsOptions(), { staleTime: 0 }));
  // The same read as the rest of the console: one `/auth/me` for all.
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  return { admins: query.data?.admins, viewer: meOf(me.data)?.dev.login, failure: failureOf(query.error) };
}

export interface AddAdminViewModel {
  /** Makes the person with this verified e-mail an administrator; `onAdded` runs once the server took it. */
  readonly add: (email: string, onAdded: () => void) => void;
  readonly adding: boolean;
  readonly failure: Error | undefined;
}

export function useAddInstanceAdmin(): AddAdminViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...addInstanceAdminMutation(),
    onSuccess: (list) => {
      queryClient.setQueryData(listInstanceAdminsQueryKey(), list);
    },
  });
  const { mutate } = mutation;
  const add = useCallback(
    (email: string, onAdded: () => void) => {
      mutate({ body: { email } }, { onSuccess: onAdded });
    },
    [mutate],
  );
  return { add, adding: mutation.isPending, failure: failureOf(mutation.error) };
}

export interface RemoveAdminViewModel {
  readonly remove: (userId: string) => void;
  /** The administrator being removed. */
  readonly removing: string | undefined;
  readonly failure: Error | undefined;
}

export function useRemoveInstanceAdmin(): RemoveAdminViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...removeInstanceAdminMutation(),
    // Settled either way: a refused removal (the last one) leaves the list as the server has it.
    onSettled: async () => queryClient.invalidateQueries({ queryKey: listInstanceAdminsQueryKey() }),
  });
  const { mutate } = mutation;
  const remove = useCallback(
    (userId: string) => {
      mutate({ path: { userId } });
    },
    [mutate],
  );
  return {
    remove,
    removing: mutation.isPending ? mutation.variables.path.userId : undefined,
    failure: failureOf(mutation.error),
  };
}

export interface InstanceSettingsViewModel {
  readonly sections: readonly InstanceSettings[] | undefined;
  readonly failure: Error | undefined;
  /** Reads every section again: what a person does after a conflict. */
  readonly reload: () => Promise<void>;
}

/** Every section of the instance's settings, read afresh on each visit (another administrator may have saved). */
export function useInstanceSettings(): InstanceSettingsViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(listInstanceSettingsOptions(), { staleTime: 0 }));
  const reload = useCallback(
    async () => queryClient.invalidateQueries({ queryKey: listInstanceSettingsQueryKey() }),
    [queryClient],
  );
  return { sections: query.data?.sections, failure: failureOf(query.error), reload };
}

export interface SaveSectionViewModel {
  readonly save: (section: string, body: SaveInstanceSettingsRequest, onSaved: () => void) => void;
  readonly saving: boolean;
  readonly failure: Error | undefined;
  /** Forgets the last failure: the page that was reloaded no longer has it. */
  readonly clear: () => void;
}

export function useSaveInstanceSettings(): SaveSectionViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...saveInstanceSettingsMutation(),
    // The section is read again: its form fills from it, the new version and secrets with it.
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: listInstanceSettingsQueryKey() }),
  });
  const { mutate, reset } = mutation;
  const save = useCallback(
    (section: string, body: SaveInstanceSettingsRequest, onSaved: () => void) => {
      mutate({ path: { section }, body }, { onSuccess: onSaved });
    },
    [mutate],
  );
  return { save, saving: mutation.isPending, failure: failureOf(mutation.error), clear: reset };
}
