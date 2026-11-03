// SPDX-License-Identifier: AGPL-3.0-only
import { handleListRuns, handleListWorkflowRuns, handleStartWorkflowRun } from '@gen/api/msw.gen';
import type { Workflow, WorkflowRun } from '@gen/api/types.gen';
import { zStartWorkflowRunBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

/** A page of runs, as the server serves them. */
export const RUNS_PAGE = 50;
const STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
]);

export interface RunsState {
  workflows: Workflow[];
  workflowRuns: WorkflowRun[];
}

/** Newest first, the runs after `before` (a run id, the `next` of the page before), fifty at a time. */
function page(runs: readonly WorkflowRun[], url: URL): { items: WorkflowRun[]; next?: string } {
  const status = url.searchParams.get('status');
  const before = url.searchParams.get('before');
  const sorted = runs
    .filter((run) => status === null || run.status === status)
    .toSorted((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const after = before === null ? -1 : sorted.findIndex((run) => run.id === before);
  // A `before` that names no run of the list has nothing after it, never the first page again.
  if (before !== null && after === -1) return { items: [] };
  const from = after + 1;
  const items = sorted.slice(from, from + RUNS_PAGE);
  const last = items.at(-1);
  return from + RUNS_PAGE < sorted.length && last !== undefined ? { items, next: last.id } : { items };
}

/**
 * The runs of the organization's workflows, served from memory as ostrom-server serves them (JOURNAL, WORKFLOW-RUNS,
 * 03/11): anyone in the organization reads them; owners and admins start one, of a workflow the organization accepted,
 * and it stays `queued` until the server has an engine that walks it.
 */
export function createRunHandlers(
  state: () => RunsState,
  manages: (request: Request) => boolean,
  login: () => string,
  now: () => Date,
): HttpHandler[] {
  const workflowOf = (id: string): Workflow | undefined => state().workflows.find((item) => item.id === id);
  /** A status the contract does not name is refused, as the server does. */
  const badStatus = (url: URL): boolean => {
    const status = url.searchParams.get('status');
    return status !== null && !STATUSES.has(status);
  };
  return [
    handleListRuns(({ request }) => {
      const url = new URL(request.url);
      if (badStatus(url)) return refusal(400, 'invalid_request', 'not a run status');
      return HttpResponse.json(page(state().workflowRuns, url));
    }),
    handleListWorkflowRuns(({ request, params }) => {
      const url = new URL(request.url);
      if (badStatus(url)) return refusal(400, 'invalid_request', 'not a run status');
      if (workflowOf(params.id) === undefined) return refusal(404, 'not_found', 'workflow not found');
      const own = state().workflowRuns.filter((run) => run.workflowId === params.id);
      return HttpResponse.json(page(own, url));
    }),
    handleStartWorkflowRun(async ({ request, params }) => {
      const workflow = workflowOf(params.id);
      if (workflow === undefined) return refusal(404, 'not_found', 'workflow not found');
      if (!manages(request)) return refusal(403, 'forbidden', 'Only owners and admins run workflows.');
      if (workflow.status === 'proposed')
        return refusal(409, 'workflow_not_accepted', 'Accept the workflow before running it.');
      const body = zStartWorkflowRunBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'not a run');
      const run: WorkflowRun = {
        id: `wfr_${crypto.randomUUID().replaceAll('-', '')}`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowVersion: workflow.version ?? 1,
        status: 'queued',
        startedBy: login(),
        source: 'manual',
        inputs: body.data.inputs ?? {},
        startedAt: now().toISOString(),
      };
      state().workflowRuns.unshift(run);
      return HttpResponse.json(run, { status: 201 });
    }),
  ];
}
