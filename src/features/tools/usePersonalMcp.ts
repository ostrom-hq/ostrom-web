// SPDX-License-Identifier: Apache-2.0
import {
  createMyMcpServerMutation,
  deleteMyMcpServerMutation,
  getMcpUsageOptions,
  listMyMcpServersOptions,
  listMyMcpServersQueryKey,
  saveMyMcpServerMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { McpServer } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import type { McpChangeViewModel } from './useTools';

export interface PersonalMcpViewModel {
  /** The person's own servers, relayed to them alone. */
  readonly servers: readonly McpServer[] | undefined;
  readonly callsByServer: Readonly<Record<string, number>> | undefined;
  readonly failure: Error | undefined;
}

export function usePersonalMcp(): PersonalMcpViewModel {
  const servers = useQuery(ready(listMyMcpServersOptions()));
  // Only counts: a refusal is not asked again, a server then reads 0 calls.
  const usage = useQuery(ready(getMcpUsageOptions(), { retry: false }));
  return {
    servers: servers.data?.items,
    callsByServer: usage.data?.byServer,
    failure: failureOf(servers.error),
  };
}

/** The person's writes on their own servers, with the team screen's gestures so its form and cards serve them. */
export function usePersonalMcpChange(): McpChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listMyMcpServersQueryKey() });
  }, [queryClient]);
  const create = useMutation({ ...createMyMcpServerMutation(), onSuccess: refresh });
  const save = useMutation({ ...saveMyMcpServerMutation(), onSettled: refresh });
  const drop = useMutation({ ...deleteMyMcpServerMutation(), onSettled: refresh });
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
