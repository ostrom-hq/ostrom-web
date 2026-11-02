// SPDX-License-Identifier: AGPL-3.0-only
import {
  getInferenceSettingsOptions,
  getInferenceSettingsQueryKey,
  getModelPolicyOptions,
  getModelPolicyQueryKey,
  listMembersOptions,
  listSecretsOptions,
} from '@gen/api/@tanstack/react-query.gen';
import { checkAgentPolicy, setInferenceSettings, setModelPolicy } from '@gen/api/sdk.gen';
import type { InferenceSettings, Member, ModelPolicy } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { keySecrets, readModelPolicy } from './model';

export interface SaveViewModel<T> {
  /** Saves; `onSaved` runs once the server took it, so a form shows the saved value then, not before. */
  readonly save: (value: T, onSaved: () => void) => void;
  readonly saving: boolean;
  /** The last save was taken. */
  readonly saved: boolean;
  readonly failure: Error | undefined;
  /** Forgets the last save, so its banner does not outlive the edit it was for. */
  readonly reset: () => void;
}

/** A save that puts the server's answer where the screen reads it. */
function useSave<T>(send: (body: T) => Promise<T>, queryKey: readonly unknown[]): SaveViewModel<T> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ body }: { body: T }) => send(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
    },
  });
  const { mutate, reset } = mutation;
  const save = useCallback(
    (value: T, onSaved: () => void) => {
      mutate({ body: value }, { onSuccess: onSaved });
    },
    [mutate],
  );
  return {
    save,
    saving: mutation.isPending,
    saved: mutation.isSuccess,
    failure: failureOf(mutation.error),
    reset,
  };
}

export interface ModelPolicyViewModel {
  readonly policy: ModelPolicy | undefined;
  readonly failure: Error | undefined;
  /** Who a member's own list may name; undefined while they load or when they cannot be read (a member is then an id). */
  readonly members: readonly Member[] | undefined;
  readonly change: SaveViewModel<ModelPolicy>;
}

// A new organization's policy has no `default` yet: read leniently, with Zod still (`readModelPolicy`).
const lenientPolicy = {
  responseValidator: readModelPolicy,
  responseTransformer: readModelPolicy,
};

export function useModelPolicy(): ModelPolicyViewModel {
  const policy = useQuery(ready(getModelPolicyOptions(lenientPolicy)));
  // Only names: a refusal is not asked again, a member then reads as their id.
  const members = useQuery(ready(listMembersOptions(), { staleTime: 60_000, retry: false }));
  const change = useSave(
    async (body: ModelPolicy) => (await setModelPolicy({ body, ...lenientPolicy, throwOnError: true })).data,
    getModelPolicyQueryKey(),
  );
  return {
    policy: policy.data,
    failure: failureOf(policy.error),
    members: members.data?.items,
    change,
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
  const settings = useQuery(ready(getInferenceSettingsOptions(), { enabled }));
  const secrets = useQuery(ready(listSecretsOptions(), { enabled, retry: false }));
  const change = useSave(
    async (body: InferenceSettings) => (await setInferenceSettings({ body, throwOnError: true })).data,
    getInferenceSettingsQueryKey(),
  );
  return {
    settings: settings.data,
    failure: failureOf(settings.error),
    secrets: secrets.data === undefined ? undefined : keySecrets(secrets.data.items),
    change,
  };
}

export interface LaunchQuestion {
  readonly agent: string;
  /** The model asked; empty when none is named and the organization has no default, as `ostrom <agent>` asks then. */
  readonly model: string;
  /** False when `model` is the default, asked for an empty field. */
  readonly named: boolean;
}

export interface LaunchAnswer {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly note?: string;
}

export interface LaunchCheckViewModel {
  /**
   * Asks the server whether the viewer may launch this agent with this model, as `ostrom <agent>` does first. Each
   * ask goes to the server, so the same question asked after a change gets the new answer.
   */
  readonly ask: (question: LaunchQuestion) => void;
  readonly asked: LaunchQuestion | undefined;
  readonly answer: LaunchAnswer | undefined;
  readonly checking: boolean;
  readonly failure: Error | undefined;
}

/**
 * @param policy The policy the answer is about: once it changes (a save), the last question is asked again, its default
 *   model read anew, so no answer speaks of a policy that is no longer the organization's.
 */
export function useLaunchCheck(policy: ModelPolicy | undefined): LaunchCheckViewModel {
  // A question asked, not a state kept fresh: a mutation never asks again on its own (a focus, a remount).
  const mutation = useMutation({
    mutationFn: async (question: LaunchQuestion): Promise<LaunchAnswer> =>
      (
        await checkAgentPolicy({
          query: { agent: question.agent, ...(question.model === '' ? {} : { model: question.model }) },
          throwOnError: true,
        })
      ).data,
  });
  const { mutate } = mutation;
  // The last question, asked again by the effect below once the policy changes.
  const last = useRef<LaunchQuestion | undefined>(undefined);
  const ask = useCallback(
    (question: LaunchQuestion) => {
      last.current = question;
      mutate(question);
    },
    [mutate],
  );
  useEffect(() => {
    const question = last.current;
    if (question === undefined || policy === undefined) return;
    mutate(question.named ? question : { ...question, model: policy.default });
  }, [policy, mutate]);
  return {
    ask,
    asked: mutation.variables,
    answer: mutation.data,
    checking: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}
