// SPDX-License-Identifier: Apache-2.0
import {
  createCloudClusterMutation,
  createCloudProfileMutation,
  getCloudRuntimeOptions,
  getCloudRuntimeQueryKey,
  getCloudSettingsOptions,
  getCloudSettingsQueryKey,
  listCloudClustersOptions,
  listCloudClustersQueryKey,
  listCloudProfilesOptions,
  listCloudProfilesQueryKey,
  saveCloudRuntimeMutation,
  saveCloudSettingsMutation,
  updateCloudClusterMutation,
  updateCloudProfileMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  CloudCluster,
  CloudProfile,
  CloudRuntime,
  CloudSettings,
  SaveCloudClusterRequest,
  SaveCloudProfileRequest,
  SaveCloudRuntimeRequest,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { useOrgMembers } from '@/shared/org/members';

export interface Saving {
  readonly saving: boolean;
  /** The last save was taken, and nothing has been edited since. */
  readonly saved: boolean;
  readonly failure: Error | undefined;
  /** Forgets the last failure: what was reloaded no longer has it. */
  readonly clear: () => void;
}

// ---- The organization's settings: read by members, written by owners and admins ---------------------------------

export interface CloudSettingsViewModel {
  readonly settings: CloudSettings | undefined;
  readonly failure: Error | undefined;
  readonly canEdit: boolean;
  readonly reload: () => Promise<void>;
  readonly save: (settings: { readonly minutes: number; readonly automations?: number }) => void;
  readonly write: Saving;
}

/** Read afresh on each visit: another administrator may have saved since. */
export function useCloudSettings(): CloudSettingsViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getCloudSettingsOptions(), { staleTime: 0, retry: false }));
  const viewer = useViewer();
  const mutation = useMutation({
    ...saveCloudSettingsMutation(),
    onSuccess: (saved) => {
      queryClient.setQueryData(getCloudSettingsQueryKey(), saved);
    },
  });
  const { mutate, reset } = mutation;
  const updatedAt = query.data?.updatedAt;
  const save = useCallback(
    ({ minutes, automations }: { readonly minutes: number; readonly automations?: number }) => {
      mutate({
        body: {
          backgroundWorkMaxMinutes: minutes,
          ...(automations === undefined ? {} : { maxRunningAutomationsPerMember: automations }),
          ...(updatedAt === undefined ? {} : { updatedAt }),
        },
      });
    },
    [mutate, updatedAt],
  );
  const reload = useCallback(
    async () => queryClient.invalidateQueries({ queryKey: getCloudSettingsQueryKey() }),
    [queryClient],
  );
  return {
    settings: query.data,
    failure: failureOf(query.error),
    canEdit: viewer.canManage,
    reload,
    save,
    write: {
      saving: mutation.isPending,
      saved: mutation.isSuccess,
      failure: failureOf(mutation.error),
      clear: reset,
    },
  };
}

// ---- The instance's runtime: instance administrators only ------------------------------------------------------

export interface CloudRuntimeViewModel {
  readonly runtime: CloudRuntime | undefined;
  readonly failure: Error | undefined;
  readonly reload: () => Promise<void>;
  readonly save: (body: SaveCloudRuntimeRequest, onSaved: () => void) => void;
  readonly write: Saving;
}

/** Only mounted for an administrator of the instance: nothing is asked before. */
export function useCloudRuntime(): CloudRuntimeViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getCloudRuntimeOptions(), { staleTime: 0, retry: false }));
  const mutation = useMutation({
    ...saveCloudRuntimeMutation(),
    onSuccess: (saved) => {
      queryClient.setQueryData(getCloudRuntimeQueryKey(), saved);
    },
  });
  const { mutate, reset } = mutation;
  const save = useCallback(
    (body: SaveCloudRuntimeRequest, onSaved: () => void) => {
      mutate({ body }, { onSuccess: onSaved });
    },
    [mutate],
  );
  const reload = useCallback(
    async () => queryClient.invalidateQueries({ queryKey: getCloudRuntimeQueryKey() }),
    [queryClient],
  );
  return {
    runtime: query.data,
    failure: failureOf(query.error),
    reload,
    save,
    write: {
      saving: mutation.isPending,
      saved: mutation.isSuccess,
      failure: failureOf(mutation.error),
      clear: reset,
    },
  };
}

// ---- The clusters ------------------------------------------------------------------------------------------------

export interface CloudClustersViewModel {
  readonly clusters: readonly CloudCluster[] | undefined;
  readonly failure: Error | undefined;
  readonly reload: () => Promise<void>;
  /** Creates the cluster, or updates the one given; the lists is read again after. */
  readonly save: (body: SaveCloudClusterRequest, id: string | undefined, onSaved: () => void) => void;
  readonly write: Saving;
}

export function useCloudClusters(): CloudClustersViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(listCloudClustersOptions(), { staleTime: 0, retry: false }));
  const reload = useCallback(
    async () => queryClient.invalidateQueries({ queryKey: listCloudClustersQueryKey() }),
    [queryClient],
  );
  const create = useMutation({ ...createCloudClusterMutation(), onSuccess: reload });
  const update = useMutation({ ...updateCloudClusterMutation(), onSuccess: reload });
  const { mutate: createMutate, reset: resetCreate } = create;
  const { mutate: updateMutate, reset: resetUpdate } = update;
  const save = useCallback(
    (body: SaveCloudClusterRequest, id: string | undefined, onSaved: () => void) => {
      if (id === undefined) createMutate({ body }, { onSuccess: onSaved });
      else updateMutate({ path: { id }, body }, { onSuccess: onSaved });
    },
    [createMutate, updateMutate],
  );
  const clear = useCallback(() => {
    resetCreate();
    resetUpdate();
  }, [resetCreate, resetUpdate]);
  return {
    clusters: query.data?.clusters,
    failure: failureOf(query.error),
    reload,
    save,
    write: {
      saving: create.isPending || update.isPending,
      saved: create.isSuccess || update.isSuccess,
      failure: failureOf(create.error ?? update.error),
      clear,
    },
  };
}

// ---- The profiles ------------------------------------------------------------------------------------------------

export interface CloudProfilesViewModel {
  /** An owner or an admin sees every profile, a member the ones assigned to them. */
  readonly profiles: readonly CloudProfile[] | undefined;
  readonly failure: Error | undefined;
  readonly canEdit: boolean;
  readonly reload: () => Promise<void>;
  readonly save: (body: SaveCloudProfileRequest, id: string | undefined, onSaved: () => void) => void;
  readonly write: Saving;
}

export function useCloudProfiles(): CloudProfilesViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(listCloudProfilesOptions(), { staleTime: 0, retry: false }));
  const viewer = useViewer();
  const reload = useCallback(
    async () => queryClient.invalidateQueries({ queryKey: listCloudProfilesQueryKey() }),
    [queryClient],
  );
  const create = useMutation({ ...createCloudProfileMutation(), onSuccess: reload });
  const update = useMutation({ ...updateCloudProfileMutation(), onSuccess: reload });
  const { mutate: createMutate, reset: resetCreate } = create;
  const { mutate: updateMutate, reset: resetUpdate } = update;
  const save = useCallback(
    (body: SaveCloudProfileRequest, id: string | undefined, onSaved: () => void) => {
      if (id === undefined) createMutate({ body }, { onSuccess: onSaved });
      else updateMutate({ path: { id }, body }, { onSuccess: onSaved });
    },
    [createMutate, updateMutate],
  );
  const clear = useCallback(() => {
    resetCreate();
    resetUpdate();
  }, [resetCreate, resetUpdate]);
  return {
    profiles: query.data?.profiles,
    failure: failureOf(query.error),
    canEdit: viewer.canManage,
    reload,
    save,
    write: {
      saving: create.isPending || update.isPending,
      saved: create.isSuccess || update.isSuccess,
      failure: failureOf(create.error ?? update.error),
      clear,
    },
  };
}

/** The people a profile can be assigned to: every member of the organization, all the pages read. */
export function useAssignableMembers(
  org: string,
): readonly { readonly id: string; readonly label: string }[] {
  const people = useOrgMembers(org);
  const { more, loadingMore, error: failed } = people;
  const read = people.members?.length;
  // A profile can be given to anyone: read every page, a hundred at a time, rather than the first only.
  useEffect(() => {
    if (more !== undefined && !loadingMore && failed === null) more();
    // `read` is a dependency so that each page read asks for the next.
  }, [more, loadingMore, read, failed]);
  return (people.members ?? []).map((member) => ({
    id: member.id,
    label: member.name === '' ? member.login : `${member.name} (${member.login})`,
  }));
}
