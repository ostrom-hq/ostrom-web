// SPDX-License-Identifier: Apache-2.0
import type { WorkflowRun } from '@gen/api/types.gen';
import { zApiError, zListRunsResponse, zStartWorkflowRunResponse } from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import type { z } from 'zod';
import { initialWorkflowRuns } from '@/mocks/fixtures/runs';
import { initialWorkflows } from '@/mocks/fixtures/workflows';
import { createRunHandlers, type RunsState } from '@/mocks/runs';

const state: RunsState = { workflows: initialWorkflows(), workflowRuns: initialWorkflowRuns() };
let manager = true;
const handlers = createRunHandlers(
  () => state,
  () => manager,
  () => 'maya',
  () => new Date('2026-11-03T09:00:00.000Z'),
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
async function started(path: string, body: unknown): Promise<z.infer<typeof zStartWorkflowRunResponse>> {
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
      ids: [
        'run-release-2',
        'run-backend-3',
        'run-migrations-1',
        'run-backend-2',
        'run-backend-1',
        'run-release-1',
      ],
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
    expect((await list('/runs?status=failed')).ids).toEqual(['run-backend-1', 'run-release-1']);
    expect((await list('/runs?workflow=wf-release')).ids).toEqual(['run-release-2', 'run-release-1']);
    expect((await list('/runs?all=true')).ids).toHaveLength(6);
    expect((await list('/workflows/wf-backend/runs?status=running')).ids).toEqual(['run-backend-3']);
    expect(await refused('/runs?status=done')).toEqual([400, 'invalid_request']);
    manager = false;
    expect(await refused('/runs?all=true')).toEqual([403, 'forbidden']);
    manager = true;
    expect(await refused('/workflows/wf-backend/runs?status=done')).toEqual([400, 'invalid_request']);
  });

  it('serves fifty at a time, the next page after the last one read', async () => {
    state.workflowRuns = finished(51).toReversed();
    const first = await list('/workflows/wf-backend/runs');
    expect(first.ids).toHaveLength(50);
    expect(first.next).toBe('run-49');
    expect(await list('/runs?before=run-49')).toEqual({ ids: ['run-50'], next: undefined });
    expect(await list('/runs?before=run-gone')).toEqual({ ids: [], next: undefined });
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
      startedAt: '2026-11-03T09:00:00.000Z',
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
    expect(await refused('/workflows/wf-legacy/runs', start({ inputs: {} }))).toEqual([
      409,
      'workflow_not_accepted',
    ]);
    expect(await refused('/workflows/wf-backend/runs', start({ inputs: 'main' }))).toEqual([
      400,
      'invalid_request',
    ]);
    const notJson = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' };
    expect(await refused('/workflows/wf-backend/runs', notJson)).toEqual([400, 'invalid_request']);
    manager = false;
    expect(await refused('/workflows/wf-backend/runs', start({ inputs: {} }))).toEqual([403, 'forbidden']);
    expect(state.workflowRuns).toHaveLength(6);
  });

  it('keeps the repository a run was started with', async () => {
    expect(await started('/workflows/wf-release/runs', { repository: 'acme/api' })).toMatchObject({
      repository: 'acme/api',
    });
  });

  it('reads a run, and says one it does not know', async () => {
    expect((await call('/runs/run-release-2')).body).toMatchObject({ id: 'run-release-2' });
    expect(await refused('/runs/run-nope')).toEqual([404, 'not_found']);
  });

  const post = (): RequestInit => ({ method: 'POST' });

  it('cancels a run for its starter or a manager, and not one that is over', async () => {
    expect((await call('/runs/run-release-2/cancel', post())).body).toMatchObject({
      status: 'cancelled',
      endedAt: '2026-11-03T09:00:00.000Z',
    });
    expect(state.workflowRuns.find((run) => run.id === 'run-release-2')?.status).toBe('cancelled');
    expect(await refused('/runs/run-release-2/cancel', post())).toEqual([409, 'run_finished']);
    expect(await refused('/runs/run-nope/cancel', post())).toEqual([404, 'not_found']);
    manager = false;
    expect(await refused('/runs/run-migrations-1/cancel', post())).toEqual([403, 'forbidden']);
  });

  it('takes the delivery of the starter, on the host the step asks for', async () => {
    const path = '/runs/run-release-2/deliver';
    expect(await refused(path, start({}))).toEqual([400, 'invalid_request']);
    expect(await refused(path, start({ output: 'nope' }))).toEqual([400, 'invalid_deliverable']);
    expect(await refused(path, start({ output: { a: 1 } }))).toEqual([400, 'invalid_deliverable']);
    expect(await refused(path, start({ output: 'https://gitlab.com/a/b' }))).toEqual([
      400,
      'invalid_deliverable',
    ]);
    const done = await call(path, start({ output: 'https://github.com/acme/api/pull/1' }));
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: 'succeeded',
      output: 'https://github.com/acme/api/pull/1',
      visits: [{ status: 'done' }, { status: 'done', endedAt: '2026-11-03T09:00:00.000Z' }],
    });
    expect(await refused(path, start({ output: 'https://github.com/a/b' }))).toEqual([
      409,
      'nothing_to_deliver',
    ]);
  });

  it('takes a json or a text where the step asks for one', async () => {
    const node = state.workflows.find((flow) => flow.id === 'wf-release')?.nodes[1];
    if (node?.run === undefined) throw new Error('no agent step');
    node.run.deliverable = { type: 'json' };
    expect((await call('/runs/run-release-2/deliver', start({ output: { a: 1 } }))).body).toMatchObject({
      output: '{"a":1}',
    });
    state.workflowRuns = initialWorkflowRuns();
    node.run.deliverable = { type: 'text' };
    expect((await call('/runs/run-release-2/deliver', start({ output: 'done' }))).body).toMatchObject({
      output: 'done',
    });
  });

  it('refuses a delivery to another person, to an unknown run, and where nothing is asked', async () => {
    expect(await refused('/runs/run-nope/deliver', start({ output: 'x' }))).toEqual([404, 'not_found']);
    expect(await refused('/runs/run-backend-3/deliver', start({ output: 'x' }))).toEqual([
      409,
      'nothing_to_deliver',
    ]);
    expect(await refused('/runs/run-backend-3/deliver', start({ output: 'x' }))).toEqual([
      409,
      'nothing_to_deliver',
    ]);
    expect(await refused('/runs/run-release-1/deliver', start({ output: 'x' }))).toEqual([403, 'forbidden']);
  });
});
