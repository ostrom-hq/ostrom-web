// SPDX-License-Identifier: AGPL-3.0-only
import {
  checkAgentPolicyOptions,
  getInferenceSettingsOptions,
  getInferenceSettingsQueryKey,
  getModelPolicyOptions,
  getModelPolicyQueryKey,
  listMembersOptions,
  listSecretsOptions,
  setInferenceSettingsMutation,
  setModelPolicyMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { InferenceSettings, Member, ModelPolicy } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { keySecrets } from './model';

export interface SaveViewModel<T> {
  /** Saves; `onSaved` runs once the server took it, so a form shows the saved value then, not before. */
  readonly save: (value: T, onSaved: () => void) => void;
  readonly saving: boolean;
  /** The last save was taken. */
  readonly saved: boolean;
  readonly failure: Error | undefined;
}

export interface ModelPolicyViewModel {
  readonly policy: ModelPolicy | undefined;
  readonly failure: Error | undefined;
  /** Who a member's own list may name; undefined while they load or when they cannot be read (a member is then an id). */
  readonly members: readonly Member[] | undefined;
  readonly change: SaveViewModel<ModelPolicy>;
}

export function useModelPolicy(): ModelPolicyViewModel {
  const queryClient = useQueryClient();
  const policy = useQuery(ready(getModelPolicyOptions()));
  // Only names: a refusal is not asked again, a member then reads as their id.
  const members = useQuery(ready(listMembersOptions(), { staleTime: 60_000, retry: false }));
  const mutation = useMutation({
    ...setModelPolicyMutation(),
    onSuccess: (saved) => {
      queryClient.setQueryData(getModelPolicyQueryKey(), saved);
    },
  });
  const { mutate } = mutation;
  const save = useCallback(
    (value: ModelPolicy, onSaved: () => void) => {
      mutate({ body: value }, { onSuccess: onSaved });
    },
    [mutate],
  );
  return {
    policy: policy.data,
    failure: failureOf(policy.error),
    members: members.data?.items,
    change: {
      save,
      saving: mutation.isPending,
      saved: mutation.isSuccess,
      failure: failureOf(mutation.error),
    },
  };
}

export interface ProvidersViewModel {
  readonly settings: InferenceSettings | undefined;
  readonly failure: Error | undefined;
  /** The organization's secrets a key may name; undefined while they load or when they cannot be read. */
  readonly secrets: readonly string[] | undefined;
  readonly change: SaveViewModel<InferenceSettings>;
}

/** The providers' keys: only owners and admins read them (`inference:admin`), so the read waits for `enabled`. */
export function useProviders(enabled: boolean): ProvidersViewModel {
  const queryClient = useQueryClient();
  const settings = useQuery(ready(getInferenceSettingsOptions(), { enabled }));
  const secrets = useQuery(ready(listSecretsOptions(), { enabled, retry: false }));
  const mutation = useMutation({
    ...setInferenceSettingsMutation(),
    onSuccess: (saved) => {
      queryClient.setQueryData(getInferenceSettingsQueryKey(), saved);
    },
  });
  const { mutate } = mutation;
  const save = useCallback(
    (value: InferenceSettings, onSaved: () => void) => {
      mutate({ body: value }, { onSuccess: onSaved });
    },
    [mutate],
  );
  return {
    settings: settings.data,
    failure: failureOf(settings.error),
    secrets: secrets.data === undefined ? undefined : keySecrets(secrets.data.items),
    change: {
      save,
      saving: mutation.isPending,
      saved: mutation.isSuccess,
      failure: failureOf(mutation.error),
    },
  };
}

export interface LaunchQuestion {
  readonly agent: string;
  readonly model: string;
}

export interface LaunchCheckViewModel {
  /** Asks the server whether the viewer may launch this agent with this model, as `ostrom <agent>` does first. */
  readonly ask: (question: LaunchQuestion) => void;
  readonly asked: LaunchQuestion | undefined;
  readonly answer:
    { readonly allowed: boolean; readonly reason?: string; readonly note?: string } | undefined;
  readonly checking: boolean;
  readonly failure: Error | undefined;
}

export function useLaunchCheck(): LaunchCheckViewModel {
  const [asked, setAsked] = useState<LaunchQuestion | undefined>(undefined);
  const query =
    asked === undefined ? {} : { agent: asked.agent, ...(asked.model === '' ? {} : { model: asked.model }) };
  const check = useQuery(
    ready(checkAgentPolicyOptions({ query }), { enabled: asked !== undefined, retry: false, staleTime: 0 }),
  );
  return {
    ask: setAsked,
    asked,
    answer: check.data,
    checking: check.isFetching,
    failure: failureOf(check.error),
  };
}
