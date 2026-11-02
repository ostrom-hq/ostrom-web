// SPDX-License-Identifier: AGPL-3.0-only
import {
  createAutomationMutation,
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
  saveAutomationMutation,
  stopCloudSessionMutation,
  testAutomationMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  Automation,
  AutomationDryRun,
  AutomationRun,
  AutomationWrite,
  CloudSession,
  Runner,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { type CloudAgent, idempotencyKey } from './model';

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
  const sessions = useQuery(
    ready(listCloudSessionsOptions(), { refetchInterval: pollUnlessRefused(POLL_MS) }),
  );
  const runners = useQuery(ready(listRunnersOptions()));
  const viewer = useViewer();
  return {
    sessions: sessions.data?.items,
    runners: runners.data?.items,
    failure: failureOf(sessions.error ?? runners.error),
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
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listCloudSessionsQueryKey() });
  }, [queryClient]);
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
  /** Their member id: the server names an automation's owner by it. */
  readonly memberId: string | undefined;
  readonly canManage: boolean;
}

export function useAutomations(): AutomationsViewModel {
  const automations = useQuery(ready(listAutomationsOptions()));
  const viewer = useViewer();
  return {
    automations: automations.data?.items,
    failure: failureOf(automations.error),
    viewer: viewer.login,
    memberId: viewer.memberId,
    canManage: viewer.canManage,
  };
}

export interface AutomationEditViewModel {
  /** Writes a new automation; `onDone` runs once the server took it, so the form closes then, not before. */
  readonly create: (write: AutomationWrite, onDone: () => void) => void;
  /** Saves over the version read; a change made since is refused, and said. */
  readonly save: (id: string, write: AutomationWrite, onDone: () => void) => void;
  readonly creating: boolean;
  /** The automation being saved. */
  readonly saving: string | undefined;
  /** A new webhook's secret, which only the answer to its creation carries: shown once, on its card. */
  readonly secret: { readonly id: string; readonly value: string } | undefined;
  /** The server's refusal, as it wrote it. */
  readonly failure: Error | undefined;
  /** Forgets the last answer, once the person moved on (a new form, another gesture). */
  readonly dismiss: () => void;
}

export function useAutomationEdit(): AutomationEditViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listAutomationsQueryKey() });
  }, [queryClient]);
  const creation = useMutation({ ...createAutomationMutation(), onSuccess: refresh });
  const saving = useMutation({ ...saveAutomationMutation(), onSuccess: refresh });
  const { mutate: createMutate, reset: resetCreate } = creation;
  const { mutate: saveMutate, reset: resetSave } = saving;
  const dismiss = useCallback(() => {
    resetCreate();
    resetSave();
  }, [resetCreate, resetSave]);
  const create = useCallback(
    (write: AutomationWrite, onDone: () => void) => {
      resetSave();
      createMutate({ body: write }, { onSuccess: onDone });
    },
    [createMutate, resetSave],
  );
  const save = useCallback(
    (id: string, write: AutomationWrite, onDone: () => void) => {
      resetCreate();
      saveMutate({ path: { id }, body: write }, { onSuccess: onDone });
    },
    [saveMutate, resetCreate],
  );
  const created = creation.data;
  return {
    create,
    save,
    creating: creation.isPending,
    saving: saving.isPending ? saving.variables.path.id : undefined,
    secret: created?.secret === undefined ? undefined : { id: created.id, value: created.secret },
    failure: failureOf(creation.error ?? saving.error),
    dismiss,
  };
}

export interface AutomationChangeViewModel {
  readonly toggle: (automation: Automation) => void;
  /** Runs it now, or checks the trigger and inputs without running anything (`dry`). */
  readonly run: (id: string, dry: boolean) => void;
  readonly rotate: (id: string) => void;
  /** The automation being changed. */
  readonly pending: string | undefined;
  /** What the last run from here answered: a queued run, or a dry run that started nothing. */
  readonly started: AutomationRun | AutomationDryRun | undefined;
  /** The new webhook secret, shown once, and the automation it belongs to. */
  readonly secret: { readonly id: string; readonly value: string } | undefined;
  readonly failure: Error | undefined;
}

export function useAutomationChange(): AutomationChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listAutomationsQueryKey() });
  }, [queryClient]);
  const enable = useMutation({ ...enableAutomationMutation(), onSettled: refresh });
  const disable = useMutation({ ...disableAutomationMutation(), onSettled: refresh });
  const test = useMutation({
    ...testAutomationMutation(),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: listAutomationRunsQueryKey({ path: { id: variables.path.id } }),
      });
    },
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
      // A real run is started once per gesture: the server drops a replay of the same key.
      testMutate(
        dry
          ? { path: { id }, body: { dryRun: true } }
          : { path: { id }, body: { dryRun: false }, headers: { 'Idempotency-Key': idempotencyKey() } },
      );
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
  readonly runs: readonly AutomationRun[] | undefined;
  readonly failure: Error | undefined;
} {
  const runs = useQuery(ready(listAutomationRunsOptions({ path: { id } })));
  return { runs: runs.data?.items, failure: failureOf(runs.error) };
}
