// SPDX-License-Identifier: Apache-2.0
import {
  getGateCatalogQueryKey,
  getWorkflowOptions,
  getWorkflowQueryKey,
  listDecisionsQueryKey,
  listReposInfiniteOptions,
  listWorkflowsOptions,
  listWorkflowsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import { createWorkflow, deleteWorkflow, saveWorkflow } from '@gen/api/sdk.gen';
import type { Workflow } from '@gen/api/types.gen';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { applied } from '@/shared/api/applied';
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

/**
 * One change to a workflow: a creation, a save (from the version the editor read), an acceptance, a rejection or a
 * deletion.
 */
export type WorkflowChange =
  | { readonly kind: 'create'; readonly workflow: Workflow }
  | { readonly kind: 'save'; readonly workflow: Workflow; readonly expectedVersion: number | undefined }
  /** A proposed workflow accepted as found: a save of its status alone. */
  | { readonly kind: 'accept'; readonly workflow: Workflow; readonly expectedVersion: number | undefined }
  /** A proposed workflow turned down: kept `rejected`, so the analysis never proposes it again. */
  | { readonly kind: 'reject'; readonly workflow: Workflow; readonly expectedVersion: number | undefined }
  | { readonly kind: 'delete'; readonly id: string };

export interface WorkflowChangeViewModel {
  /** Sends the change; `onDone` runs once the server took it (an editor closes then, a deleted workflow is left). */
  readonly change: (change: WorkflowChange, onDone: (saved: Workflow | undefined) => void) => void;
  /** The workflow was deleted: its screen says so, and offers nothing more. */
  readonly deleted: boolean;
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
      return applied((await createWorkflow({ body: change.workflow, throwOnError: true })).data);
    case 'save':
    case 'accept':
    case 'reject':
      return applied(
        (
          await saveWorkflow({
            path: { id: change.workflow.id },
            body: {
              workflow: change.workflow,
              ...(change.expectedVersion === undefined ? {} : { expectedVersion: change.expectedVersion }),
            },
            throwOnError: true,
          })
        ).data,
      );
    case 'delete':
      applied((await deleteWorkflow({ path: { id: change.id }, throwOnError: true })).data);
      return undefined;
  }
}

export function useWorkflowChange(): WorkflowChangeViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: send,
    // Gone from the server: it leaves the cache here, whether or not its screen is still open (it says "deleted").
    onSuccess: (_saved, change) => {
      if (change.kind === 'delete')
        queryClient.removeQueries({ queryKey: getWorkflowQueryKey({ path: { id: change.id } }) });
    },
    // Whatever the answer, the list and the workflow are read again: a conflict shows the version saved in between.
    onSettled: async (_saved, error, change) => {
      const id = change.kind === 'delete' ? change.id : change.workflow.id;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listWorkflowsQueryKey() }),
        change.kind === 'delete' && error === null
          ? Promise.resolve()
          : queryClient.invalidateQueries({ queryKey: getWorkflowQueryKey({ path: { id } }) }),
        queryClient.invalidateQueries({ queryKey: listDecisionsQueryKey() }),
        // The catalogue holds the actions of the workflows' gates.
        queryClient.invalidateQueries({ queryKey: getGateCatalogQueryKey() }),
      ]);
    },
  });

  const { mutate, reset } = mutation;
  const change = useCallback(
    (next: WorkflowChange, onDone: (saved: Workflow | undefined) => void) => {
      mutate(next, {
        onSuccess: onDone,
      });
    },
    [mutate],
  );
  return {
    change,
    pending: mutation.isPending ? mutation.variables.kind : undefined,
    failure: failureOf(mutation.error),
    failed: mutation.isError ? mutation.variables.kind : undefined,
    deleted: mutation.isSuccess && mutation.variables.kind === 'delete',
    reset,
  };
}

export interface OrgReposViewModel {
  /** The organization's repositories by their GitHub name, a page at a time; undefined until the first page. */
  readonly names: readonly string[] | undefined;
  /** The list could not be read: the editor still keeps and shows the repositories already chosen. */
  readonly failure: Error | undefined;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
}

/** The repositories a workflow may be limited to: those the organization's GitHub App reads. */
export function useOrgRepos(): OrgReposViewModel {
  const repos = useInfiniteQuery({
    ...ready(listReposInfiniteOptions(), { staleTime: 30_000, retry: false }),
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const names = useMemo(
    () => repos.data?.pages.flatMap((page) => page.items.map((repo) => repo.name)),
    [repos.data],
  );
  const { fetchNextPage } = repos;
  return {
    names,
    failure: failureOf(repos.error),
    more: repos.hasNextPage,
    loadingMore: repos.isFetchingNextPage,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}
