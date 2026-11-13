// SPDX-License-Identifier: Apache-2.0
import {
  listRunsInfiniteOptions,
  listRunsInfiniteQueryKey,
  listWorkflowRunsInfiniteOptions,
  listWorkflowRunsInfiniteQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import { startWorkflowRun } from '@gen/api/sdk.gen';
import type { Workflow, WorkflowRun } from '@gen/api/types.gen';
import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';

/** A page of runs as the server serves it: the newest first, `next` while older ones are left. */
interface RunsPage {
  readonly items: readonly WorkflowRun[];
  readonly next?: string;
}

export interface RunListViewModel {
  /** The runs read so far, newest first; undefined until the first page. */
  readonly runs: readonly WorkflowRun[] | undefined;
  /** Why the first page did not come. */
  readonly failure: Error | undefined;
  /** Older runs are left to read. */
  readonly more: boolean;
  readonly loadingMore: boolean;
  /** Why an older page, or a reading again, failed once runs were read: said under them, never in their place. */
  readonly moreFailure: Error | undefined;
  readonly loadMore: () => void;
}

interface RunsQuery {
  readonly data: InfiniteData<RunsPage> | undefined;
  readonly error: unknown;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
}

function useRunList(query: RunsQuery): RunListViewModel {
  const runs = useMemo(() => query.data?.pages.flatMap((page) => page.items), [query.data]);
  const read = query.data !== undefined;
  const { fetchNextPage } = query;
  return {
    runs,
    failure: read ? undefined : failureOf(query.error),
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    moreFailure: read ? failureOf(query.error) : undefined,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}

/** The runs of one workflow, a page at a time (`next`, read back as `before`), the older ones when asked. */
export function useWorkflowRuns(workflowId: string): RunListViewModel {
  const query = useInfiniteQuery({
    ...ready(listWorkflowRunsInfiniteOptions({ path: { id: workflowId } })),
    // The first page parameter names the path, as the generated type asks; the later ones are the `before` string.
    initialPageParam: { path: { id: workflowId } },
    // Every page read would be read again, one after the other, at each return to the window.
    refetchOnWindowFocus: false,
    getNextPageParam: (last) => last.next,
  });
  return useRunList(query);
}

/** The runs of every workflow of the organization, as `useWorkflowRuns` reads one workflow's. */
export function useOrgRuns(): RunListViewModel {
  const query = useInfiniteQuery({
    ...ready(listRunsInfiniteOptions()),
    initialPageParam: {},
    refetchOnWindowFocus: false,
    getNextPageParam: (last) => last.next,
  });
  return useRunList(query);
}

export interface StartRunViewModel {
  /** Owners and admins run an accepted workflow, as they change it; everyone else reads its runs. */
  readonly canStart: boolean;
  /** An owner or an admin on a workflow still proposed: they accept it before running it (the server's 409). */
  readonly acceptFirst: boolean;
  readonly start: () => void;
  readonly starting: boolean;
  /** Why the last run did not start: the server's words. */
  readonly failure: Error | undefined;
}

export function useStartRun(workflow: Workflow): StartRunViewModel {
  const workflowId = workflow.id;
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const mutation = useMutation({
    mutationFn: async () =>
      (await startWorkflowRun({ path: { id: workflowId }, body: { inputs: {} }, throwOnError: true })).data,
    // The new run comes first in both lists: they are read again, whatever the answer.
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: listWorkflowRunsInfiniteQueryKey({ path: { id: workflowId } }),
        }),
        queryClient.invalidateQueries({ queryKey: listRunsInfiniteQueryKey() }),
      ]);
    },
  });
  const { mutate } = mutation;
  return {
    canStart: viewer.canManage && workflow.status !== 'proposed',
    acceptFirst: viewer.canManage && workflow.status === 'proposed',
    start: () => {
      mutate();
    },
    starting: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}
