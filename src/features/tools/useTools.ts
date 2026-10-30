// SPDX-License-Identifier: AGPL-3.0-only
import {
  createMcpServerMutation,
  createSecretMutation,
  deleteMcpServerMutation,
  deleteSecretMutation,
  getMcpUsageOptions,
  getMcpUsageQueryKey,
  listMcpCallsOptions,
  listMcpServersOptions,
  listMcpServersQueryKey,
  listSecretsOptions,
  listSecretsQueryKey,
  rotateSecretMutation,
  saveMcpServerMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { McpCall, McpServer, Secret } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useViewer } from '@/shared/auth/useViewer';

export interface McpViewModel {
  readonly servers: readonly McpServer[] | undefined;
  /** The organization's secrets, to say which ones a server still lacks. */
  readonly secrets: readonly Secret[] | undefined;
  readonly callsByServer: Readonly<Record<string, number>> | undefined;
  readonly calls: readonly McpCall[] | undefined;
  readonly failure: Error | undefined;
  readonly canManage: boolean;
}

export function useMcp(): McpViewModel {
  const servers = useQuery(listMcpServersOptions());
  const secrets = useQuery(listSecretsOptions());
  const usage = useQuery(getMcpUsageOptions());
  const calls = useQuery(listMcpCallsOptions());
  const viewer = useViewer();
  return {
    servers: servers.data?.items,
    secrets: secrets.data?.items,
    callsByServer: usage.data?.byServer,
    calls: calls.data?.items,
    failure: failureOf(servers.error),
    canManage: viewer.canManage,
  };
}

function useInvalidate(): (keys: readonly (readonly unknown[])[]) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (keys) => {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    [queryClient],
  );
}

export interface McpChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly add: (server: McpServer, onDone: () => void) => void;
  readonly toggle: (server: McpServer) => void;
  readonly remove: (name: string) => void;
  /** The server being saved, or `true` while one is added. */
  readonly pending: string | true | undefined;
  readonly failure: Error | undefined;
}

export function useMcpChange(): McpChangeViewModel {
  const invalidate = useInvalidate();
  const refresh = useCallback(
    () => invalidate([listMcpServersQueryKey(), getMcpUsageQueryKey()]),
    [invalidate],
  );
  const create = useMutation({ ...createMcpServerMutation(), onSuccess: refresh });
  const save = useMutation({ ...saveMcpServerMutation(), onSettled: refresh });
  const drop = useMutation({ ...deleteMcpServerMutation(), onSettled: refresh });
  const { mutate: createMutate, reset: resetCreate } = create;
  const { mutate: saveMutate, reset: resetSave } = save;
  const { mutate: dropMutate, reset: resetDrop } = drop;
  const add = useCallback(
    (server: McpServer, onDone: () => void) => {
      resetSave();
      resetDrop();
      createMutate({ body: server }, { onSuccess: onDone });
    },
    [createMutate, resetSave, resetDrop],
  );
  const toggle = useCallback(
    (server: McpServer) => {
      resetCreate();
      resetDrop();
      saveMutate({ path: { name: server.name }, body: { ...server, enabled: !server.enabled } });
    },
    [saveMutate, resetCreate, resetDrop],
  );
  const remove = useCallback(
    (name: string) => {
      resetCreate();
      resetSave();
      dropMutate({ path: { name } });
    },
    [dropMutate, resetCreate, resetSave],
  );
  return {
    add,
    toggle,
    remove,
    pending: create.isPending
      ? true
      : save.isPending
        ? save.variables.path.name
        : drop.isPending
          ? drop.variables.path.name
          : undefined,
    failure: failureOf(create.error ?? save.error ?? drop.error),
  };
}

export interface SecretsViewModel {
  readonly secrets: readonly Secret[] | undefined;
  readonly failure: Error | undefined;
  readonly canManage: boolean;
}

export function useSecrets(): SecretsViewModel {
  const secrets = useQuery(listSecretsOptions());
  const viewer = useViewer();
  return { secrets: secrets.data?.items, failure: failureOf(secrets.error), canManage: viewer.canManage };
}

export interface SecretChangeViewModel {
  /** The value goes to the server once and is never read back; `onDone` clears the field that held it. */
  readonly create: (name: string, value: string, onDone: () => void) => void;
  readonly rotate: (name: string, value: string, onDone: () => void) => void;
  readonly remove: (name: string) => void;
  /** The secret being saved, or `true` while one is created. */
  readonly pending: string | true | undefined;
  readonly failure: Error | undefined;
}

export function useSecretChange(): SecretChangeViewModel {
  const invalidate = useInvalidate();
  const refresh = useCallback(() => invalidate([listSecretsQueryKey()]), [invalidate]);
  const created = useMutation({ ...createSecretMutation(), onSuccess: refresh });
  const rotated = useMutation({ ...rotateSecretMutation(), onSuccess: refresh });
  const dropped = useMutation({ ...deleteSecretMutation(), onSettled: refresh });
  const { mutate: createMutate, reset: resetCreate } = created;
  const { mutate: rotateMutate, reset: resetRotate } = rotated;
  const { mutate: dropMutate, reset: resetDrop } = dropped;
  const create = useCallback(
    (name: string, value: string, onDone: () => void) => {
      resetRotate();
      resetDrop();
      createMutate({ body: { name, value } }, { onSuccess: onDone });
    },
    [createMutate, resetRotate, resetDrop],
  );
  const rotate = useCallback(
    (name: string, value: string, onDone: () => void) => {
      resetCreate();
      resetDrop();
      rotateMutate({ path: { name }, body: { name, value } }, { onSuccess: onDone });
    },
    [rotateMutate, resetCreate, resetDrop],
  );
  const remove = useCallback(
    (name: string) => {
      resetCreate();
      resetRotate();
      dropMutate({ path: { name } });
    },
    [dropMutate, resetCreate, resetRotate],
  );
  return {
    create,
    rotate,
    remove,
    pending: created.isPending
      ? true
      : rotated.isPending
        ? rotated.variables.path.name
        : dropped.isPending
          ? dropped.variables.path.name
          : undefined,
    failure: failureOf(created.error ?? rotated.error ?? dropped.error),
  };
}
