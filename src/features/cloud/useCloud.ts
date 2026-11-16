// SPDX-License-Identifier: Apache-2.0
import {
  cancelAutomationRunMutation,
  createAutomationMutation,
  createCloudSessionMutation,
  disableAutomationMutation,
  enableAutomationMutation,
  listAutomationRunsOptions,
  listAutomationRunsQueryKey,
  listAutomationsOptions,
  listAutomationsQueryKey,
  listCloudProfilesOptions,
  listCloudSessionsOptions,
  listCloudSessionsQueryKey,
  listRunnersOptions,
  rotateAutomationSecretMutation,
  setCloudSessionGithubAccessMutation,
  saveAutomationMutation,
  stopCloudSessionMutation,
  testAutomationMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  CloudProfileResponse,
  AutomationResponse,
  DryRunResponse,
  RunResponse,
  AutomationRequest,
  CloudEnvironmentDto,
  CloudSessionResponse,
  CreateCloudSessionRequest,
  RunnerDto,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { idempotencyKey } from '@/shared/api/idempotencyKey';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useAnnounced, useServerStatus } from '@/shared/capabilities';
import { useViewer } from '@/shared/auth/useViewer';
import { createRefused, type PendingCreate, pressOf } from './createKey';
import type { CloudAgent, GithubAccess, SessionMode } from './model';
import { type DeviceAgent, type KindFilter, kindsQuery, listedKinds, type PermissionMode } from './remote';
import { allWorkflowsOptions } from '@/shared/api/allWorkflows';
import type { Workflow } from '@/shared/api/workflowDocument';

const POLL_MS = 10_000;

export interface CloudViewModel {
  readonly sessions: readonly CloudSessionResponse[] | undefined;
  readonly runners: readonly RunnerDto[] | undefined;
  readonly failure: Error | undefined;
  readonly viewer: string | undefined;
  readonly canManage: boolean;
}

/**
 * Sessions move on their own (queued, running, ended): the list follows them every ten seconds. With remote sessions
 * (`runners.cloud.remote.v1`) it lists the kinds `filter` names, never `local` ones; without, the server lists cloud
 * sessions only.
 */
export function useCloud(filter: KindFilter = 'all'): CloudViewModel {
  const remote = useAnnounced('runners.cloud.remote.v1');
  // Asked once the server said what it serves: the kinds it lists depend on it, and one request is enough.
  const known = useServerStatus().kind !== 'loading';
  const sessions = useQuery(
    ready(listCloudSessionsOptions(remote ? kindsQuery(listedKinds(filter)) : undefined), {
      refetchInterval: pollUnlessRefused(POLL_MS),
      enabled: known,
    }),
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
  /** The preparation recipe (`runners.cloud.environment.v1`), never with `repo`'s repository too. */
  readonly environment?: CloudEnvironmentDto | undefined;
  /** The profile the session runs on (`runners.cloud.profiles.v1`), and an image it allows instead of its own. */
  readonly profileId?: string | undefined;
  readonly image?: string | undefined;
  /** `conversation` (`runners.cloud.conversation.v1`, Claude Code and Codex only): the agent runs headless, messaged from its screen. */
  readonly mode?: SessionMode | undefined;
}

/** A session on one of the member's online devices (`runners.cloud.remote.daemon.v1`), always a conversation. */
export interface DeviceStartRequest {
  readonly agent: DeviceAgent;
  readonly name: string;
  readonly prompt: string;
  readonly deviceId: string;
  readonly folderId: string;
  readonly permissionMode: PermissionMode;
  readonly model: string;
  readonly effort: string;
  /** The Claude Code conversation of the folder it continues (`runners.cloud.remote.resume.v1`). */
  readonly resumeSessionId?: string | undefined;
}

export interface SessionChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly start: (request: StartRequest, onDone: () => void) => void;
  /** `onRefused` runs with the server's refusal: the device form reads its devices or folders again. */
  readonly startOnDevice: (
    request: DeviceStartRequest,
    onDone: () => void,
    onRefused: (error: unknown) => void,
  ) => void;
  readonly stop: (id: string) => void;
  readonly starting: boolean;
  /** The session being stopped. */
  readonly stopping: string | undefined;
  readonly failure: Error | undefined;
  /** The failure of the start alone: the stop's own words are not those of a start. */
  readonly startFailure: Error | undefined;
}

export function useSessionChange(): SessionChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listCloudSessionsQueryKey() });
  }, [queryClient]);
  const create = useMutation({ ...createCloudSessionMutation(), onSuccess: refresh });
  const pending = useRef<PendingCreate | undefined>(undefined);
  const halt = useMutation({ ...stopCloudSessionMutation(), onSettled: refresh });
  const { mutate: createMutate, reset: resetCreate } = create;
  const { mutate: haltMutate, reset: resetHalt } = halt;
  const send = useCallback(
    (body: CreateCloudSessionRequest, onDone: () => void, onRefused?: (error: unknown) => void) => {
      resetHalt();
      // One key per press, kept while its answer is unknown so that pressing again cannot create a second session.
      const press = pressOf(pending.current, body);
      pending.current = press;
      createMutate(
        { body, headers: { 'Idempotency-Key': press.key } },
        {
          onSuccess: () => {
            pending.current = undefined;
            onDone();
          },
          // A refusal created no session under the key: the next press is a new one. The button is held while a press is in
          // flight, so this press owns the key it drops.
          onError: (error) => {
            if (createRefused(error)) pending.current = undefined;
            onRefused?.(error);
          },
        },
      );
    },
    [createMutate, resetHalt],
  );
  const start = useCallback(
    (request: StartRequest, onDone: () => void) => {
      const name = request.name.trim();
      const repo = request.repo.trim();
      const body = {
        agent: request.agent,
        prompt: request.prompt.trim(),
        ...(name === '' ? {} : { name }),
        ...(repo === '' ? {} : { repo }),
        ...(request.environment === undefined ? {} : { environment: request.environment }),
        ...(request.profileId === undefined ? {} : { profileId: request.profileId }),
        ...(request.image === undefined || request.image.trim() === ''
          ? {}
          : { image: request.image.trim() }),
        ...(request.mode === undefined ? {} : { mode: request.mode }),
      };
      send(body, onDone);
    },
    [send],
  );
  const startOnDevice = useCallback(
    (request: DeviceStartRequest, onDone: () => void, onRefused: (error: unknown) => void) => {
      const prompt = request.prompt.trim();
      const model = request.model.trim();
      const effort = request.effort.trim();
      // Built in a fixed order, as the key's request is named by its JSON.
      send(
        {
          agent: request.agent,
          name: request.name.trim(),
          ...(prompt === '' ? {} : { prompt }),
          kind: 'remote',
          mode: 'conversation',
          deviceId: request.deviceId,
          folderId: request.folderId,
          permissionMode: request.permissionMode,
          ...(model === '' ? {} : { model }),
          ...(effort === '' ? {} : { effort }),
          ...(request.resumeSessionId === undefined ? {} : { resumeSessionId: request.resumeSessionId }),
        },
        onDone,
        onRefused,
      );
    },
    [send],
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
    startOnDevice,
    stop,
    starting: create.isPending,
    stopping: halt.isPending ? halt.variables.path.id : undefined,
    failure: failureOf(create.error ?? halt.error),
    startFailure: failureOf(create.error),
  };
}

export interface AutomationsViewModel {
  readonly automations: readonly AutomationResponse[] | undefined;
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
  readonly create: (write: AutomationRequest, onDone: () => void) => void;
  /** Saves over the version read; a change made since is refused, and said. */
  readonly save: (id: string, write: AutomationRequest, onDone: () => void) => void;
  readonly creating: boolean;
  /** The automation being saved. */
  readonly saving: string | undefined;
  /**
   * A new webhook's secret, which only the answer to its creation carries: shown once, on its card, until the screen is
   * left or another webhook is created; no other gesture takes it away before it is copied.
   */
  readonly secret: { readonly id: string; readonly value: string } | undefined;
  /** Why the server refused the new automation, as it wrote it: said in the form. */
  readonly createFailure: Error | undefined;
  /** Why the server refused this automation's change, as it wrote it: said in its editor. */
  readonly saveFailure: (id: string) => Error | undefined;
  /** Forgets the last refusal, once the person moved on (a new form, another editor). */
  readonly dismiss: () => void;
}

export function useAutomationEdit(): AutomationEditViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listAutomationsQueryKey() });
  }, [queryClient]);
  const creation = useMutation({ ...createAutomationMutation(), onSuccess: refresh });
  const saving = useMutation({ ...saveAutomationMutation(), onSuccess: refresh });
  const [secret, setSecret] = useState<{ readonly id: string; readonly value: string } | undefined>(
    undefined,
  );
  const { mutate: createMutate, reset: resetCreate } = creation;
  const { mutate: saveMutate, reset: resetSave } = saving;
  const dismiss = useCallback(() => {
    resetCreate();
    resetSave();
  }, [resetCreate, resetSave]);
  const create = useCallback(
    (write: AutomationRequest, onDone: () => void) => {
      resetSave();
      createMutate(
        { body: write },
        {
          onSuccess: (created) => {
            const value = created.secret ?? undefined;
            if (value !== undefined) setSecret({ id: created.id, value });
            onDone();
          },
        },
      );
    },
    [createMutate, resetSave],
  );
  const save = useCallback(
    (id: string, write: AutomationRequest, onDone: () => void) => {
      resetCreate();
      saveMutate({ path: { id }, body: write }, { onSuccess: onDone });
    },
    [saveMutate, resetCreate],
  );
  const refused = saving.isError ? saving.variables.path.id : undefined;
  const saveFailure = useCallback(
    (id: string) => (id === refused ? failureOf(saving.error) : undefined),
    [refused, saving.error],
  );
  return {
    create,
    save,
    creating: creation.isPending,
    saving: saving.isPending ? saving.variables.path.id : undefined,
    secret,
    createFailure: failureOf(creation.error),
    saveFailure,
    dismiss,
  };
}

/**
 * The workflows an automation may start: those a person accepted (`accepted`, `edited`), as the server runs only
 * those. Undefined while they are read; a workflow list the caller may not read is simply empty.
 */
export function useRunnableWorkflows(): readonly Workflow[] | undefined {
  const workflows = useQuery(ready(allWorkflowsOptions(), { retry: false, staleTime: 30_000 }));
  return useMemo(
    () =>
      workflows.data?.items.filter(
        (workflow) => workflow.status === 'accepted' || workflow.status === 'edited',
      ),
    [workflows.data],
  );
}

export interface AutomationChangeViewModel {
  readonly toggle: (automation: AutomationResponse) => void;
  /** Runs it now, or checks the trigger and inputs without running anything (`dry`). */
  readonly run: (id: string, dry: boolean) => void;
  readonly rotate: (id: string) => void;
  /** The automation being changed. */
  readonly pending: string | undefined;
  /** What the last run from here answered: a queued run, or a dry run that started nothing. */
  readonly started: RunResponse | DryRunResponse | undefined;
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
    (automation: AutomationResponse) => {
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
  readonly runs: readonly RunResponse[] | undefined;
  readonly failure: Error | undefined;
  /** Ends a queued or started run: a queued one at once, a working one by pausing its session or its workflow run. */
  readonly cancel: (runId: string) => void;
  /** The run being cancelled. */
  readonly cancelling: string | undefined;
  readonly cancelFailure: Error | undefined;
} {
  const queryClient = useQueryClient();
  const runs = useQuery(ready(listAutomationRunsOptions({ path: { id } })));
  const cancellation = useMutation({
    ...cancelAutomationRunMutation(),
    // Whatever the answer, the runs are read again: a run that had already ended shows as it ended.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listAutomationRunsQueryKey({ path: { id } }) });
    },
  });
  const { mutate } = cancellation;
  const cancel = useCallback(
    (runId: string) => {
      mutate({ path: { id, runId } });
    },
    [mutate, id],
  );
  return {
    runs: runs.data?.items,
    failure: failureOf(runs.error),
    cancel,
    cancelling: cancellation.isPending ? cancellation.variables.path.runId : undefined,
    cancelFailure: failureOf(cancellation.error),
  };
}

export interface GithubAccessViewModel {
  /** Sends the owner's choice; the list is read again once the server answered, whatever it said. */
  readonly change: (id: string, access: GithubAccess) => void;
  /** The session being changed. */
  readonly changing: string | undefined;
  /** What the server refused for this session, as its stable key (`session_not_paused`, `github_owner_only`…) or a plain failure. */
  readonly failure: (id: string) => Error | undefined;
}

/** `PUT /cloud/sessions/{id}/github`: who may instruct the agent while it holds the owner's GitHub token. */
export function useGithubAccess(): GithubAccessViewModel {
  const queryClient = useQueryClient();
  const set = useMutation({
    ...setCloudSessionGithubAccessMutation(),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listCloudSessionsQueryKey() });
    },
  });
  const { mutate, reset } = set;
  const change = useCallback(
    (id: string, access: GithubAccess) => {
      reset();
      mutate({ path: { id }, body: { access } });
    },
    [mutate, reset],
  );
  const refused = set.isError ? set.variables.path.id : undefined;
  const failure = useCallback(
    (id: string) => (id === refused ? failureOf(set.error) : undefined),
    [refused, set.error],
  );
  return { change, changing: set.isPending ? set.variables.path.id : undefined, failure };
}

export interface StartProfilesViewModel {
  /** Whether the server has cloud session profiles: when not, a session is started without one. */
  readonly enabled: boolean;
  /** The profiles the caller may use; undefined while they are read. */
  readonly profiles: readonly CloudProfileResponse[] | undefined;
  readonly failure: Error | undefined;
}

/** The profiles a session may be started on: the server returns only those the caller may use. */
export function useStartProfiles(): StartProfilesViewModel {
  const enabled = useAnnounced('runners.cloud.profiles.v1');
  const query = useQuery({ ...ready(listCloudProfilesOptions(), { retry: false }), enabled });
  return { enabled, profiles: query.data?.profiles, failure: failureOf(query.error) };
}
