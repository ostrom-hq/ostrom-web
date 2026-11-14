// SPDX-License-Identifier: Apache-2.0
import {
  handleCancelRun,
  handleDeliverRun,
  handleGetRun,
  handleListRuns,
  handleListWorkflowRuns,
  handleStartWorkflowRun,
} from '@gen/api/msw.gen';
import type { Workflow, WorkflowRun } from '@gen/api/types.gen';
import { zDeliverRequest, zStartWorkflowRunBody } from '@gen/api/zod.gen';
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

function isOver(run: WorkflowRun): boolean {
  return run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled';
}

export interface RunsState {
  workflows: Workflow[];
  workflowRuns: WorkflowRun[];
}

/** Newest first, the runs after `before` (a run id, the `next` of the page before), fifty at a time. */
function page(runs: readonly WorkflowRun[], url: URL): { items: WorkflowRun[]; next?: string } {
  const status = url.searchParams.get('status');
  const workflow = url.searchParams.get('workflow');
  const before = url.searchParams.get('before');
  const sorted = runs
    .filter((run) => status === null || run.status === status)
    .filter((run) => workflow === null || run.workflowId === workflow)
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
  const runOf = (id: string): WorkflowRun | undefined => state().workflowRuns.find((item) => item.id === id);
  const replace = (run: WorkflowRun): void => {
    const s = state();
    s.workflowRuns = s.workflowRuns.map((item) => (item.id === run.id ? run : item));
  };
  /** A status the contract does not name is refused, as the server does. */
  const badStatus = (url: URL): boolean => {
    const status = url.searchParams.get('status');
    return status !== null && !STATUSES.has(status);
  };
  return [
    handleListRuns(({ request }) => {
      const url = new URL(request.url);
      if (badStatus(url)) return refusal(400, 'invalid_request', 'not a run status');
      if (url.searchParams.get('all') === 'true' && !manages(request))
        return refusal(403, 'forbidden', 'Only owners and admins read every member’s runs.');
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
      if (workflow.status === 'rejected')
        return refusal(409, 'workflow_not_accepted', 'A rejected workflow does not run.');
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
        ...(body.data.repository === undefined ? {} : { repository: body.data.repository }),
        startedAt: now().toISOString(),
      };
      state().workflowRuns.unshift(run);
      return HttpResponse.json(run, { status: 201 });
    }),
    handleGetRun(({ params }) => {
      const run = runOf(params.id);
      return run === undefined ? refusal(404, 'not_found', 'run not found') : HttpResponse.json(run);
    }),
    // Whoever started a run, an owner or an admin ends it; a run already over is a 409, as the server says.
    handleCancelRun(({ request, params }) => {
      const run = runOf(params.id);
      if (run === undefined) return refusal(404, 'not_found', 'run not found');
      if (run.startedBy !== login() && !manages(request))
        return refusal(403, 'forbidden', 'Only its starter, an owner or an admin ends a run.');
      if (isOver(run)) return refusal(409, 'run_finished', 'The run is already over.');
      const ended = { ...run, status: 'cancelled', endedAt: now().toISOString() };
      replace(ended);
      return HttpResponse.json(ended);
    }),
    // Only the starter hands in what the open agent step asks for, checked as the server checks it.
    handleDeliverRun(async ({ params, request }) => {
      const run = runOf(params.id);
      if (run === undefined) return refusal(404, 'not_found', 'run not found');
      if (run.startedBy !== login())
        return refusal(403, 'forbidden', 'Only the person who started the run delivers.');
      const visits = run.visits ?? [];
      const visit = visits.findLast((item) => item.endedAt === undefined && item.kind === 'agent');
      const deliverable = workflowOf(run.workflowId)?.nodes.find((node) => node.id === visit?.nodeId)?.run
        ?.deliverable;
      if (isOver(run) || visit === undefined || deliverable === undefined)
        return refusal(409, 'nothing_to_deliver', 'No step of this run waits for a delivery.');
      const body = zDeliverRequest.safeParse(await readJson(request));
      if (!body.success || body.data.output === undefined)
        return refusal(400, 'invalid_request', 'an output is needed');
      const { output } = body.data;
      if (typeof output !== 'string' && deliverable.type !== 'json')
        return refusal(400, 'invalid_deliverable', `The deliverable is ${deliverable.type}.`);
      const written = typeof output === 'string' ? output : JSON.stringify(output);
      if (deliverable.type === 'url') {
        const host = URL.canParse(written) ? new URL(written).host : '';
        const wanted = deliverable.domain;
        if (host === '' || (wanted !== undefined && host !== wanted && !host.endsWith(`.${wanted}`)))
          return refusal(400, 'invalid_deliverable', 'The address is not on the expected domain.');
      }
      const at = now().toISOString();
      const done = {
        ...run,
        status: 'succeeded',
        output: written,
        endedAt: at,
        visits: visits.map((item) =>
          item.seq === visit.seq ? { ...item, status: 'done', endedAt: at } : item,
        ),
      };
      replace(done);
      return HttpResponse.json(done);
    }),
  ];
}
