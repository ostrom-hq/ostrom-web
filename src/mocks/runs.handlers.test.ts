// SPDX-License-Identifier: AGPL-3.0-only
import { listRuns, listWorkflowRuns, startWorkflowRun } from '@gen/api/sdk.gen';
import type { WorkflowRun } from '@gen/api/types.gen';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

/** The status and error type of a refused call. */
async function refusalOf(call: () => Promise<unknown>): Promise<{ status: number | undefined; code: string | undefined }> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return { status: error.status, code: error.code };
    throw error;
  }
  return { status: 200, code: undefined };
}

function run(id: string, workflowId: string, startedAt: string, status: WorkflowRun['status']): WorkflowRun {
  return {
    id,
    workflowId,
    workflowName: workflowId,
    workflowVersion: 1,
    status,
    startedBy: 'lena',
    source: 'console',
    startedAt,
  };
}

describe('the runs, as the mock serves them', () => {
  it('lists every run of the organization, newest first', async () => {
    const { data } = await listRuns({ throwOnError: true });
    expect(data.items.map((item) => item.id)).toEqual([
      'run-backend-3',
      'run-migrations-1',
      'run-backend-2',
      'run-backend-1',
    ]);
    expect(data.next).toBeUndefined();
  });

  it('lists a workflow’s runs, and only its own', async () => {
    const { data } = await listWorkflowRuns({ path: { id: 'wf-backend' }, throwOnError: true });
    expect(data.items.map((item) => item.id)).toEqual(['run-backend-3', 'run-backend-2', 'run-backend-1']);
  });

  it('keeps the runs of a status when asked', async () => {
    const { data } = await listRuns({ query: { status: 'failed' }, throwOnError: true });
    expect(data.items.map((item) => item.id)).toEqual(['run-backend-1']);
  });

  it('serves fifty at a time, the next page after the last one read', async () => {
    db.workflowRuns = Array.from({ length: 51 }, (_, n) =>
      run(
        `run-${String(n).padStart(2, '0')}`,
        'wf-backend',
        new Date(Date.UTC(2026, 9, 20, 8, 0, 60 - n)).toISOString(),
        'succeeded',
      ),
    );
    const first = await listWorkflowRuns({ path: { id: 'wf-backend' }, throwOnError: true });
    expect(first.data.items).toHaveLength(50);
    expect(first.data.next).toBe('run-49');
    const second = await listRuns({ query: { before: 'run-49' }, throwOnError: true });
    expect(second.data.items.map((item) => item.id)).toEqual(['run-50']);
    expect(second.data.next).toBeUndefined();
  });

  it('says a workflow it does not know', async () => {
    expect(await refusalOf(() => listWorkflowRuns({ path: { id: 'wf-nope' }, throwOnError: true }))).toEqual({
      status: 404,
      code: 'not_found',
    });
    expect(
      await refusalOf(() =>
        startWorkflowRun({ path: { id: 'wf-nope' }, body: { inputs: {} }, throwOnError: true }),
      ),
    ).toEqual({ status: 404, code: 'not_found' });
  });

  it('starts a run for an owner: queued, by them, from the console, with its inputs', async () => {
    const { data, response } = await startWorkflowRun({
      path: { id: 'wf-backend' },
      body: { inputs: { branch: 'main' } },
      throwOnError: true,
    });
    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      workflowId: 'wf-backend',
      workflowName: 'Backend changes',
      workflowVersion: 7,
      status: 'queued',
      startedBy: 'maya',
      source: 'console',
      inputs: { branch: 'main' },
    });
    expect(db.workflowRuns[0]).toEqual(data);
  });

  it('refuses a run to a member, and of a workflow still proposed', async () => {
    expect(
      await refusalOf(() =>
        startWorkflowRun({ path: { id: 'wf-migrations' }, body: { inputs: {} }, throwOnError: true }),
      ),
    ).toEqual({ status: 409, code: 'conflict' });
    setDemoRole(db, 'member');
    expect(
      await refusalOf(() =>
        startWorkflowRun({ path: { id: 'wf-backend' }, body: { inputs: {} }, throwOnError: true }),
      ),
    ).toEqual({ status: 403, code: 'forbidden' });
  });
});
