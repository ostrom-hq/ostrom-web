// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkflowRun } from '@gen/api/types.gen';
import { zApiError, zListRunsResponse, zStartWorkflowRunResponse } from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import { initialWorkflowRuns } from '@/mocks/fixtures/runs';
import { initialWorkflows } from '@/mocks/fixtures/workflows';
import { createRunHandlers, type RunsState } from '@/mocks/runs';

const state: RunsState = { workflows: initialWorkflows(), workflowRuns: initialWorkflowRuns() };
let manager = true;
const handlers = createRunHandlers(
  () => state,
  () => manager,
  () => 'maya',
);

/** The handler's answer, without a socket. */
async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(handlers, new Request(`http://ostrom.test/api/v1${path}`, init));
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

/** A page of runs, as the contract reads it. */
async function list(path: string): Promise<{ ids: string[]; next: string | undefined }> {
  const { status, body } = await call(path);
  expect(status).toBe(200);
  const page = zListRunsResponse.parse(body);
  return { ids: page.items.map((run) => run.id), next: page.next };
}

/** A refusal's status and type. */
async function refused(path: string, init?: RequestInit): Promise<[number, string]> {
  const { status, body } = await call(path, init);
  return [status, zApiError.parse(body).error.type];
}

function start(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

/** The run a POST started. */
async function started(path: string, body: unknown): Promise<WorkflowRun> {
  const answer = await call(path, start(body));
  expect(answer.status).toBe(201);
  return zStartWorkflowRunResponse.parse(answer.body);
}

function finished(count: number): WorkflowRun[] {
  return Array.from({ length: count }, (_, n): WorkflowRun => ({
    id: `run-${String(n).padStart(2, '0')}`,
    workflowId: 'wf-backend',
    workflowName: 'Backend changes',
    workflowVersion: 7,
    status: 'succeeded',
    startedBy: 'lena',
    source: 'manual',
    startedAt: new Date(Date.UTC(2026, 9, 20, 8, 0, 59 - n)).toISOString(),
  }));
}

describe('the mock runs', () => {
  afterEach(() => {
    state.workflows = initialWorkflows();
    state.workflowRuns = initialWorkflowRuns();
    manager = true;
  });

  it('lists every run of the organization, newest first, and the last page has no `next`', async () => {
    expect(await list('/runs')).toEqual({
      ids: ['run-backend-3', 'run-migrations-1', 'run-backend-2', 'run-backend-1'],
      next: undefined,
    });
  });

  it('lists a workflow’s runs, and only its own', async () => {
    expect((await list('/workflows/wf-backend/runs')).ids).toEqual([
      'run-backend-3',
      'run-backend-2',
      'run-backend-1',
    ]);
  });

  it('keeps the runs of a status when asked, and refuses a status it does not know', async () => {
    expect((await list('/runs?status=failed')).ids).toEqual(['run-backend-1']);
    expect((await list('/workflows/wf-backend/runs?status=running')).ids).toEqual(['run-backend-3']);
    expect(await refused('/runs?status=done')).toEqual([400, 'invalid_request']);
    expect(await refused('/workflows/wf-backend/runs?status=done')).toEqual([400, 'invalid_request']);
  });

  it('serves fifty at a time, the next page after the last one read', async () => {
    state.workflowRuns = finished(51).toReversed();
    const first = await list('/workflows/wf-backend/runs');
    expect(first.ids).toHaveLength(50);
    expect(first.next).toBe('run-49');
    expect(await list('/runs?before=run-49')).toEqual({ ids: ['run-50'], next: undefined });
  });

  it('says a workflow it does not know', async () => {
    expect(await refused('/workflows/wf-nope/runs')).toEqual([404, 'not_found']);
    expect(await refused('/workflows/wf-nope/runs', start({ inputs: {} }))).toEqual([404, 'not_found']);
  });

  it('starts a run for an owner: queued, by them, by hand, with its inputs, first in the list', async () => {
    const run = await started('/workflows/wf-backend/runs', { inputs: { branch: 'main' } });
    expect(run).toMatchObject({
      workflowId: 'wf-backend',
      workflowName: 'Backend changes',
      workflowVersion: 7,
      status: 'queued',
      startedBy: 'maya',
      source: 'manual',
      inputs: { branch: 'main' },
    });
    expect(run.id).toMatch(/^wfr_[0-9a-f]{32}$/);
    expect(state.workflowRuns[0]).toEqual(run);
  });

  it('starts a run with no inputs, and of a workflow with no version as its first', async () => {
    for (const workflow of state.workflows) delete workflow.version;
    expect(await started('/workflows/wf-backend/runs', {})).toMatchObject({ inputs: {}, workflowVersion: 1 });
  });

  it('refuses a run to a member, of a workflow still proposed, and a body that is not a run', async () => {
    expect(await refused('/workflows/wf-migrations/runs', start({ inputs: {} }))).toEqual([
      409,
      'workflow_not_accepted',
    ]);
    expect(await refused('/workflows/wf-backend/runs', start({ inputs: 'main' }))).toEqual([
      400,
      'invalid_request',
    ]);
    manager = false;
    expect(await refused('/workflows/wf-backend/runs', start({ inputs: {} }))).toEqual([403, 'forbidden']);
    expect(state.workflowRuns).toHaveLength(4);
  });
});
