// SPDX-License-Identifier: AGPL-3.0-only
import {
  createCloudSessionMutation,
  disableAutomationMutation,
  enableAutomationMutation,
  listAutomationRunsOptions,
  listAutomationRunsQueryKey,
  listAutomationsOptions,
  listAutomationsQueryKey,
  listCloudSessionsOptions,
  listCloudSessionsQueryKey,
  listRunnersOptions,
  rotateAutomationSecretMutation,
  stopCloudSessionMutation,
  testAutomationMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { Automation, CloudSession, Runner, WorkflowRun } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { useViewer } from '@/shared/auth/useViewer';
import type { CloudAgent } from './model';

const POLL_MS = 10_000;

export interface CloudViewModel {
  readonly sessions: readonly CloudSession[] | undefined;
  readonly runners: readonly Runner[] | undefined;
  readonly failure: Error | undefined;
  readonly viewer: string | undefined;
  readonly canManage: boolean;
}

/** Sessions move on their own (queued, running, ended): the list follows them every ten seconds. */
export function useCloud(): CloudViewModel {
  const sessions = useQuery({ ...listCloudSessionsOptions(), refetchInterval: pollUnlessRefused(POLL_MS) });
  const runners = useQuery(listRunnersOptions());
  const viewer = useViewer();
  return {
    sessions: sessions.data?.items,
    runners: runners.data?.items,
    failure: failureOf(sessions.error),
    viewer: viewer.login,
    canManage: viewer.canManage,
  };
}

export interface StartRequest {
  readonly agent: CloudAgent;
  readonly prompt: string;
  readonly name: string;
  readonly repo: string;
}

export interface SessionChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly start: (request: StartRequest, onDone: () => void) => void;
  readonly stop: (id: string) => void;
  readonly starting: boolean;
  /** The session being stopped. */
  readonly stopping: string | undefined;
  readonly failure: Error | undefined;
}

export function useSessionChange(): SessionChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: listCloudSessionsQueryKey() }),
    [queryClient],
  );
  const create = useMutation({ ...createCloudSessionMutation(), onSuccess: refresh });
  const halt = useMutation({ ...stopCloudSessionMutation(), onSettled: refresh });
  const { mutate: createMutate, reset: resetCreate } = create;
  const { mutate: haltMutate, reset: resetHalt } = halt;
  const start = useCallback(
    (request: StartRequest, onDone: () => void) => {
      resetHalt();
      const name = request.name.trim();
      const repo = request.repo.trim();
      createMutate(
        {
          body: {
            agent: request.agent,
            prompt: request.prompt.trim(),
            ...(name === '' ? {} : { name }),
            ...(repo === '' ? {} : { repo }),
          },
        },
        { onSuccess: onDone },
      );
    },
    [createMutate, resetHalt],
  );
  const stop = useCallback(
    (id: string) => {
      resetCreate();
      haltMutate({ path: { id } });
    },
    [haltMutate, resetCreate],
  );
  return {
    start,
    stop,
    starting: create.isPending,
    stopping: halt.isPending ? halt.variables.path.id : undefined,
    failure: failureOf(create.error ?? halt.error),
  };
}

export interface AutomationsViewModel {
  readonly automations: readonly Automation[] | undefined;
  readonly failure: Error | undefined;
  readonly viewer: string | undefined;
  readonly canManage: boolean;
}

export function useAutomations(): AutomationsViewModel {
  const automations = useQuery(listAutomationsOptions());
  const viewer = useViewer();
  return {
    automations: automations.data?.items,
    failure: failureOf(automations.error),
    viewer: viewer.login,
    canManage: viewer.canManage,
  };
}

export interface AutomationChangeViewModel {
  readonly toggle: (automation: Automation) => void;
  /** Runs it now, or checks the trigger and inputs without running anything (`dry`). */
  readonly run: (id: string, dry: boolean) => void;
  readonly rotate: (id: string) => void;
  /** The automation being changed. */
  readonly pending: string | undefined;
  /** The last run started from here, and the automation it belongs to. */
  readonly started: WorkflowRun | undefined;
  /** The new webhook secret, shown once, and the automation it belongs to. */
  readonly secret: { readonly id: string; readonly value: string } | undefined;
  readonly failure: Error | undefined;
}

export function useAutomationChange(): AutomationChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: listAutomationsQueryKey() }),
    [queryClient],
  );
  const enable = useMutation({ ...enableAutomationMutation(), onSettled: refresh });
  const disable = useMutation({ ...disableAutomationMutation(), onSettled: refresh });
  const test = useMutation({
    ...testAutomationMutation(),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: listAutomationRunsQueryKey({ path: { id: variables.path.id } }),
      }),
  });
  const rotation = useMutation(rotateAutomationSecretMutation());
  const { mutate: enableMutate, reset: resetEnable } = enable;
  const { mutate: disableMutate, reset: resetDisable } = disable;
  const { mutate: testMutate, reset: resetTest } = test;
  const { mutate: rotateMutate, reset: resetRotation } = rotation;
  /** One message at a time: a new gesture clears what the last one said. */
  const resetAll = useCallback(() => {
    resetEnable();
    resetDisable();
    resetTest();
    resetRotation();
  }, [resetEnable, resetDisable, resetTest, resetRotation]);
  const toggle = useCallback(
    (automation: Automation) => {
      resetAll();
      (automation.enabled ? disableMutate : enableMutate)({ path: { id: automation.id } });
    },
    [resetAll, enableMutate, disableMutate],
  );
  const run = useCallback(
    (id: string, dry: boolean) => {
      resetAll();
      testMutate({ path: { id }, body: { dryRun: dry } });
    },
    [resetAll, testMutate],
  );
  const rotate = useCallback(
    (id: string) => {
      resetAll();
      rotateMutate({ path: { id } });
    },
    [resetAll, rotateMutate],
  );
  return {
    toggle,
    run,
    rotate,
    pending: enable.isPending
      ? enable.variables.path.id
      : disable.isPending
        ? disable.variables.path.id
        : test.isPending
          ? test.variables.path.id
          : rotation.isPending
            ? rotation.variables.path.id
            : undefined,
    started: test.data,
    secret: rotation.isSuccess ? { id: rotation.variables.path.id, value: rotation.data.secret } : undefined,
    failure: failureOf(enable.error ?? disable.error ?? test.error ?? rotation.error),
  };
}

/** An automation's runs; the card mounts it only once someone opens them. */
export function useAutomationRuns(id: string): {
  readonly runs: readonly WorkflowRun[] | undefined;
  readonly failure: Error | undefined;
} {
  const runs = useQuery(listAutomationRunsOptions({ path: { id } }));
  return { runs: runs.data?.items, failure: failureOf(runs.error) };
}
