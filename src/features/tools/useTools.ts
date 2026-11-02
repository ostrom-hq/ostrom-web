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
import { ready } from '@/shared/api/ready';
import { managesMembers } from '@/shared/org/roles';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';

export interface McpViewModel {
  readonly servers: readonly McpServer[] | undefined;
  /** The organization's secrets, to say which ones a server still lacks. */
  readonly secrets: readonly Secret[] | undefined;
  readonly callsByServer: Readonly<Record<string, number>> | undefined;
  readonly calls: readonly McpCall[] | undefined;
  readonly failure: Error | undefined;
  /** Owners and admins manage; unknown while the organization loads. */
  readonly canManage: boolean | undefined;
}

/**
 * Whether the person manages the organization the calls act in, from their own list of organizations: `/auth/me`
 * may not carry the role. Unknown while that list loads, so a screen never shows a member's view, then an admin's.
 */
function useCanManage(): boolean | undefined {
  const { org, role } = useCurrentOrg();
  return org === undefined ? undefined : managesMembers(role);
}

export function useMcp(): McpViewModel {
  const servers = useQuery(ready(listMcpServersOptions()));
  const secrets = useQuery(ready(listSecretsOptions()));
  const usage = useQuery(ready(getMcpUsageOptions()));
  const calls = useQuery(ready(listMcpCallsOptions()));
  const canManage = useCanManage();
  return {
    servers: servers.data?.items,
    secrets: secrets.data?.items,
    callsByServer: usage.data?.byServer,
    calls: calls.data?.items,
    // Missing secrets or usage would read as "nothing missing" and "0 calls": any failed part is said.
    failure: failureOf(servers.error ?? secrets.error ?? usage.error ?? calls.error),
    canManage,
  };
}

function useInvalidate(): (keys: readonly (readonly unknown[])[]) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (keys) => {
      await Promise.all(
        keys.map(async (queryKey) => {
          await queryClient.invalidateQueries({ queryKey });
        }),
      );
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
  const refresh = useCallback(async () => {
    await invalidate([listMcpServersQueryKey(), getMcpUsageQueryKey()]);
  }, [invalidate]);
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
  /** As on the MCP screen: from the organization's role, unknown while it loads. */
  readonly canManage: boolean | undefined;
}

export function useSecrets(): SecretsViewModel {
  const secrets = useQuery(ready(listSecretsOptions()));
  const canManage = useCanManage();
  return { secrets: secrets.data?.items, failure: failureOf(secrets.error), canManage };
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
  const refresh = useCallback(async () => {
    await invalidate([listSecretsQueryKey()]);
  }, [invalidate]);
  // A secret's value rides in the mutation's variables: forgotten as soon as the server took it, and never cached.
  const created = useMutation({ ...createSecretMutation(), gcTime: 0, onSuccess: refresh });
  const rotated = useMutation({ ...rotateSecretMutation(), gcTime: 0, onSuccess: refresh });
  const dropped = useMutation({ ...deleteSecretMutation(), onSettled: refresh });
  const { mutate: createMutate, reset: resetCreate } = created;
  const { mutate: rotateMutate, reset: resetRotate } = rotated;
  const { mutate: dropMutate, reset: resetDrop } = dropped;
  const create = useCallback(
    (name: string, value: string, onDone: () => void) => {
      resetRotate();
      resetDrop();
      createMutate(
        { body: { name, value } },
        {
          onSuccess: () => {
            resetCreate();
            onDone();
          },
        },
      );
    },
    [createMutate, resetCreate, resetRotate, resetDrop],
  );
  const rotate = useCallback(
    (name: string, value: string, onDone: () => void) => {
      resetCreate();
      resetDrop();
      rotateMutate(
        { path: { name }, body: { name, value } },
        {
          onSuccess: () => {
            resetRotate();
            onDone();
          },
        },
      );
    },
    [rotateMutate, resetRotate, resetCreate, resetDrop],
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
