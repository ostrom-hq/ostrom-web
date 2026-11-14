// SPDX-License-Identifier: Apache-2.0
import {
  getRunOptions,
  getRunQueryKey,
  getWorkflowOptions,
  listRunsInfiniteOptions,
  listRunsInfiniteQueryKey,
  listWorkflowRunsInfiniteOptions,
  listWorkflowRunsInfiniteQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import { cancelRun, deliverRun, startWorkflowRun } from '@gen/api/sdk.gen';
import type { Workflow, WorkflowRun } from '@gen/api/types.gen';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { runnable } from './model';
import { type Delivery, deliveryOf, deliveryVisit, deliverableOf, finished, inputsOf } from './runs';
import { useViewer } from '@/shared/auth/useViewer';
import { useFeature } from '@/shared/capabilities';

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

/** What narrows the organization's runs: every member's (an administrator), one workflow's, one status. */
export interface RunFilters {
  readonly all: boolean;
  readonly workflow: string;
  readonly status: string;
}

export const NO_FILTERS: RunFilters = { all: false, workflow: '', status: '' };

/** The runs of every workflow of the organization, as `useWorkflowRuns` reads one workflow's. */
export function useOrgRuns(filters: RunFilters = NO_FILTERS): RunListViewModel {
  const query = useInfiniteQuery({
    ...ready(
      listRunsInfiniteOptions({
        query: {
          ...(filters.all ? { all: true } : {}),
          ...(filters.workflow === '' ? {} : { workflow: filters.workflow }),
          ...(filters.status === '' ? {} : { status: filters.status }),
        },
      }),
    ),
    initialPageParam: {},
    refetchOnWindowFocus: false,
    getNextPageParam: (last) => last.next,
  });
  return useRunList(query);
}

/** What a person gives to start a run: the workflow's inputs by id, and the repository of its agent steps. */
export interface RunStart {
  readonly inputs: Readonly<Record<string, string>>;
  readonly repository: string;
}

export interface StartRunViewModel {
  /** Owners and admins run an accepted workflow, as they change it; everyone else reads its runs. */
  readonly canStart: boolean;
  /** An owner or an admin on a workflow still proposed: they accept it before running it (the server's 409). */
  readonly acceptFirst: boolean;
  /** A rejected workflow never runs: its page says so, and offers no start. */
  readonly rejected: boolean;
  /** The server takes the repository of a run (the workflow delivery). */
  readonly withRepository: boolean;
  readonly start: (start: RunStart) => void;
  readonly starting: boolean;
  /** Why the last run did not start: the server's words. */
  readonly failure: Error | undefined;
}

export function useStartRun(workflow: Workflow): StartRunViewModel {
  const workflowId = workflow.id;
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const withRepository = useFeature('workflows.deliver.v1');
  const mutation = useMutation({
    mutationFn: async (start: RunStart) => {
      const inputs = inputsOf(workflow.inputs ?? [], start.inputs);
      const repository = start.repository.trim();
      return (
        await startWorkflowRun({
          path: { id: workflowId },
          body: { inputs, ...(withRepository && repository !== '' ? { repository } : {}) },
          throwOnError: true,
        })
      ).data;
    },
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
    canStart: viewer.canManage && runnable(workflow),
    acceptFirst: viewer.canManage && workflow.status === 'proposed',
    rejected: workflow.status === 'rejected',
    withRepository,
    start: (start) => {
      mutate(start);
    },
    starting: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}

/** A run under way is read again every few seconds: there is no event feed to tell the console it moved yet. */
export const RUN_POLL_MS = 5_000;

export interface RunViewModel {
  readonly run: WorkflowRun | undefined;
  readonly failure: Error | undefined;
  /** The workflow the run is of, as it is now: where the deliverable of the current step is read. */
  readonly workflow: Workflow | undefined;
  /** Whoever started the run, or an owner or an admin, ends it. */
  readonly canCancel: boolean;
  /** The caller started the run: only them hand in what an agent step was asked for. */
  readonly isStarter: boolean;
}

export function useRun(id: string): RunViewModel {
  const poll = pollUnlessRefused(RUN_POLL_MS);
  const query = useQuery(
    ready(getRunOptions({ path: { id } }), {
      refetchInterval: (polled) => (isOver(polled.state.data) ? false : poll(polled)),
    }),
  );
  const run = query.data;
  const workflow = useQuery(
    ready(getWorkflowOptions({ path: { id: run?.workflowId ?? '' } }), {
      enabled: run !== undefined,
      retry: false,
      staleTime: 30_000,
    }),
  ).data;
  const viewer = useViewer();
  const isStarter = run !== undefined && viewer.login === run.startedBy;
  return {
    run,
    failure: run === undefined ? failureOf(query.error) : undefined,
    workflow,
    canCancel: run !== undefined && !finished(run) && (isStarter || viewer.canManage),
    isStarter,
  };
}

/** Whether a polled answer is a run that is over (anything else is not: read again). */
function isOver(data: unknown): boolean {
  const status: unknown = typeof data === 'object' && data !== null ? Reflect.get(data, 'status') : undefined;
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

export interface RunActionsViewModel {
  readonly cancel: () => void;
  readonly cancelling: boolean;
  readonly cancelFailure: Error | undefined;
  /** Hands in what the current step asked for: the typed text, checked first. Says whether it was sent. */
  readonly deliver: (text: string) => Delivery;
  readonly delivering: boolean;
  readonly deliverFailure: Error | undefined;
  /** The delivery was taken: the form goes, the run moves on. */
  readonly delivered: boolean;
}

export function useRunActions(run: WorkflowRun, workflow: Workflow | undefined): RunActionsViewModel {
  const queryClient = useQueryClient();
  const settle = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getRunQueryKey({ path: { id: run.id } }) }),
      queryClient.invalidateQueries({ queryKey: listRunsInfiniteQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: listWorkflowRunsInfiniteQueryKey({ path: { id: run.workflowId } }),
      }),
    ]);
  };
  const cancel = useMutation({
    mutationFn: async () => (await cancelRun({ path: { id: run.id }, throwOnError: true })).data,
    onSettled: settle,
  });
  const deliver = useMutation({
    mutationFn: async (output: unknown) =>
      (await deliverRun({ path: { id: run.id }, body: { output }, throwOnError: true })).data,
    onSettled: settle,
  });
  const visit = deliveryVisit(run);
  const deliverable = visit === undefined ? undefined : deliverableOf(workflow, visit);
  const { mutate: cancelNow } = cancel;
  const { mutate: deliverNow } = deliver;
  return {
    cancel: () => {
      cancelNow();
    },
    cancelling: cancel.isPending,
    cancelFailure: failureOf(cancel.error),
    deliver: (text) => {
      const delivery = deliveryOf(deliverable, text);
      if (delivery.ok) deliverNow(delivery.output);
      return delivery;
    },
    delivering: deliver.isPending,
    deliverFailure: failureOf(deliver.error),
    delivered: deliver.isSuccess,
  };
}
