// SPDX-License-Identifier: AGPL-3.0-only
import {
  getGateCatalogQueryKey,
  getWorkflowOptions,
  getWorkflowQueryKey,
  listDecisionsQueryKey,
  listWorkflowsOptions,
  listWorkflowsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import { createWorkflow, deleteWorkflow, saveWorkflow } from '@gen/api/sdk.gen';
import type { Workflow } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';

export interface WorkflowsViewModel {
  readonly workflows: readonly Workflow[] | undefined;
  readonly failure: Error | undefined;
  /** Owners and admins write workflows, as they decide rules; everyone else reads. */
  readonly canChange: boolean;
}

export function useWorkflows(): WorkflowsViewModel {
  const query = useQuery(ready(listWorkflowsOptions()));
  const viewer = useViewer();
  return { workflows: query.data?.items, failure: failureOf(query.error), canChange: viewer.canManage };
}

export interface WorkflowViewModel {
  readonly workflow: Workflow | undefined;
  readonly failure: Error | undefined;
  readonly canChange: boolean;
}

export function useWorkflow(id: string): WorkflowViewModel {
  const query = useQuery(ready(getWorkflowOptions({ path: { id } })));
  const viewer = useViewer();
  return { workflow: query.data, failure: failureOf(query.error), canChange: viewer.canManage };
}

/** One change to a workflow: a creation, a save (from the version the editor read), an acceptance or a deletion. */
export type WorkflowChange =
  | { readonly kind: 'create'; readonly workflow: Workflow }
  | { readonly kind: 'save'; readonly workflow: Workflow; readonly expectedVersion: number | undefined }
  /** A proposed workflow accepted as found: a save of its status alone. */
  | { readonly kind: 'accept'; readonly workflow: Workflow; readonly expectedVersion: number | undefined }
  | { readonly kind: 'delete'; readonly id: string };

export interface WorkflowChangeViewModel {
  /**
   * Sends the change; `onDone` runs once the server took it (an editor closes then, a deleted workflow's screen is
   * left, and the workflow leaves the cache once it has).
   */
  readonly change: (
    change: WorkflowChange,
    onDone: (saved: Workflow | undefined) => void | Promise<void>,
  ) => void;
  readonly pending: WorkflowChange['kind'] | undefined;
  readonly failure: Error | undefined;
  /** What the failed change was: its failure says what to do next accordingly. */
  readonly failed: WorkflowChange['kind'] | undefined;
  /** Forgets the last failure, when the person starts over. */
  readonly reset: () => void;
}

async function send(change: WorkflowChange): Promise<Workflow | undefined> {
  switch (change.kind) {
    case 'create':
      return (await createWorkflow({ body: change.workflow, throwOnError: true })).data;
    case 'save':
    case 'accept':
      return (
        await saveWorkflow({
          path: { id: change.workflow.id },
          body: {
            workflow: change.workflow,
            ...(change.expectedVersion === undefined ? {} : { expectedVersion: change.expectedVersion }),
          },
          throwOnError: true,
        })
      ).data;
    case 'delete':
      await deleteWorkflow({ path: { id: change.id }, throwOnError: true });
      return undefined;
  }
}

export function useWorkflowChange(): WorkflowChangeViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: send,
    // Whatever the answer, the list and the workflow are read again: a conflict shows the version saved in between.
    onSettled: async (_saved, error, change) => {
      const id = change.kind === 'delete' ? change.id : change.workflow.id;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listWorkflowsQueryKey() }),
        // A deleted workflow is only marked stale: its screen is being left, and reading it again would flash a 404.
        queryClient.invalidateQueries({
          queryKey: getWorkflowQueryKey({ path: { id } }),
          ...(change.kind === 'delete' && error === null ? { refetchType: 'none' } : {}),
        }),
        queryClient.invalidateQueries({ queryKey: listDecisionsQueryKey() }),
        // The catalogue holds the actions of the workflows' gates.
        queryClient.invalidateQueries({ queryKey: getGateCatalogQueryKey() }),
      ]);
    },
  });

  const { mutate, reset } = mutation;
  const change = useCallback(
    (next: WorkflowChange, onDone: (saved: Workflow | undefined) => void | Promise<void>) => {
      mutate(next, {
        onSuccess: (saved) => {
          // Gone from the server, and its screen now left: nothing shows it again, not even from the cache.
          const forget = (): void => {
            if (next.kind === 'delete')
              queryClient.removeQueries({ queryKey: getWorkflowQueryKey({ path: { id: next.id } }) });
          };
          void Promise.resolve(onDone(saved)).then(forget);
        },
      });
    },
    [mutate, queryClient],
  );
  return {
    change,
    pending: mutation.isPending ? mutation.variables.kind : undefined,
    failure: failureOf(mutation.error),
    failed: mutation.isError ? mutation.variables.kind : undefined,
    reset,
  };
}
