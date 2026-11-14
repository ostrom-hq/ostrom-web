// SPDX-License-Identifier: Apache-2.0
import { zApiError, zWorkflowSettings } from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import { createWorkflowSettingsHandlers, type WorkflowSettingsState } from '@/mocks/workflowSettings';

const state: WorkflowSettingsState = { workflowEditors: { mode: 'admins' } };
let manager = true;
const handlers = createWorkflowSettingsHandlers(
  () => state,
  () => manager,
);

async function call(method: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request('http://ostrom.test/api/v1/workflows/settings', {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

describe('the mock workflow settings', () => {
  afterEach(() => {
    state.workflowEditors = { mode: 'admins' };
    manager = true;
  });

  it('says who decides, and whether the caller may', async () => {
    expect(zWorkflowSettings.parse((await call('GET')).body)).toEqual({
      editors: { mode: 'admins' },
      canEdit: true,
    });
    manager = false;
    expect((await call('GET')).body).toMatchObject({ canEdit: false });
    state.workflowEditors = { mode: 'all' };
    expect((await call('GET')).body).toMatchObject({ canEdit: true });
  });

  it('changes it for an owner or an admin, keeping the members only in members mode', async () => {
    expect(await call('PUT', { mode: 'members', memberIds: ['lena'] })).toEqual({
      status: 200,
      body: { editors: { mode: 'members', memberIds: ['lena'] }, canEdit: true },
    });
    expect(state.workflowEditors).toEqual({ mode: 'members', memberIds: ['lena'] });
    expect((await call('PUT', { mode: 'members' })).body).toMatchObject({
      editors: { mode: 'members', memberIds: [] },
    });
    expect((await call('PUT', { mode: 'all', memberIds: ['lena'] })).body).toMatchObject({
      editors: { mode: 'all' },
    });
    expect(state.workflowEditors).toEqual({ mode: 'all' });
  });

  it('refuses a member, an unknown mode and a body that is not settings', async () => {
    expect(zApiError.parse((await call('PUT', { mode: 'nobody' })).body).error.type).toBe('invalid_request');
    expect((await call('PUT', '{')).status).toBe(400);
    manager = false;
    expect(await call('PUT', { mode: 'all' })).toMatchObject({ status: 403 });
    expect(state.workflowEditors).toEqual({ mode: 'admins' });
  });
});
